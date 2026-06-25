/*
 * Copyright (c) 2019 - present Adobe. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

/* eslint max-len: ["error", { "code": 200 }]*/
define(function (require, exports, module) {


    let _ = require("thirdparty/lodash");

    let Commands = require("command/Commands"),
        AppInit = require("utils/AppInit"),
        CommandManager = require("command/CommandManager"),
        EditorManager = require("editor/EditorManager"),
        Menus = require("command/Menus"),
        Strings = require("strings"),
        WorkspaceManager  = require("view/WorkspaceManager"),
        ProviderRegistrationHandler = require("features/PriorityBasedRegistration").RegistrationHandler;


    /** @const {string} Show Function Hint command ID */
    let SHOW_PARAMETER_HINT_CMD_ID = "showParameterHint", // string must MATCH string in native code (brackets_extensions)
        hintContainerHTML = require("text!htmlContent/parameter-hint-template.html"),
        KeyboardPrefs = {
            "showParameterHint": [
                {
                    "key": "Ctrl-Shift-Space"
                },
                {
                    "key": "Ctrl-Shift-Space",
                    "platform": "mac"
                }
            ]
        };

    let $hintContainer, // function hint container
        $hintScroll, // single-line clipping/scrolling layer
        $hintContent, // function hint content holder
        hintState = {},
        lastChar = null,
        sessionEditor = null,
        keyDownEditor = null;

    // Constants
    let POINTER_TOP_OFFSET = 4, // Size of margin + border of hint.
        POSITION_BELOW_OFFSET = 4; // Amount to adjust to top position when the preview bubble is below the text

    // keep jslint from complaining about handleCursorActivity being used before
    // it was defined.
    let handleCursorActivity,
        popupShown = false,
        // Monotonic id so a slow LSP response from an earlier caret position can be ignored
        // once a newer cursor move has fired a fresh request.
        pendingRequestId = 0;

    /**
     * A stable identity for the function being called (its parameter list), independent of which
     * parameter the caret is currently in. Used to keep the popup anchored while only the active
     * parameter changes.
     * @param {{parameters: Array}} hint
     * @return {string}
     */
    function _signatureKey(hint) {
        return (hint.parameters || []).map(function (p) {
            return p.label || p.type || "";
        }).join(",");
    }

    let _providerRegistrationHandler = new ProviderRegistrationHandler(),
        registerHintProvider = _providerRegistrationHandler.registerProvider.bind(_providerRegistrationHandler),
        removeHintProvider = _providerRegistrationHandler.removeProvider.bind(_providerRegistrationHandler);

    /**
     * Keep the active parameter visible inside the single-line, width-capped popup: scroll it
     * into view (centered) when the signature overflows, and fade whichever edge is clipped so
     * it's clear there's more of the signature off-screen.
     */
    function _revealCurrentParameter() {
        let el = $hintScroll && $hintScroll[0];
        if (!el) {
            return;
        }
        let maxScroll = el.scrollWidth - el.clientWidth;
        let $cur = $hintContent.find(".current-parameter");
        if (maxScroll > 0 && $cur.length) {
            let elRect = el.getBoundingClientRect(),
                curRect = $cur[0].getBoundingClientRect(),
                curLeftInContent = (curRect.left - elRect.left) + el.scrollLeft,
                target = curLeftInContent - (el.clientWidth - curRect.width) / 2;
            el.scrollLeft = Math.max(0, Math.min(target, maxScroll));
        }
        $hintScroll.toggleClass("fade-left", el.scrollLeft > 1);
        $hintScroll.toggleClass("fade-right", el.scrollLeft < maxScroll - 1);
    }

    /**
     * Position a function hint.
     *
     * @param {number} xpos
     * @param {number} ypos
     * @param {number} ybot
     */
    function positionHint(xpos, ypos, ybot) {
        let $editorHolder = $("#editor-holder"),
            editorLeft;

        if ($editorHolder.offset() === undefined) {
            // this happens in jasmine tests that run
            // without a windowed document.
            return;
        }

        editorLeft = $editorHolder.offset().left;

        // Cap the popup to the editor width so a long signature can never run off-screen (and
        // underneath the central control bar). The signature stays on one line and scrolls.
        let maxWidth = Math.min(700, $editorHolder.width() - 24);
        $hintContainer.css("max-width", maxWidth + "px");
        _revealCurrentParameter();

        let hintWidth = $hintContainer.outerWidth(),
            hintHeight = $hintContainer.outerHeight(),
            top = ypos - hintHeight - POINTER_TOP_OFFSET,
            left = xpos;

        // Clamp within the editor area: never left of the editor (keeps it clear of the CCB),
        // never past the right edge.
        left = Math.min(left, editorLeft + $editorHolder.width() - hintWidth);
        left = Math.max(left, editorLeft);

        if (top < 0) {
            $hintContainer.removeClass("preview-bubble-above");
            $hintContainer.addClass("preview-bubble-below");
            top = ybot + POSITION_BELOW_OFFSET;
            $hintContainer.offset({
                left: left,
                top: top
            });
        } else {
            $hintContainer.removeClass("preview-bubble-below");
            $hintContainer.addClass("preview-bubble-above");
            $hintContainer.offset({
                left: left,
                top: top - POINTER_TOP_OFFSET
            });
        }
    }

    /**
     * Format the given parameter array. Handles separators between
     * parameters, syntax for optional parameters, and the order of the
     * parameter type and parameter name.
     *
     * @param editor
     * @param {!Array.<{name: string, type: string, isOptional: boolean}>} params -
     * array of parameter descriptors
     * @param {function(string)=} appendSeparators - callback function to append separators.
     * The separator is passed to the callback.
     * @param {function(string, string, number)=} appendParameter - callback function to append parameter.
     * The formatted parameter type and name is passed to the callback along with the
     * current index of the parameter.
     * @param {boolean=} typesOnly - only show parameter types. The
     * default behavior is to include both parameter names and types.
     * @return {string} - formatted parameter hint
     */
    function _formatParameterHint(functionName, params, appendSeparators, appendParameter, typesOnly) {
        let result = "",
            pendingOptional = false;

        appendParameter(`${functionName}(`, "", -1);
        params.forEach(function (value, i) {
            let param = value.label || value.type,
                documentation = value.documentation,
                separators = "";

            if (value.isOptional) {
                // if an optional param is following by an optional parameter, then
                // terminate the bracket. Otherwise enclose a required parameter
                // in the same bracket.
                if (pendingOptional) {
                    separators += "]";
                }

                pendingOptional = true;
            }

            if (i > 0) {
                separators += ", ";
            }

            if (value.isOptional) {
                separators += "[";
            }

            if (appendSeparators) {
                appendSeparators(separators);
            }

            result += separators;

            if (!typesOnly && value.name) {
                param += " " + value.name;
            }

            if (appendParameter) {
                appendParameter(param, documentation, i);
            }

            result += param;

        });

        if (pendingOptional) {
            if (appendSeparators) {
                appendSeparators("]");
            }

            result += "]";
        }
        appendParameter(")", "", -1);

        return result;
    }

    /**
     *  Bold the parameter at the caret.
     *
     *  @param {{inFunctionCall: boolean, functionCallPos: {line: number, ch: number}}} functionInfo -
     *  tells if the caret is in a function call and the position
     *  of the function call.
     */
    function _formatHint(editor, hints) {
        $hintContent.empty();
        $hintContent.addClass("brackets-hints");

        function appendSeparators(separators) {
            $hintContent.append(separators);
        }

        function appendParameter(param, documentation, index) {
            if (hints.currentIndex === index) {
                $hintContent.append($("<span>")
                    .append(_.escape(param))
                    .addClass("current-parameter"));
            } else {
                $hintContent.append($("<span>")
                    .append(_.escape(param))
                    .addClass("parameter"));
            }
        }

        if (hints.parameters.length > 0) {
            let token = editor.getToken(hints.functionCallPos);
            _formatParameterHint(token.string, hints.parameters, appendSeparators, appendParameter);
        } else {
            $hintContent.append(_.escape(Strings.NO_ARGUMENTS));
        }
    }

    /**
     * Dismiss the function hint.
     *
     */
    function dismissHint(editor) {
        popupShown = false;
        // Invalidate any in-flight request so a late response can't re-show a dismissed popup.
        pendingRequestId++;
        if (hintState.visible) {
            $hintContainer.hide();
            $hintContent.empty();
            hintState = {};

            if (editor) {
                editor.off("cursorActivity.ParameterHinting", handleCursorActivity);
                sessionEditor = null;
            } else if (sessionEditor) {
                sessionEditor.off("cursorActivity.ParameterHinting", handleCursorActivity);
                sessionEditor = null;
            }
        }
    }

    /**
     * Pop up a function hint on the line above the caret position.
     *
     * @param {object=} editor - current Active Editor
     * @param {boolean} True if hints are invoked through cursor activity.
     * @return {jQuery.Promise} - The promise will not complete until the
     *      hint has completed. Returns null, if the function hint is already
     *      displayed or there is no function hint at the cursor.
     *
     */
    function popUpHint(editor, explicit, onCursorActivity) {
        let request = null;
        let $deferredPopUp = $.Deferred();
        let sessionProvider = null;

        popupShown = true;
        // Find a suitable provider, if any
        let language = editor.getLanguageForSelection(),
            enabledProviders = _providerRegistrationHandler.getProvidersForLanguageId(language.getId());

        enabledProviders.some(function (item, index) {
            if (item.provider.hasParameterHints(editor, lastChar)) {
                sessionProvider = item.provider;
                return true;
            }
        });

        if (sessionProvider) {
            request = sessionProvider.getParameterHints(explicit, onCursorActivity);
        }

        // No hint at the caret (no provider, or none available here) - take down any existing popup.
        if (!request) {
            dismissHint(editor);
            return $deferredPopUp;
        }

        let requestId = ++pendingRequestId;

        request.done(function (parameterHint) {
            // A newer cursor move already fired a fresh request; drop this stale response.
            if (requestId !== pendingRequestId) {
                return;
            }

            let signature = _signatureKey(parameterHint),
                renderKey = parameterHint.currentIndex + "|" + signature;

            // Already showing this exact signature with this exact active parameter: leave the
            // popup untouched. Moving the caret within one parameter must not dismiss+redraw it
            // (that is what made arrow-key presses flicker).
            if (hintState.visible && hintState.renderKey === renderKey) {
                $deferredPopUp.resolveWith(null);
                return;
            }

            _formatHint(editor, parameterHint);
            $hintContainer.show(); // no-op when already visible -> content updates in place, no blink

            if (hintState.visible && hintState.signature === signature && hintState.anchor) {
                // Same call, just a different active parameter: keep the popup anchored where it
                // is and only let the highlight move (positionHint re-reveals the active param).
                positionHint(hintState.anchor.left, hintState.anchor.top, hintState.anchor.bottom);
            } else {
                let cm = editor._codeMirror,
                    pos = parameterHint.functionCallPos || editor.getCursorPos();
                pos = cm.charCoords(pos);
                positionHint(pos.left, pos.top, pos.bottom);
                hintState.anchor = pos;
                hintState.signature = signature;
            }

            hintState.visible = true;
            hintState.renderKey = renderKey;

            // Attach the cursor-tracking listener once per editor (not on every refresh).
            if (sessionEditor !== editor) {
                if (sessionEditor) {
                    sessionEditor.off("cursorActivity.ParameterHinting", handleCursorActivity);
                }
                sessionEditor = editor;
                editor.off("cursorActivity.ParameterHinting", handleCursorActivity);
                editor.on("cursorActivity.ParameterHinting", handleCursorActivity);
            }
            $deferredPopUp.resolveWith(null);
        }).fail(function () {
            // The caret moved off the call (or the request failed) - dismiss, unless a newer
            // request has since taken over.
            if (requestId === pendingRequestId) {
                dismissHint(editor);
            }
        });

        return $deferredPopUp;
    }

    /**
     *  Show the parameter the cursor is on in bold when the cursor moves.
     *  Dismiss the pop up when the cursor moves off the function.
     */
    handleCursorActivity = function (event, editor) {
        if (editor) {
            popUpHint(editor, false, true);
        } else {
            dismissHint();
        }
    };

    /**
     * Install function hint listeners.
     *
     * @param {Editor} editor - editor context on which to listen for
     *      changes
     */
    function installListeners(editor) {
        editor.on("scroll.ParameterHinting", function () {
            dismissHint(editor);
        })
            .on("editorChange.ParameterHinting", _handleChange)
            .on("keypress.ParameterHinting", _handleKeypressEvent);
    }

    /**
     * Clean up after installListeners()
     * @param {!Editor} editor
     */
    function uninstallListeners(editor) {
        editor.off(".ParameterHinting");
    }

    function _handleKeypressEvent(jqEvent, editor, event) {
        keyDownEditor = editor;
        // Last inserted character, used later by handleChange
        lastChar = String.fromCharCode(event.charCode);
    }

    /**
     * Start a new implicit hinting session, or update the existing hint list.
     * Called by the editor after handleKeyEvent, which is responsible for setting
     * the lastChar.
     *
     * @param {Event} event
     * @param {Editor} editor
     * @param {{from: Pos, to: Pos, text: Array, origin: string}} changeList
     */
    function _handleChange(event, editor, changeList) {
        if (lastChar && (lastChar === '(' || lastChar === ',') && editor === keyDownEditor) {
            keyDownEditor = null;
            popUpHint(editor);
        }
    }

    function activeEditorChangeHandler(event, current, previous) {

        if (previous) {
            //Removing all old Handlers
            previous.document
                .off("languageChanged.ParameterHinting");
            uninstallListeners(previous);
        }

        if (current) {
            current.document
                .on("languageChanged.ParameterHinting", function () {
                    // If current doc's language changed, reset our state by treating it as if the user switched to a
                    // different document altogether
                    uninstallListeners(current);
                    installListeners(current);
                });
            installListeners(current);
        }
    }

    /**
     * Show a parameter hint in its own pop-up.
     *
     */
    function handleShowParameterHint() {
        let editor = EditorManager.getActiveEditor();
        // Pop up function hint
        popUpHint(editor, true, false);
    }

    function _handleEscapeKeyEvent() {
        if(popupShown){
            dismissHint();
            return true;
        }
        return false;
    }

    AppInit.appReady(function () {
        CommandManager.register(Strings.CMD_SHOW_PARAMETER_HINT, SHOW_PARAMETER_HINT_CMD_ID, handleShowParameterHint);

        // Add the menu items
        let menu = Menus.getMenu(Menus.AppMenuBar.EDIT_MENU);
        if (menu) {
            menu.addMenuItem(SHOW_PARAMETER_HINT_CMD_ID, KeyboardPrefs.showParameterHint, Menus.AFTER, Commands.SHOW_CODE_HINTS);
        }
        // Create the function hint container
        $hintContainer = $(hintContainerHTML).appendTo($("body"));
        $hintScroll = $hintContainer.find(".function-hint-scroll");
        $hintContent = $hintContainer.find(".function-hint-content-new");
        activeEditorChangeHandler(null, EditorManager.getActiveEditor(), null);

        EditorManager.on("activeEditorChange", activeEditorChangeHandler);

        CommandManager.on("beforeExecuteCommand", function (_event, commandId) {
            if (commandId !== SHOW_PARAMETER_HINT_CMD_ID &&
                commandId !== Commands.SHOW_CODE_HINTS) {
                dismissHint();
            }
        });
        WorkspaceManager.addEscapeKeyEventHandler("parameterHints", _handleEscapeKeyEvent);
    });

    exports.registerHintProvider = registerHintProvider;
    exports.removeHintProvider = removeHintProvider;
});
