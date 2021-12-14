/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/**
 * The bootstrapping module for brackets. This module sets up the require
 * configuration and loads the brackets module.
 */
require.config({
    paths: {
        "text": "thirdparty/text/text",
        "i18n": "thirdparty/i18n/i18n",

        // The file system implementation. Change this value to use different
        // implementations (e.g. cloud-based storage).
        "fileSystemImpl": "filesystem/impls/appshell/AppshellFileSystem",
        "preact-compat": "thirdparty/preact-compat/preact-compat.min",
        "preact": "thirdparty/preact/preact",

        // Extension loader plugins
        "extension-loader": "thirdparty/requirejs/extension-loader",
        "amd-loader": "thirdparty/requirejs/amd-loader"
    },
    map: {
        "*": {
            "thirdparty/CodeMirror2": "thirdparty/CodeMirror",
            "thirdparty/preact": "preact-compat",
            "view/PanelManager": "view/WorkspaceManager"  // For extension compatibility
        }
    }
});

if (window.location.search.indexOf("testEnvironment") > -1) {
    require.config({
        paths: {
            "preferences/PreferencesImpl": "../test/TestPreferencesImpl"
        },
        locale: "en" // force English (US)
    });
} else {
    /**
     * hack for r.js optimization, move locale to another config call
     *
     * Use custom brackets property until CEF sets the correct navigator.language
     * NOTE: When we change to navigator.language here, we also should change to
     * navigator.language in ExtensionLoader (when making require contexts for each
     * extension).
     */
    require.config({
        locale: window.localStorage.getItem("locale") || (typeof (brackets) !== "undefined" ? brackets.app.language : window.navigator.language)
    });
}

define(function (require) {


    // Load compatibility shims--these need to load early, be careful moving this
    require(["utils/Compatibility"], function () {
        // Load the brackets module. This is a self-running module that loads and runs the entire application.
        require(["brackets"]);
    });
});
