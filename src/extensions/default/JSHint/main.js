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

/**
 * Provides JSLint results via the core linting extension point
 */
define(function (require, exports, module) {

    // Load dependent modules
    var CodeInspection     = brackets.getModule("language/CodeInspection"),
        PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
        Strings            = brackets.getModule("strings"),
        IndexingWorker     = brackets.getModule("worker/IndexingWorker");

    IndexingWorker.loadScriptInWorker(`${module.uri}/../worker/jshint-helper.js`);

    let prefs = PreferencesManager.getExtensionPrefs("jshint");

    prefs.definePreference("options", "object", {
        "esversion": 11,
        "browser": true,
        "node": true,
        "rhino": true,
        "jasmine": true,
        "devel": true
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

            let options = prefs.get("options");

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

    // Register for JS files
    CodeInspection.register("javascript", {
        name: Strings.JSHINT_NAME,
        scanFileAsync: lintOneFile
    });
});
