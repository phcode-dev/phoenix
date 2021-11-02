/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*global JSLINT */

/**
 * Provides JSLint results via the core linting extension point
 */
define(function (require, exports, module) {


    // Load JSLint, a non-module lib
    require("thirdparty/jslint/jslint");

    // Load dependent modules
    var CodeInspection     = brackets.getModule("language/CodeInspection"),
        Editor             = brackets.getModule("editor/Editor").Editor,
        PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
        Strings            = brackets.getModule("strings"),
        _                  = brackets.getModule("thirdparty/lodash");

    var prefs = PreferencesManager.getExtensionPrefs("jslint");

    /**
     * @private
     *
     * Used to keep track of the last options JSLint was run with to avoid running
     * again when there were no changes.
     */
    var _lastRunOptions;

    prefs.definePreference("options", "object", undefined, {
        description: Strings.DESCRIPTION_JSLINT_OPTIONS,
        keys: {
            ass: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_ASS,
                initial: false
            },
            bitwise: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_BITWISE,
                initial: false
            },
            browser: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_BROWSER,
                initial: false
            },
            closure: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_CLOSURE,
                initial: false
            },
            "continue": {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_CONTINUE,
                initial: false
            },
            couch: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_COUCH,
                initial: false
            },
            debug: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_DEBUG,
                initial: false
            },
            devel: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_DEVEL,
                initial: false
            },
            eqeq: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_EQEQ,
                initial: false
            },
            es6: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_ES6,
                initial: false
            },
            evil: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_EVIL,
                initial: false
            },
            forin: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_FORIN,
                initial: false
            },
            indent: {
                type: "number",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_INDENT
            },
            maxerr: {
                type: "number",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_MAXERR
            },
            maxlen: {
                type: "number",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_MAXLEN
            },
            newcap: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_NEWCAP,
                initial: false
            },
            node: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_NODE,
                initial: false
            },
            nomen: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_NOMEN,
                initial: false
            },
            passfail: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_PASSFAIL,
                initial: false
            },
            plusplus: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_PLUSPLUS,
                initial: false
            },
            regexp: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_REGEXP,
                initial: false
            },
            rhino: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_RHINO,
                initial: false
            },
            sloppy: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_SLOPPY,
                initial: false
            },
            stupid: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_STUPID,
                initial: false
            },
            sub: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_SUB,
                initial: false
            },
            todo: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_TODO,
                initial: false
            },
            unparam: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_UNPARAM,
                initial: false
            },
            vars: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_VARS,
                initial: false
            },
            white: {
                type: "boolean",
                description: Strings.DESCRIPTION_JSLINT_OPTIONS_WHITE,
                initial: false
            }
        }
    })
        .on("change", function (e, data) {
            var options = prefs.get("options");
            if (!_.isEqual(options, _lastRunOptions)) {
                CodeInspection.requestRun(Strings.JSLINT_NAME);
            }
        });

    // Predefined environments understood by JSLint.
    var ENVIRONMENTS = ["browser", "node", "couch", "rhino"];

    // gets indentation size depending whether the tabs or spaces are used
    function _getIndentSize(fullPath) {
        return Editor.getUseTabChar(fullPath) ? Editor.getTabSize(fullPath) : Editor.getSpaceUnits(fullPath);
    }

    /**
     * Run JSLint on the current document. Reports results to the main UI. Displays
     * a gold star when no errors are found.
     */
    function lintOneFile(text, fullPath) {
        // If a line contains only whitespace (here spaces or tabs), remove the whitespace
        text = text.replace(/^[ \t]+$/gm, "");

        var options = prefs.get("options");

        _lastRunOptions = _.clone(options);

        if (!options) {
            options = {};
        } else {
            options = _.clone(options);
        }

        if (!options.indent) {
            // default to using the same indentation value that the editor is using
            options.indent = _getIndentSize(fullPath);
        }

        // If the user has not defined the environment, we use browser by default.
        var hasEnvironment = _.some(ENVIRONMENTS, function (env) {
            return options[env] !== undefined;
        });

        if (!hasEnvironment) {
            options.browser = true;
        }

        var jslintResult = JSLINT(text, options);

        if (!jslintResult) {
            // Remove any trailing null placeholder (early-abort indicator)
            var errors = JSLINT.errors.filter(function (err) { return err !== null; });

            errors = errors.map(function (jslintError) {
                return {
                    // JSLint returns 1-based line/col numbers
                    pos: { line: jslintError.line - 1, ch: jslintError.character - 1 },
                    message: jslintError.reason,
                    type: CodeInspection.Type.WARNING
                };
            });

            var result = { errors: errors };

            // If array terminated in a null it means there was a stop notice
            if (errors.length !== JSLINT.errors.length) {
                result.aborted = true;
                errors[errors.length - 1].type = CodeInspection.Type.META;
            }

            return result;
        }
        return null;
    }

    // Register for JS files
    CodeInspection.register("javascript", {
        name: Strings.JSLINT_NAME,
        scanFile: lintOneFile
    });
});
