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
    const CodeInspection     = brackets.getModule("language/CodeInspection"),
        FileSystemError    = brackets.getModule("filesystem/FileSystemError"),
        AppInit            = brackets.getModule("utils/AppInit"),
        PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
        DocumentManager    = brackets.getModule("document/DocumentManager"),
        Strings            = brackets.getModule("strings"),
        StringUtils        = brackets.getModule("utils/StringUtils"),
        ProjectManager     = brackets.getModule("project/ProjectManager"),
        FileSystem         = brackets.getModule("filesystem/FileSystem"),
        LanguageManager    = brackets.getModule("language/LanguageManager"),
        NodeUtils          = brackets.getModule("utils/NodeUtils");

    let prefs = PreferencesManager.getExtensionPrefs("ESLint"),
        useESLintFromProject = false;

    const ESLINT_ERROR_MODULE_LOAD_FAILED = "ESLINT_MODULE_LOAD_FAILED",
        ESLINT_ERROR_MODULE_NOT_FOUND = "ESLINT_MODULE_NOT_FOUND",
        ESLINT_ERROR_LINT_FAILED = "ESLINT_LINT_FAILED";

    const ESLINT_ONLY_IN_NATIVE_APP = "ESLINT_ERROR_ONLY_IN_NATIVE_APP";

    const PREFS_ESLINT_DISABLED = "disabled";

    // this is set to true if the service itself is not active/failed to start.
    let esLintServiceFailed = false;

    prefs.definePreference(PREFS_ESLINT_DISABLED, "boolean", false, {
        description: Strings.DESCRIPTION_ESLINT_DISABLE
    }).on("change", function () {
        CodeInspection.requestRun(Strings.ESLINT_NAME);
    });

    function _getLintError(errorCode, message) {
        let errorMessage = Strings.DESCRIPTION_ESLINT_FAILED;
        switch (errorCode) {
        case ESLINT_ERROR_LINT_FAILED:
            errorMessage = StringUtils.format(Strings.DESCRIPTION_ESLINT_FAILED, message || "Unknown"); break;
        case ESLINT_ONLY_IN_NATIVE_APP:
            errorMessage = Strings.DESCRIPTION_ESLINT_USE_NATIVE_APP; break;
        case ESLINT_ERROR_MODULE_NOT_FOUND:
            errorMessage = Strings.DESCRIPTION_ESLINT_DO_NPM_INSTALL; break;
        case ESLINT_ERROR_MODULE_LOAD_FAILED:
            errorMessage = Strings.DESCRIPTION_ESLINT_LOAD_FAILED; break;
        }
        return [{
            // JSLint returns 1-based line/col numbers
            pos: { line: -1, ch: 0 },
            htmlMessage: errorMessage,
            type: CodeInspection.Type.ERROR
        }];
    }

    function _getErrorClass(severity) {
        switch(severity) {
        case 1: return CodeInspection.Type.WARNING;
        case 2: return CodeInspection.Type.ERROR;
        default:
            console.error("Unknown ESLint severity!!!", severity);
            return CodeInspection.Type.META;
        }
    }

    function _0Based(index, defaultVal) {
        if(index === 0){
            return 0;
        }
        if(!index) {
            return defaultVal;
        }
        return index - 1;
    }

    function _getErrors(resultArray) {
        return resultArray.map(function (lintError) {
            let fix = null;
            if(lintError.fix && lintError.fix.range && typeof lintError.fix.text === "string") {
                fix = {
                    replaceText: lintError.fix.text,
                    rangeOffset: {
                        start: lintError.fix.range[0],
                        end: lintError.fix.range[1]
                    }
                };
            }
            return {
                pos: { line: _0Based(lintError.line), ch: _0Based(lintError.column)},
                endPos: {
                    line: _0Based(lintError.endLine, lintError.line),
                    ch: _0Based(lintError.endColumn, lintError.column)
                },
                message: `${lintError.message} ESLint (${lintError.ruleId})`,
                type: _getErrorClass(lintError.severity),
                fix: fix
            };
        });
    }

    function _isEslintSupportsJSX(config) {
        if(!config){
            return false;
        }
        let parserOptions = config.parserOptions; // es 7, 8
        if(!parserOptions && config.languageOptions && config.languageOptions.parserOptions){
            // this is for es9 and later
            parserOptions = config.languageOptions.parserOptions;
        }
        return parserOptions && parserOptions.ecmaFeatures && parserOptions.ecmaFeatures.jsx;
    }

    /**
     * Run JSLint on the current document. Reports results to the main UI. Displays
     * a gold star when no errors are found.
     */
    async function lintOneFile(text, fullPath) {
        return new Promise((resolve)=>{
            if(!Phoenix.isNativeApp) {
                resolve({ errors: _getLintError(ESLINT_ONLY_IN_NATIVE_APP) });
                return;
            }
            NodeUtils.ESLintFile(text, fullPath, ProjectManager.getProjectRoot().fullPath).then(esLintResult =>{
                const language = LanguageManager.getLanguageForPath(fullPath).getId();
                if(language === "jsx" && !_isEslintSupportsJSX(esLintResult.config)){
                    resolve({isIgnored: true});
                } else if (esLintResult.result && esLintResult.result.messages && esLintResult.result.messages.length) {
                    esLintServiceFailed = false;
                    resolve({ errors: _getErrors(esLintResult.result.messages) });
                } else if(esLintResult.isError) {
                    esLintServiceFailed = true;
                    resolve({ errors: _getLintError(esLintResult.errorCode, esLintResult.errorMessage) });
                } else if(esLintResult.isPathIgnored) {
                    resolve({isIgnored: true});
                } else {
                    esLintServiceFailed = false;
                    if(!esLintResult.result){
                        console.error("ESLint Unknown result", esLintResult);
                    }
                    resolve();
                }
            });
        });
    }

    /**
     * @private
     * @type {string}
     */
    const PACKAGE_JSON = "package.json";

    /**
     * Reads package.json and see if eslint is in dependencies or dev dependencies
     *
     * @returns {Promise} a promise to return configuration object.
     */
    function _isESLintProject() {
        return new Promise((resolve)=>{
            const configFilePath = path.join(ProjectManager.getProjectRoot().fullPath, PACKAGE_JSON);
            DocumentManager.getDocumentForPath(configFilePath).done(function (configDoc) {
                const content = configDoc.getText();
                try {
                    const config = JSON.parse(content);
                    resolve(config && (
                        (config.devDependencies && config.devDependencies.eslint) ||
                        (config.dependencies && config.dependencies.eslint)
                    ));
                } catch (err) {
                    console.error(`ESLint Error parsing ${PACKAGE_JSON}`, configFilePath, err);
                    resolve(false);
                }
            }).fail((err)=>{
                if(err !== FileSystemError.NOT_FOUND){
                    console.error(`ESLint Error reading ${PACKAGE_JSON}`, configFilePath, err);
                }
                resolve(false);
            });
        });
    }

    function _reloadOptions() {
        esLintServiceFailed = false;
        _isESLintProject().then((shouldESLintEnable)=>{
            useESLintFromProject = shouldESLintEnable;
            CodeInspection.requestRun(Strings.ESLINT_NAME);
        }).catch(()=>{
            useESLintFromProject = false;
            CodeInspection.requestRun(Strings.ESLINT_NAME);
        });
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
        let configFilePath = FileSystem.getFileForPath(ProjectManager.getProjectRoot().fullPath + PACKAGE_JSON);
        if(entry && entry.fullPath === configFilePath.fullPath
            || _isFileInArray(configFilePath, added) || _isFileInArray(configFilePath, removed)){
            _reloadOptions();
        }
    }

    AppInit.appReady(function () {
        ProjectManager.on(ProjectManager.EVENT_PROJECT_FILE_CHANGED, _projectFileChanged);
        ProjectManager.on(ProjectManager.EVENT_PROJECT_OPEN, function () {
            _reloadOptions();
            if(!Phoenix.isNativeApp) {
                return;
            }
            NodeUtils.ESLintFile("console.log();", "a.js", ProjectManager.getProjectRoot().fullPath)
                .catch(e=>{
                    console.error(`Error warming up ESLint service`, e);
                });
        });
        _reloadOptions();
    });

    const esLintProvider = {
        name: Strings.ESLINT_NAME,
        scanFileAsync: lintOneFile,
        canInspect: function (fullPath) {
            return !prefs.get(PREFS_ESLINT_DISABLED) && fullPath && !fullPath.endsWith(".min.js")
                && useESLintFromProject;
        }
    };

    // Register for JS files
    CodeInspection.register("javascript", esLintProvider);
    CodeInspection.register("jsx", esLintProvider);

    function isESLintActive() {
        return useESLintFromProject && Phoenix.isNativeApp && !esLintServiceFailed;
    }

    exports.isESLintActive = isESLintActive;
});
