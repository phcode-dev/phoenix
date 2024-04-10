/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global path, jsPromise*/
//jshint-ignore:no-start

define(function (require, exports, module) {
    const livePreviewSettings    = require("text!./livePreviewSettings.html"),
        Dialogs             = require("widgets/Dialogs"),
        Strings = require("strings"),
        PreferencesManager = require("preferences/PreferencesManager"),
        Mustache            = require("thirdparty/mustache/mustache");

    const PREFERENCE_SHOW_LIVE_PREVIEW_PANEL = "showLivePreviewAtStartup",
        PREFERENCE_PROJECT_SERVER_URL = "projectLiveServerURL",
        PREFERENCE_PROJECT_SERVER_PATH = "projectLiveServerPath";
    PreferencesManager.definePreference(PREFERENCE_SHOW_LIVE_PREVIEW_PANEL, "boolean", true, {
        description: Strings.LIVE_DEV_SETTINGS_STARTUP
    });

    function showSettingsDialog() {
        const currentSettings = {};
        const $template       = $(Mustache.render(`${livePreviewSettings}`,
            {"settings": currentSettings, "Strings": Strings}));

        // Select the correct theme.
        const $livePreviewServerURL = $template.find("#livePreviewServerURL");
        const $showLivePreviewAtStartup = $template.find("#showLivePreviewAtStartupChk");
        const $serveRoot = $template.find("#serveRoot");
        const $serveRootLabel = $template.find("#serveRootLabel");
        $showLivePreviewAtStartup.prop('checked', PreferencesManager.get(PREFERENCE_SHOW_LIVE_PREVIEW_PANEL));

        function refreshValues() {
            if($livePreviewServerURL.val()){
                $serveRoot.removeClass("forced-hidden");
                $serveRootLabel.removeClass("forced-hidden");
            } else {
                $serveRoot.addClass("forced-hidden");
                $serveRootLabel.addClass("forced-hidden");
            }
        }

        $livePreviewServerURL.on("input", refreshValues);
        $livePreviewServerURL.val(PreferencesManager.getViewState(PREFERENCE_PROJECT_SERVER_URL,
            PreferencesManager.STATE_PROJECT_CONTEXT));
        $serveRoot.val(PreferencesManager.getViewState(PREFERENCE_PROJECT_SERVER_PATH,
            PreferencesManager.STATE_PROJECT_CONTEXT));
        refreshValues();
        Dialogs.showModalDialogUsingTemplate($template).done(function (id) {
            if (id === "save") {
                PreferencesManager.set(PREFERENCE_SHOW_LIVE_PREVIEW_PANEL, $showLivePreviewAtStartup.is(":checked"));
                PreferencesManager.setViewState(PREFERENCE_PROJECT_SERVER_URL, $livePreviewServerURL.val(),
                    PreferencesManager.STATE_PROJECT_CONTEXT);
                PreferencesManager.setViewState(PREFERENCE_PROJECT_SERVER_PATH, $serveRoot.val(),
                    PreferencesManager.STATE_PROJECT_CONTEXT);
            }
        });
    }

    function shouldShowLivePreviewAtStartup() {
        return PreferencesManager.get(PREFERENCE_SHOW_LIVE_PREVIEW_PANEL);
    }

    exports.showSettingsDialog = showSettingsDialog;
    exports.shouldShowLivePreviewAtStartup = shouldShowLivePreviewAtStartup;
});
