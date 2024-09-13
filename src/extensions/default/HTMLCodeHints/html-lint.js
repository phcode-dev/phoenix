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

/* global path, fs*/

/**
 * Provides JSLint results via the core linting extension point
 */
define(function (require, exports, module) {

    // Load dependent modules
    const CodeInspection   = brackets.getModule("language/CodeInspection"),
        AppInit            = brackets.getModule("utils/AppInit"),
        Strings            = brackets.getModule("strings"),
        StringUtils        = brackets.getModule("utils/StringUtils"),
        EditorManager      = brackets.getModule("editor/EditorManager"),
        ProjectManager     = brackets.getModule("project/ProjectManager"),
        PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
        Metrics            = brackets.getModule("utils/Metrics"),
        FileSystem         = brackets.getModule("filesystem/FileSystem"),
        IndexingWorker     = brackets.getModule("worker/IndexingWorker");

    if(Phoenix.isTestWindow) {
        IndexingWorker.on("html_lint_extension_Loaded", ()=>{
            window._htmlLintExtensionReadyToIntegTest = true;
        });
    }
    IndexingWorker.loadScriptInWorker(`${module.uri}/../worker/html-worker.js`);

    const prefs = PreferencesManager.getExtensionPrefs("HTMLLint");
    const PREFS_HTML_LINT_DISABLED = "disabled";
    const CONFIG_FILE_NAME = ".htmlvalidate.json";
    const UNSUPPORTED_CONFIG_FILES = [".htmlvalidate.js", ".htmlvalidate.cjs"];

    let projectSpecificOptions, configErrorMessage, configID = 0;

    prefs.definePreference(PREFS_HTML_LINT_DISABLED, "boolean", false, {
        description: Strings.DESCRIPTION_HTML_LINT_DISABLE
    }).on("change", function () {
        CodeInspection.requestRun(Strings.HTML_LINT_NAME);
    });

    function getTypeFromSeverity(sev) {
        // https://html-validate.org/guide/api/getting-started.html
        switch (sev) {
        case 1:  return CodeInspection.Type.WARNING;
        case 2:  return CodeInspection.Type.ERROR;
        default: return CodeInspection.Type.META;
        }
    }

    function _getLinterConfigFileErrorMsg() {
        return [{
            // JSLint returns 1-based line/col numbers
            pos: { line: -1, ch: 0 },
            message: configErrorMessage,
            type: CodeInspection.Type.ERROR
        }];
    }

    /**
     * Run JSLint on the current document. Reports results to the main UI. Displays
     * a gold star when no errors are found.
     */
    async function lintOneFile(text, fullPath) {
        return new Promise((resolve, reject)=>{
            if(configErrorMessage){
                resolve({ errors: _getLinterConfigFileErrorMsg() });
                return;
            }
            IndexingWorker.execPeer("htmlLint", {
                text,
                filePath: fullPath,
                configID,
                config: projectSpecificOptions
            }).then(lintResult =>{
                const editor = EditorManager.getCurrentFullEditor();
                if(!editor || editor.document.file.fullPath !== fullPath) {
                    reject(new Error("Lint failed as  "+ ProjectManager.getProjectRelativeOrDisplayPath(fullPath)
                        + " is not active."));
                    return;
                }
                if (lintResult && lintResult.length) {
                    lintResult = lintResult.map(function (lintError) {
                        return {
                            pos: editor.posFromIndex(lintError.start),
                            endPos: editor.posFromIndex(lintError.end),
                            message: `${lintError.message} (${lintError.ruleId})`,
                            type: getTypeFromSeverity(lintError.severity),
                            moreInfoURL: lintError.ruleUrl
                        };
                    });

                    resolve({ errors: lintResult });
                }
                resolve();
            }).catch(err=>{
                console.error("HTML Lint failed:", err);
                reject(new Error("HTML Lint failed as HTML plugin is not yet loaded. Please try again."));
            });
        });
    }

    function _readConfig(dir) {
        return new Promise((resolve, reject)=>{
            const configFilePath = path.join(dir, CONFIG_FILE_NAME);
            let displayPath = ProjectManager.getProjectRelativeOrDisplayPath(configFilePath);
            // directly reading from fs as we are still getting deleted file from document manager read.
            fs.readFile(configFilePath, 'utf8', function (err, content) {
                if (err && fs.ERR_CODES.ENOENT === err.code) {
                    resolve(null); // no config file is a valid case. we just resolve with null
                } else if(err){
                    console.error("Error reading JSHint Config File", configFilePath, err);
                    reject("Error reading JSHint Config File", displayPath);
                } else {
                    let config;
                    try {
                        config = JSON.parse(content);
                        console.log("html-lint: loaded config file for project " + configFilePath);
                    } catch (e) {
                        console.log("html-lint: error parsing " + configFilePath, content, e);
                        // just log and return as this is an expected failure for us while the user edits code
                        reject(StringUtils.format(Strings.HTML_LINT_CONFIG_JSON_ERROR, displayPath));
                        return;
                    }
                    resolve(config);
                }
            });
        });
    }

    async function _validateUnsupportedConfig(scanningProjectPath) {
        let errorMessage;
        for(let unsupportedFileName of UNSUPPORTED_CONFIG_FILES) {
            let exists = await FileSystem.existsAsync(path.join(scanningProjectPath, unsupportedFileName));
            if(exists) {
                errorMessage = StringUtils.format(Strings.HTML_LINT_CONFIG_UNSUPPORTED, unsupportedFileName);
                break;
            }
        }
        if(scanningProjectPath !== ProjectManager.getProjectRoot().fullPath) {
            // this is a rare race condition where the user switches project between the config reload
            // Eg. in integ tests. do nothing as another scan for the new project will be in progress.
            return;
        }
        configErrorMessage = errorMessage;
        CodeInspection.requestRun(Strings.HTML_LINT_NAME);
    }

    function _reloadOptions() {
        projectSpecificOptions = null;
        configErrorMessage = null;
        const scanningProjectPath = ProjectManager.getProjectRoot().fullPath;
        configID++;
        _readConfig(scanningProjectPath).then((config)=>{
            configID++;
            if(scanningProjectPath !== ProjectManager.getProjectRoot().fullPath){
                // this is a rare race condition where the user switches project between the get document call.
                // Eg. in integ tests. do nothing as another scan for the new project will be in progress.
                return;
            }
            if(config) {
                Metrics.countEvent(Metrics.EVENT_TYPE.LINT, "html", "configPresent");
                projectSpecificOptions = config;
                configErrorMessage = null;
                CodeInspection.requestRun(Strings.HTML_LINT_NAME);
            } else {
                _validateUnsupportedConfig(scanningProjectPath)
                    .catch(console.error);
            }
        }).catch((err)=>{
            configID++;
            if(scanningProjectPath !== ProjectManager.getProjectRoot().fullPath){
                return;
            }
            Metrics.countEvent(Metrics.EVENT_TYPE.LINT, "HTMLConfig", "error");
            configErrorMessage = err;
            CodeInspection.requestRun(Strings.HTML_LINT_NAME);
        });
    }

    let projectConfigPaths;
    function _getConfigPaths() {
        if(!projectConfigPaths){
            projectConfigPaths=[
                path.join(ProjectManager.getProjectRoot().fullPath, CONFIG_FILE_NAME),
                ...UNSUPPORTED_CONFIG_FILES.map(fileName=>
                    path.join(ProjectManager.getProjectRoot().fullPath, fileName))
            ];
        }
        return projectConfigPaths;
    }

    function _projectFileChanged(_evt, changedPath, addedSet, removedSet) {
        const configPaths = _getConfigPaths();
        for(let configPath of configPaths) {
            if(changedPath=== configPath || addedSet.has(configPath) || removedSet.has(configPath)){
                _reloadOptions();
                return;
            }
        }
    }

    AppInit.appReady(function () {
        ProjectManager.on(ProjectManager.EVENT_PROJECT_CHANGED_OR_RENAMED_PATH, _projectFileChanged);
        ProjectManager.on(ProjectManager.EVENT_PROJECT_OPEN, ()=>{
            projectConfigPaths = null;
            _reloadOptions();
        });
        _reloadOptions();
    });

    const registration = {
        name: Strings.HTML_LINT_NAME,
        scanFileAsync: lintOneFile,
        canInspect: function (_fullPath) {
            return !prefs.get(PREFS_HTML_LINT_DISABLED);
        }
    };
    CodeInspection.register("html", registration);
    CodeInspection.register("php", registration);
});
