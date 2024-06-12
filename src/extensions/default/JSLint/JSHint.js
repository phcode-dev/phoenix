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

// Parts of this file is adapted from https://github.com/cfjedimaster/brackets-jshint

/*global path*/

/**
 * Provides JSLint results via the core linting extension point
 */
define(function (require, exports, module) {

    // Load dependent modules
    const _                = brackets.getModule("thirdparty/lodash"),
        CodeInspection     = brackets.getModule("language/CodeInspection"),
        FileSystemError    = brackets.getModule("filesystem/FileSystemError"),
        AppInit            = brackets.getModule("utils/AppInit"),
        PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
        DocumentManager    = brackets.getModule("document/DocumentManager"),
        Strings            = brackets.getModule("strings"),
        ProjectManager     = brackets.getModule("project/ProjectManager"),
        FileSystem         = brackets.getModule("filesystem/FileSystem"),
        IndexingWorker     = brackets.getModule("worker/IndexingWorker"),
        ESLint       = require("./ESLint");

    if(Phoenix.isTestWindow) {
        IndexingWorker.on("JsHint_extension_Loaded", ()=>{
            window._JsHintExtensionReadyToIntegTest = true;
        });
    }
    IndexingWorker.loadScriptInWorker(`${module.uri}/../worker/jslint-helper.js`);

    let prefs = PreferencesManager.getExtensionPrefs("jshint"),
        projectSpecificOptions = null,
        jsHintConfigFileErrorMessage = null;

    const PREFS_JSHINT_DISABLED = "disabled";

    // We don't provide default options in the preferences as preferences will try to mixin default options with
    // user defined options leading to unexpected results. Either we take user defined options or default, no mixin.
    let DEFAULT_OPTIONS = {
        "esversion": 11,
        "browser": true,
        "node": true,
        "jquery": true,
        "rhino": false, // false here means read-only global property
        "jasmine": true,
        "devel": false
    };

    prefs.definePreference(PREFS_JSHINT_DISABLED, "boolean", false, {
        description: Strings.DESCRIPTION_JSHINT_DISABLE
    }).on("change", function () {
        CodeInspection.requestRun(Strings.JSHINT_NAME);
    });

    function _getLinterConfigFileErrorMsg() {
        return [{
            // JSLint returns 1-based line/col numbers
            pos: { line: -1, ch: 0 },
            message: jsHintConfigFileErrorMessage,
            type: CodeInspection.Type.ERROR
        }];
    }

    /**
     * Run JSLint on the current document. Reports results to the main UI. Displays
     * a gold star when no errors are found.
     */
    async function lintOneFile(text, _fullPath) {
        return new Promise((resolve)=>{
            if(jsHintConfigFileErrorMessage){
                resolve({ errors: _getLinterConfigFileErrorMsg() });
                return;
            }
            // If a line contains only whitespace (here spaces or tabs), remove the whitespace
            text = text.replace(/^[ \t]+$/gm, "");

            let options = projectSpecificOptions || DEFAULT_OPTIONS;

            IndexingWorker.execPeer("jsHint", {
                text,
                options
            }).then(jsHintErrors =>{
                if (!jsHintErrors.lintResult && jsHintErrors.errors.length) {
                    let errors = jsHintErrors.errors;

                    errors = errors.map(function (lintError) {
                        return {
                            // JSLint returns 1-based line/col numbers
                            pos: { line: lintError.line - 1, ch: lintError.character },
                            message: `${lintError.reason} jshint (${lintError.code})`,
                            type: CodeInspection.Type.ERROR
                        };
                    });

                    resolve({ errors: errors });
                }
                resolve();
            });
        });
    }

    /**
     * @private
     * @type {string}
     */
    const CONFIG_FILE_NAME = ".jshintrc";

    /**
     * Removes JavaScript comments from a string by replacing
     * everything between block comments and everything after
     * single-line comments in a non-greedy way.
     *
     * English version of the regex:
     *   match '/*'
     *   then match zero or more instances of any character (incl. \n)
     *   except for instances of '* /' (without a space, obv.)
     *   then match '* /' (again, without a space)
     *
     * @param {string} str a string with potential JavaScript comments.
     * @returns {string} a string without JavaScript comments.
     */
    function removeComments(str) {
        str = str || "";

        str = str.replace(/\/\*(?:(?!\*\/)[\s\S])*\*\//g, "");
        str = str.replace(/\/\/[^\n\r]*/g, ""); // Everything after '//'

        return str;
    }

    /**
     * Reads configuration file in the specified directory. Returns a promise for configuration object.
     *
     * @param {string} dir absolute path to a directory.
     * @param {string} configFileName name of the configuration file (optional)
     *
     * @returns {Promise} a promise to return configuration object.
     */
    function _readConfig(dir, configFileName) {
        return new Promise((resolve, reject)=>{
            configFileName = configFileName || CONFIG_FILE_NAME;
            const configFilePath = path.join(dir, configFileName);
            let displayPath = ProjectManager.makeProjectRelativeIfPossible(configFilePath);
            displayPath = Phoenix.app.getDisplayPath(displayPath);
            DocumentManager.getDocumentForPath(configFilePath).done(function (configDoc) {
                if (!ProjectManager.isWithinProject(configFilePath)) {
                    // this is a rare race condition where the user switches project between the get document call.
                    // Eg. in integ tests.
                    reject(`JSHint Project changed while scanning ${configFilePath}`);
                    return;
                }
                let config;
                const content = configDoc.getText();
                try {
                    config = JSON.parse(removeComments(content));
                    console.log("JSHint: loaded config file for project " + configFilePath);
                } catch (e) {
                    console.log("JSHint: error parsing " + configFilePath, content, e);
                    // just log and return as this is an expected failure for us while the user edits code
                    reject("Error parsing JSHint config file:    " + displayPath);
                    return;
                }
                // Load any base config defined by "extends".
                // The same functionality as in
                // jslints -> cli.js -> loadConfig -> if (config['extends'])...
                // https://jshint.com/docs/cli/ > Special Options
                if (config.extends) {
                    let extendFile = FileSystem.getFileForPath(path.join(dir, config.extends));
                    _readConfig(extendFile.parentPath, extendFile.name).then(baseConfigResult=>{
                        delete config.extends;
                        let mergedConfig = $.extend({}, baseConfigResult, config);
                        if (config.globals) {
                            delete config.globals;
                        }
                        resolve(mergedConfig);
                    }).catch(()=>{
                        let extendDisplayPath = ProjectManager.makeProjectRelativeIfPossible(extendFile.fullPath);
                        extendDisplayPath = Phoenix.app.getDisplayPath(extendDisplayPath);
                        reject("Error parsing JSHint config file: " + extendDisplayPath);
                    });
                }
                else {
                    resolve(config);
                }
            }).fail((err)=>{
                if(err === FileSystemError.NOT_FOUND){
                    resolve(null); // no config file is a valid case. we just resolve with null
                    return;
                }
                console.error("Error reading JSHint Config File", configFilePath, err);
                reject("Error reading JSHint Config File", displayPath);
            });
        });
    }

    function _reloadOptions() {
        projectSpecificOptions = null;
        const scanningProjectPath = ProjectManager.getProjectRoot().fullPath;
        _readConfig(scanningProjectPath, CONFIG_FILE_NAME).then((config)=>{
            if(scanningProjectPath !== ProjectManager.getProjectRoot().fullPath){
                // this is a rare race condition where the user switches project between the get document call.
                // Eg. in integ tests. do nothing as another scan for the new project will be in progress.
                return;
            }
            projectSpecificOptions = config;
            CodeInspection.requestRun(Strings.JSHINT_NAME);
            jsHintConfigFileErrorMessage = null;
        }).catch((err)=>{
            if(scanningProjectPath !== ProjectManager.getProjectRoot().fullPath){
                return;
            }
            jsHintConfigFileErrorMessage = err;
            CodeInspection.requestRun(Strings.JSHINT_NAME);
        });
    }

    function isJSHintConfigActive() {
        return !!(jsHintConfigFileErrorMessage || projectSpecificOptions);
    }

    function _isFileInArray(fileToCheck, fileArray){
        if(!fileArray){
            return false;
        }
        for(let file of fileArray){
            if(file.fullPath === fileToCheck.fullPath){
                return true;
            }
        }
        return false;
    }

    function _projectFileChanged(_evt, entry, added, removed) {
        let configFilePath = FileSystem.getFileForPath(ProjectManager.getProjectRoot().fullPath + CONFIG_FILE_NAME);
        if(entry && entry.fullPath === configFilePath.fullPath
            || _isFileInArray(configFilePath, added)){
            _reloadOptions();
        } else if(_isFileInArray(configFilePath, removed)){
            projectSpecificOptions = null;
            jsHintConfigFileErrorMessage = null;
        }
    }

    AppInit.appReady(function () {
        ProjectManager.on(ProjectManager.EVENT_PROJECT_FILE_CHANGED, _projectFileChanged);
        ProjectManager.on(ProjectManager.EVENT_PROJECT_OPEN, _reloadOptions);
        _reloadOptions();
    });

    // Register for JS files
    CodeInspection.register("javascript", {
        name: Strings.JSHINT_NAME,
        scanFileAsync: lintOneFile,
        canInspect: function (fullPath) {
            return !prefs.get(PREFS_JSHINT_DISABLED) && fullPath && !fullPath.endsWith(".min.js")
                && (isJSHintConfigActive() || !ESLint.isESLintActive());
            // if there is no linter, then we use jsHint as the default linter as it works in browser and native apps.
            // remove ESLint.isESLintActive() once we add typescript language service that supports browser.
        }
    });

    exports.isJSHintConfigActive = isJSHintConfigActive;
});
