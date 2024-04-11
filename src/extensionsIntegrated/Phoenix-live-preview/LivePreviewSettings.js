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
        ProjectManager        = require("project/ProjectManager"),
        Strings = require("strings"),
        utils = require('./utils'),
        FileSystem         = require("filesystem/FileSystem"),
        PreferencesManager = require("preferences/PreferencesManager"),
        EventDispatcher = require("utils/EventDispatcher"),
        Mustache            = require("thirdparty/mustache/mustache");

    EventDispatcher.makeEventDispatcher(exports);

    const FRAMEWORK_UNKNOWN = "unknown",
        FRAMEWORK_DOCUSAURUS = "Docusaurus";

    const EVENT_SERVER_CHANGED = "customServerChanged";

    const SUPPORTED_FRAMEWORKS = {};
    SUPPORTED_FRAMEWORKS[FRAMEWORK_DOCUSAURUS] = {configFile: "docusaurus.config.js", hotReloadSupported: true};

    const PREFERENCE_SHOW_LIVE_PREVIEW_PANEL = "livePreviewShowAtStartup",
        PREFERENCE_PROJECT_SERVER_ENABLED = "livePreviewUseDevServer",
        PREFERENCE_PROJECT_SERVER_URL = "livePreviewServerURL",
        PREFERENCE_PROJECT_SERVER_PATH = "livePreviewServerProjectPath",
        PREFERENCE_PROJECT_SERVER_HOT_RELOAD_SUPPORTED = "livePreviewHotReloadSupported",
        PREFERENCE_PROJECT_PREVIEW_FRAMEWORK = "livePreviewFramework";
    PreferencesManager.definePreference(PREFERENCE_PROJECT_SERVER_ENABLED, "boolean", false, {
        description: Strings.LIVE_DEV_SETTINGS_SERVER_PREFERENCE
    });
    PreferencesManager.definePreference(PREFERENCE_SHOW_LIVE_PREVIEW_PANEL, "boolean", true, {
        description: Strings.LIVE_DEV_SETTINGS_STARTUP_PREFERENCE
    });
    PreferencesManager.definePreference(PREFERENCE_PROJECT_SERVER_HOT_RELOAD_SUPPORTED, "boolean", null, {
        description: Strings.LIVE_DEV_SETTINGS_HOT_RELOAD_PREFERENCE
    });
    PreferencesManager.definePreference(PREFERENCE_PROJECT_SERVER_URL, "string", "", {
        description: Strings.LIVE_DEV_SETTINGS_SERVE_PREFERENCE
    });
    PreferencesManager.definePreference(PREFERENCE_PROJECT_SERVER_PATH, "string", "/", {
        description: Strings.LIVE_DEV_SETTINGS_SERVER_ROOT_PREF
    });
    PreferencesManager.definePreference(PREFERENCE_PROJECT_PREVIEW_FRAMEWORK, "string", null, {
        description: Strings.LIVE_DEV_SETTINGS_FRAMEWORK_PREFERENCES,
        values: Object.keys(SUPPORTED_FRAMEWORKS)
    });
    
    async function detectFramework($frameworkSelect, $hotReloadChk) {
        for(let framework of Object.keys(SUPPORTED_FRAMEWORKS)){
            const configFile = SUPPORTED_FRAMEWORKS[framework].configFile,
                hotReloadSupported = SUPPORTED_FRAMEWORKS[framework].hotReloadSupported;
            let filePath   = path.join(ProjectManager.getProjectRoot().fullPath, configFile);
            const exists = await FileSystem.existsAsync(filePath);
            if(exists){
                $frameworkSelect.val(framework);
                $hotReloadChk.prop('checked', hotReloadSupported);
                return;
            }
        }
        $frameworkSelect.val(FRAMEWORK_UNKNOWN);
        $hotReloadChk.prop('checked', false);
    }

    function _saveProjectPreferences(useCustomServer, liveServerURL, serveRoot, hotReloadSupported, framework) {
        PreferencesManager.set(PREFERENCE_PROJECT_SERVER_ENABLED, useCustomServer, PreferencesManager.PROJECT_SCOPE);
        PreferencesManager.set(PREFERENCE_PROJECT_SERVER_URL, liveServerURL, PreferencesManager.PROJECT_SCOPE);
        PreferencesManager.set(PREFERENCE_PROJECT_SERVER_PATH, serveRoot, PreferencesManager.PROJECT_SCOPE);
        PreferencesManager.set(PREFERENCE_PROJECT_SERVER_HOT_RELOAD_SUPPORTED, hotReloadSupported, PreferencesManager.PROJECT_SCOPE);
        if(framework !== FRAMEWORK_UNKNOWN) {
            PreferencesManager.set(PREFERENCE_PROJECT_PREVIEW_FRAMEWORK, framework, PreferencesManager.PROJECT_SCOPE);
        }
    }

    function showSettingsDialog() {
        return new Promise(resolve=>{
            const currentSettings = {};
            const $template       = $(Mustache.render(`${livePreviewSettings}`,
                {"settings": currentSettings, "Strings": Strings}));

            // Select the correct theme.
            const $livePreviewServerURL = $template.find("#livePreviewServerURL"),
                $enableCustomServerChk = $template.find("#enableCustomServerChk"),
                $showLivePreviewAtStartup = $template.find("#showLivePreviewAtStartupChk"),
                $serveRoot = $template.find("#serveRoot"),
                $serveRootLabel = $template.find("#serveRootLabel"),
                $hotReloadChk = $template.find("#hotReloadChk"),
                $hotReloadLabel = $template.find("#hotReloadLabel"),
                $frameworkLabel = $template.find("#frameworkLabel"),
                $frameworkSelect = $template.find("#frameworkSelect");
            $enableCustomServerChk.prop('checked', PreferencesManager.get(PREFERENCE_PROJECT_SERVER_ENABLED));
            $showLivePreviewAtStartup.prop('checked', PreferencesManager.get(PREFERENCE_SHOW_LIVE_PREVIEW_PANEL));
            $hotReloadChk.prop('checked', !!PreferencesManager.get(PREFERENCE_PROJECT_SERVER_HOT_RELOAD_SUPPORTED));
            // figure out the framework

            if(PreferencesManager.get(PREFERENCE_PROJECT_PREVIEW_FRAMEWORK) === null) {
                detectFramework($frameworkSelect, $hotReloadChk);
            } else {
                $frameworkSelect.val(PreferencesManager.get(PREFERENCE_PROJECT_PREVIEW_FRAMEWORK));
            }

            function refreshValues() {
                if($enableCustomServerChk.is(":checked")){
                    $livePreviewServerURL.prop("disabled", false);
                } else {
                    $livePreviewServerURL.prop("disabled", true);
                }
                if($enableCustomServerChk.is(":checked") && $livePreviewServerURL.val()){
                    $serveRoot.removeClass("forced-hidden");
                    $serveRootLabel.removeClass("forced-hidden");
                    $hotReloadChk.removeClass("forced-hidden");
                    $hotReloadLabel.removeClass("forced-hidden");
                    $frameworkSelect.removeClass("forced-hidden");
                    $frameworkLabel.removeClass("forced-hidden");
                } else {
                    $serveRoot.addClass("forced-hidden");
                    $serveRootLabel.addClass("forced-hidden");
                    $hotReloadChk.addClass("forced-hidden");
                    $hotReloadLabel.addClass("forced-hidden");
                    $frameworkSelect.addClass("forced-hidden");
                    $frameworkLabel.addClass("forced-hidden");
                }
            }

            $livePreviewServerURL.on("input", refreshValues);
            $enableCustomServerChk.on("change", refreshValues);
            $livePreviewServerURL.val(PreferencesManager.get(PREFERENCE_PROJECT_SERVER_URL));
            $serveRoot.val(PreferencesManager.get(PREFERENCE_PROJECT_SERVER_PATH));
            refreshValues();
            Dialogs.showModalDialogUsingTemplate($template).done(function (id) {
                if (id === "save") {
                    PreferencesManager.set(PREFERENCE_SHOW_LIVE_PREVIEW_PANEL, $showLivePreviewAtStartup.is(":checked"));
                    _saveProjectPreferences($enableCustomServerChk.is(":checked"), $livePreviewServerURL.val(),
                        $serveRoot.val(), $hotReloadChk.is(":checked"), $frameworkSelect.val());
                }
                resolve();
            });
        });
    }

    function shouldShowLivePreviewAtStartup() {
        return PreferencesManager.get(PREFERENCE_SHOW_LIVE_PREVIEW_PANEL);
    }

    function _resolveServer() {
        if(!PreferencesManager.get(PREFERENCE_PROJECT_SERVER_ENABLED) ||
            !PreferencesManager.get(PREFERENCE_PROJECT_SERVER_URL)){
            return null;
        }
        let url = PreferencesManager.get(PREFERENCE_PROJECT_SERVER_URL);
        if(!url.endsWith("/")){
            url = `${url}/`;
        }
        let path = PreferencesManager.get(PREFERENCE_PROJECT_SERVER_PATH) || "/";
        if(!path){
            path = "/";
        }
        if(!path.endsWith("/")){
            path = `${path}/`; // www -> www/ and /www -> /www/
        }
        if(path.startsWith("/")){
            path = path.substring(1); // / -> "" , www/ -> www/ and /www -> www/
        }
        return {
            serverURL: url, // guaranteed to end with a slash
            pathInProject: path // guaranteed to not start with a /, but always ends with a / if there
        };
    }

    function getCustomServerConfig(fullPath) {
        const customServer = _resolveServer();
        if(!customServer || !ProjectManager.isWithinProject(fullPath)) {
            return null;
        }
        const projectRoot = ProjectManager.getProjectRoot().fullPath;
        const relativePath = path.relative(projectRoot, fullPath);
        const framework = PreferencesManager.get(PREFERENCE_PROJECT_PREVIEW_FRAMEWORK);
        let pathRelativeToServeRoot = relativePath;
        if(customServer.pathInProject !== "" &&
            relativePath.startsWith(customServer.pathInProject)){ // eg www/
            // www/design/index.html -> design/index.html
            pathRelativeToServeRoot = relativePath.replace(customServer.pathInProject, "");
        }
        const isServerRenderedURL = (utils.isPreviewableFile(fullPath) || utils.isServerRenderedFile(fullPath))
            && !utils.isMarkdownFile(fullPath) && !utils.isSVG(fullPath);
        if(framework === FRAMEWORK_DOCUSAURUS && utils.isMarkdownFile(fullPath)) {
            // for docusaurus, we do not have a reliable way to parse the config file and deduce paths, so we always
            // return the root url for now.
            pathRelativeToServeRoot = "";
        } else if(!isServerRenderedURL){
            return null;
        }
        // www/design/index.html -> http://localhost:8000/design/index.html
        return `${customServer.serverURL}${pathRelativeToServeRoot}`;
    }

    function isUsingCustomServer() {
        return !!_resolveServer();
    }

    function serverSupportsHotReload() {
        const customServer = _resolveServer();
        return customServer && !!PreferencesManager.get(PREFERENCE_PROJECT_SERVER_HOT_RELOAD_SUPPORTED);
    }

    function _serverChanged() {
        exports.trigger(EVENT_SERVER_CHANGED);
    }

    PreferencesManager.on("change", PREFERENCE_PROJECT_SERVER_URL, _serverChanged);

    exports.showSettingsDialog = showSettingsDialog;
    exports.getCustomServerConfig = getCustomServerConfig;
    exports.isUsingCustomServer = isUsingCustomServer;
    exports.serverSupportsHotReload = serverSupportsHotReload;
    exports.shouldShowLivePreviewAtStartup = shouldShowLivePreviewAtStartup;
    // events
    exports.EVENT_SERVER_CHANGED = EVENT_SERVER_CHANGED;
});
