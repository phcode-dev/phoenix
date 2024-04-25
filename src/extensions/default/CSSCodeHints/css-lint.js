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
    const CodeInspection     = brackets.getModule("language/CodeInspection"),
        Strings            = brackets.getModule("strings"),
        LanguageManager = brackets.getModule("language/LanguageManager"),
        StringUtils           = brackets.getModule("utils/StringUtils"),
        IndexingWorker     = brackets.getModule("worker/IndexingWorker");

    IndexingWorker.loadScriptInWorker(`${module.uri}/../worker/css-worker.js`);

    function getTypeFromSeverity(sev) {
        switch (sev) {
        case 1:  return CodeInspection.Type.ERROR;
        case 2:  return CodeInspection.Type.WARNING;
        default: return CodeInspection.Type.META;
        }
    }

    const cssMode = {
        css: "CSS",
        less: "LESS",
        scss: "SCSS"
    };

    /**
     * Run JSLint on the current document. Reports results to the main UI. Displays
     * a gold star when no errors are found.
     */
    async function lintOneFile(text, fullPath) {
        return new Promise((resolve, reject)=>{
            const languageId = LanguageManager.getLanguageForPath(fullPath).getId();
            if(!cssMode[languageId]){
                console.error("Unknown language id to lint: ", languageId, fullPath);
                reject(new Error("Unknown CSS language to lint for "+ fullPath));
                return;
            }
            IndexingWorker.execPeer("cssLint", {
                text,
                cssMode: cssMode[languageId],
                filePath: fullPath
            }).then(lintResult =>{
                if (lintResult && lintResult.length) {
                    lintResult = lintResult.map(function (lintError) {
                        return {
                            pos: { line: lintError.range.start.line, ch: lintError.range.start.character },
                            endPos: { line: lintError.range.end.line, ch: lintError.range.end.character },
                            message: `${lintError.message} (${lintError.code})`,
                            type: getTypeFromSeverity(lintError.severity)
                        };
                    });

                    resolve({ errors: lintResult });
                }
                resolve();
            });
        });
    }

    // Register for JS files
    const supportedLanguages = ["css", "less", "scss"];
    for(let language of supportedLanguages){
        CodeInspection.register(language, {
            name: StringUtils.format(Strings.CSS_LINT_NAME, cssMode[language]),
            scanFileAsync: lintOneFile,
            canInspect: function (fullPath) {
                return fullPath && !fullPath.endsWith(".min.css");
            }
        });
    }
});
