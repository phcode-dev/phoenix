/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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

// @INCLUDE_IN_API_DOCS


/**
 * PreferencesDialogs
 *
 */
define(function (require, exports, module) {


    var Dialogs                = require("widgets/Dialogs"),
        ProjectManager         = require("project/ProjectManager"),
        StringUtils            = require("utils/StringUtils"),
        Strings                = require("strings"),
        SettingsDialogTemplate = require("text!htmlContent/project-settings-dialog.html"),
        Mustache               = require("thirdparty/mustache/mustache"),
        PathUtils              = require("thirdparty/path-utils/path-utils"),
        Metrics                = require("utils/Metrics");

    /**
     * Validate that text string is a valid base url which should map to a server folder
     * @param {string} url
     * @return {string} Empty string if valid, otherwise error string
     */
    function _validateBaseUrl(url) {
        var result = "";
        // Empty url means "no server mapping; use file directly"
        if (url === "") {
            return result;
        }

        var obj = PathUtils.parseUrl(url);
        if (!obj) {
            result = Strings.BASEURL_ERROR_UNKNOWN_ERROR;
        } else if (obj.href.search(/^(http|https):\/\//i) !== 0) {
            result = StringUtils.format(Strings.BASEURL_ERROR_INVALID_PROTOCOL, obj.href.substring(0, obj.href.indexOf("//")));
        } else if (obj.search !== "") {
            result = StringUtils.format(Strings.BASEURL_ERROR_SEARCH_DISALLOWED, obj.search);
        } else if (obj.hash !== "") {
            result = StringUtils.format(Strings.BASEURL_ERROR_HASH_DISALLOWED, obj.hash);
        } else {
            var index = url.search(/[ \^\[\]\{\}<>\\"\?]+/);
            if (index !== -1) {
                result = StringUtils.format(Strings.BASEURL_ERROR_INVALID_CHAR, url[index]);
            }
        }

        return result;
    }

    /**
     * Show a dialog that shows the project preferences
     * @param {string} baseUrl Initial value
     * @param {string} errorMessage Error to display
     * @return {Dialog} A Dialog object with an internal promise that will be resolved with the ID
     *      of the clicked button when the dialog is dismissed. Never rejected.
     */
    function showProjectPreferencesDialog(baseUrl, errorMessage) {
        var $baseUrlControl,
            dialog;

        // Title
        var projectName = "",
            projectRoot = ProjectManager.getProjectRoot(),
            title;
        if (projectRoot) {
            projectName = projectRoot.name;
        }
        title = StringUtils.format(Strings.PROJECT_SETTINGS_TITLE, projectName);

        var templateVars = {
            title: title,
            baseUrl: baseUrl,
            errorMessage: errorMessage,
            Strings: Strings
        };

        dialog = Dialogs.showModalDialogUsingTemplate(Mustache.render(SettingsDialogTemplate, templateVars));

        dialog.done(function (id) {
            if (id === Dialogs.DIALOG_BTN_OK) {
                var baseUrlValue = $baseUrlControl.val();
                var result = _validateBaseUrl(baseUrlValue);
                if (result === "") {
                    // Send analytics data when url is set in project settings
                    Metrics.countEvent(
                        Metrics.EVENT_TYPE.UI_DIALOG,
                        "projectSettings",
                        "Livepreview"
                    );
                    ProjectManager.setBaseUrl(baseUrlValue);
                } else {
                    // Re-invoke dialog with result (error message)
                    showProjectPreferencesDialog(baseUrlValue, result);
                }
            }
        });

        // Give focus to first control
        $baseUrlControl = dialog.getElement().find(".url");
        $baseUrlControl.focus();

        return dialog;
    }

    // For unit testing
    exports._validateBaseUrl                = _validateBaseUrl;

    exports.showProjectPreferencesDialog    = showProjectPreferencesDialog;
});
