/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2014 - 2021 Adobe Systems Incorporated. All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

define(function (require, exports, module) {


    var _               = brackets.getModule("thirdparty/lodash"),
        AnimationUtils  = brackets.getModule("utils/AnimationUtils"),
        ExtensionUtils  = brackets.getModule("utils/ExtensionUtils"),
        Strings         = brackets.getModule("strings");

    var $span      = null,
        errorCount = 0,
        _attached  = false,
        _windowOnError,
        _consoleError,
        _consoleClear;

    ExtensionUtils.loadStyleSheet(module, "styles.css");

    function showDeveloperTools() {
        try {
            brackets.app.showDeveloperTools();
        } catch (err) {
            console.error(err);
        }
    }

    function handleClick(event) {
        if (event.shiftKey) {
            window.console.clear();
        } else {
            showDeveloperTools();
        }
    }

    function refreshIndicator() {
        // never show 0 errors
        if (!_attached || errorCount === 0) {
            // hide notifier if it was attached previously
            // but errorCount was cleared or it was disabled
            if ($span) {
                $span.parent().hide();
            }
            return;
        }

        // update span if it was created before
        if ($span) {
            $span.text(errorCount).parent().show();
            return;
        }

        // create the span
        $span = $("<span>").text(errorCount);
        $("<div>")
            .attr("id", "error-counter")
            .attr("title", Strings.CMD_SHOW_DEV_TOOLS + "\u2026")
            .text(Strings.ERRORS + ": ")
            .append($span)
            .on("click", handleClick)
            .insertBefore("#status-bar .spinner");
    }

    var blink = _.debounce(function () {
        AnimationUtils.animateUsingClass($span.parent()[0], "flash", 1500);
    }, 100);

    function incErrorCount() {
        errorCount++;
        blink();
        refreshIndicator();
    }

    function clearErrorCount() {
        errorCount = 0;
        refreshIndicator();
    }

    function attachFunctions() {
        if (_attached) {
            return;
        }

        _attached      = true;
        _windowOnError = window.onerror;
        _consoleError  = window.console.error;
        _consoleClear  = window.console.clear;

        // https://developer.mozilla.org/en-US/docs/Web/API/GlobalEventHandlers.onerror
        window.onerror = function (errorMsg, url, lineNumber) {
            incErrorCount();
            if (_windowOnError) {
                return _windowOnError(errorMsg, url, lineNumber);
            }
            // return false means that we didn't handle this error and it should run the default handler
            return false;
        };

        window.console.error = function () {
            incErrorCount();
            return _consoleError.apply(window.console, arguments);
        };

        window.console.clear = function () {
            clearErrorCount();
            return _consoleClear.apply(window.console, arguments);
        };
    }

    function detachFunctions() {
        if (!_attached) {
            return;
        }

        _attached            = false;
        window.onerror       = _windowOnError;
        window.console.error = _consoleError;
        window.console.clear = _consoleClear;
    }

    function toggle(bool) {
        if (bool) {
            attachFunctions();
        } else {
            detachFunctions();
        }
        refreshIndicator();
    }

    // Public API
    exports.toggle = toggle;

});
