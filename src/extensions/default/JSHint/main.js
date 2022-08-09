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

/**
 * Provides JSLint results via the core linting extension point
 */
define(function (require, exports, module) {

    // Load dependent modules
    var CodeInspection     = brackets.getModule("language/CodeInspection"),
        AppInit            = brackets.getModule("utils/AppInit"),
        PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
        Strings            = brackets.getModule("strings"),
        ProjectManager     = brackets.getModule("project/ProjectManager"),
        FileSystem         = brackets.getModule("filesystem/FileSystem"),
        IndexingWorker     = brackets.getModule("worker/IndexingWorker");

    IndexingWorker.loadScriptInWorker(`${module.uri}/../worker/jshint-helper.js`);

    let prefs = PreferencesManager.getExtensionPrefs("jshint"),
        projectSpecificOptions = null;

    prefs.definePreference("options", "object", {
        "esversion": 11,
        "browser": true,
        "node": true,
        "jquery": true,
        "rhino": false, // false here means read-only global property
        "jasmine": true,
        "devel": false
    }, {
        description: Strings.DESCRIPTION_JSHINT_OPTIONS
    }).on("change", function () {
        CodeInspection.requestRun(Strings.JSHINT_NAME);
    });

    /**
     * Run JSLint on the current document. Reports results to the main UI. Displays
     * a gold star when no errors are found.
     */
    async function lintOneFile(text, _fullPath) {
        return new Promise((resolve)=>{
            // If a line contains only whitespace (here spaces or tabs), remove the whitespace
            text = text.replace(/^[ \t]+$/gm, "");

            let options = projectSpecificOptions || prefs.get("options");

            IndexingWorker.execPeer("jsHint", {
                text,
                options
            }).then(jsHintErrors =>{
                if (!jsHintErrors.lintResult && jsHintErrors.errors.length) {
                    let errors = jsHintErrors.errors;

                    errors = errors.map(function (lintError) {
                        return {
                            // JSLint returns 1-based line/col numbers
                            pos: { line: lintError.line - 1, ch: lintError.character - 1 },
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
     * @returns {$.Promise} a promise to return configuration object.
     */
    function _readConfig(dir, configFileName) {
        var result = new $.Deferred(),
            file;
        configFileName = configFileName || CONFIG_FILE_NAME;
        file = FileSystem.getFileForPath(dir + configFileName);
        file.read(function (err, content) {
            if (!err) {
                let cfg = {},
                    config;
                try {
                    config = JSON.parse(removeComments(content));
                } catch (e) {
                    console.error("JSHint: error parsing " + file.fullPath + ". Details: " + e);
                    result.reject(e);
                    return;
                }
                // Load any base config defined by "extends".
                // The same functionality as in
                // jslints -> cli.js -> loadConfig -> if (config['extends'])...
                // https://jshint.com/docs/cli/ > Special Options
                var baseConfigResult = $.Deferred();
                if (config.extends) {
                    let extendFile = FileSystem.getFileForPath(dir + config.extends);
                    baseConfigResult = _readConfig(extendFile.parentPath, extendFile.name);
                    delete config.extends;
                }
                else {
                    baseConfigResult.resolve({});
                }
                baseConfigResult.done(function (baseConfig) {
                    cfg.globals = $.extend({}, baseConfig.globals, config.globals);
                    if (config.globals) { delete config.globals; }
                    cfg.options = $.extend({}, baseConfig.options, config);
                    projectSpecificOptions = config;
                    CodeInspection.requestRun(Strings.JSHINT_NAME);
                    result.resolve(cfg);
                }).fail(function (e) {
                    result.reject(e);
                });
            } else {
                result.reject(err);
            }
        });
        return result.promise();
    }

    function _reloadOptions() {
        projectSpecificOptions = null;
        _readConfig(ProjectManager.getProjectRoot().fullPath, CONFIG_FILE_NAME);
    }

    function _isFileInArray(fileToCheck, fileArray){
        for(let file of fileArray){
            if(file.fullPath === fileToCheck.fullPath){
                return true;
            }
        }
        return false;
    }

    function _projectFileChanged(_evt, entry, added, removed) {
        let configFilePath = FileSystem.getFileForPath(ProjectManager.getProjectRoot().fullPath + CONFIG_FILE_NAME);
        if(entry.fullPath === configFilePath.fullPath
            || _isFileInArray(configFilePath, added)){
            _reloadOptions();
        } else if(_isFileInArray(configFilePath, removed)){
            projectSpecificOptions = null;
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
        scanFileAsync: lintOneFile
    });
});
