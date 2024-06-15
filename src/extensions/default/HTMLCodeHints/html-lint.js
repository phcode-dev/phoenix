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
    const CodeInspection   = brackets.getModule("language/CodeInspection"),
        Strings            = brackets.getModule("strings"),
        EditorManager      = brackets.getModule("editor/EditorManager"),
        ProjectManager     = brackets.getModule("project/ProjectManager"),
        IndexingWorker     = brackets.getModule("worker/IndexingWorker");

    IndexingWorker.loadScriptInWorker(`${module.uri}/../worker/html-worker.js`);

    function getTypeFromSeverity(sev) {
        // https://html-validate.org/guide/api/getting-started.html
        switch (sev) {
        case 1:  return CodeInspection.Type.WARNING;
        case 2:  return CodeInspection.Type.ERROR;
        default: return CodeInspection.Type.META;
        }
    }

    /**
     * Run JSLint on the current document. Reports results to the main UI. Displays
     * a gold star when no errors are found.
     */
    async function lintOneFile(text, fullPath) {
        return new Promise((resolve, reject)=>{
            IndexingWorker.execPeer("htmlLint", {
                text,
                filePath: fullPath
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
            });
        });
    }

    CodeInspection.register("html", {
        name: Strings.HTML_LINT_NAME,
        scanFileAsync: lintOneFile,
        canInspect: function (_fullPath) {
            return true; // no restrictions for now
        }
    });
});
