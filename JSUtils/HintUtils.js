/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*jslint regexp: true */

define(function (require, exports, module) {


    var Acorn                       = require("thirdparty/acorn/dist/acorn");

    var LANGUAGE_ID                 = "javascript",
        JSX_LANGUAGE_ID             = "jsx",
        HTML_LANGUAGE_ID            = "html",
        PHP_LANGUAGE_ID             = "php",
        SUPPORTED_LANGUAGES         = [LANGUAGE_ID, JSX_LANGUAGE_ID, HTML_LANGUAGE_ID, PHP_LANGUAGE_ID],
        SINGLE_QUOTE                = "'",
        DOUBLE_QUOTE                = "\"";

    /**
     * Create a hint token with name value that occurs at the given list of
     * positions.
     *
     * @param {string} value - name of the new hint token
     * @param {?Array.<number>=} positions - optional list of positions at which
     *      the token occurs
     * @return {Object} - a new hint token
     */
    function makeToken(value, positions) {
        positions = positions || [];

        return {
            value: value,
            positions: positions
        };
    }

    /**
     * Is the string key perhaps a valid JavaScript identifier?
     *
     * @param {string} key - string to test.
     * @return {boolean} - could key be a valid identifier?
     */
    function maybeIdentifier(key) {
        var result = false,
            i;

        for (i = 0; i < key.length; i++) {
            result = Acorn.isIdentifierChar(key.charCodeAt(i));
            if (!result) {
                break;
            }
        }

        return result;
    }

    /**
     * Is the token's class hintable? (A very conservative test.)
     *
     * @param {Object} token - the token to test for hintability
     * @return {boolean} - could the token be hintable?
     */
    function hintable(token) {

        function _isInsideRegExp(token) {
            return token.state && (token.state.lastType === "regexp" ||
                   (token.state.localState && token.state.localState.lastType === "regexp"));
        }

        switch (token.type) {
        case "comment":
        case "number":
        case "regexp":
        case "string":
        case "def":     // exclude variable & param decls
            return false;
        case "string-2":
            // exclude strings inside a regexp
            return !_isInsideRegExp(token);
        default:
            return true;
        }
    }

    /**
     *  Determine if hints should be displayed for the given key.
     *
     * @param {string} key - key entered by the user
     * @param {boolean} showOnDot - show hints on dot (".").
     * @return {boolean} true if the hints should be shown for the key,
     * false otherwise.
     */
    function hintableKey(key, showOnDot) {
        return (key === null || (showOnDot && key === ".") || maybeIdentifier(key));
    }

    /*
     * Get a JS-hints-specific event name. Used to prevent event namespace
     * pollution.
     *
     * @param {string} name - the unqualified event name
     * @return {string} - the qualified event name
     */
    function eventName(name) {
        var EVENT_TAG = "brackets-js-hints";
        return name + "." + EVENT_TAG;
    }

    /*
     * Annotate a list of tokens as literals of a particular kind;
     * if string literals, annotate with an appropriate delimiter.
     *
     * @param {Array.<Object>} literals - list of hint tokens
     * @param {string} kind - the kind of literals in the list (e.g., "string")
     * @return {Array.<Object>} - the input array; to each object in the array a
     *      new literal {boolean} property has been added to indicate that it
     *      is a literal hint, and also a new kind {string} property to indicate
     *      the literal kind. For string literals, a delimiter property is also
     *      added to indicate what the default delimiter should be (viz. a
     *      single or double quotation mark).
     */
    function annotateLiterals(literals, kind) {
        return literals.map(function (t) {
            t.literal = true;
            t.kind = kind;
            t.origin = "ecmascript";
            if (kind === "string") {
                if (/[^\\]"/.test(t.value)) {
                    t.delimiter = SINGLE_QUOTE;
                } else {
                    t.delimiter = DOUBLE_QUOTE;
                }
            }
            return t;
        });
    }

    /*
     * Annotate a list of tokens as keywords
     *
     * @param {Array.<Object>} keyword - list of keyword tokens
     * @return {Array.<Object>} - the input array; to each object in the array a
     *      new keyword {boolean} property has been added to indicate that the
     *      hint is a keyword.
     */
    function annotateKeywords(keywords) {
        return keywords.map(function (t) {
            t.keyword = true;
            t.origin = "ecmascript";
            return t;
        });
    }

    function isSupportedLanguage(languageId) {
        return SUPPORTED_LANGUAGES.indexOf(languageId) !== -1;
    }

    var KEYWORD_NAMES   = [
            "break", "case", "catch", "class", "const", "continue", "debugger",
            "default", "delete", "do", "else", "export", "extends", "finally",
            "for", "function", "if", "import", "in", "instanceof", "let", "new",
            "return", "super", "switch", "this", "throw", "try", "typeof", "var",
            "void", "while", "with", "yield"
        ],
        KEYWORD_TOKENS  = KEYWORD_NAMES.map(function (t) {
            return makeToken(t, []);
        }),
        KEYWORDS        = annotateKeywords(KEYWORD_TOKENS);

    var LITERAL_NAMES   = [
            "true", "false", "null"
        ],
        LITERAL_TOKENS  = LITERAL_NAMES.map(function (t) {
            return makeToken(t, []);
        }),
        LITERALS        = annotateLiterals(LITERAL_TOKENS);

    exports.makeToken                   = makeToken;
    exports.hintable                    = hintable;
    exports.hintableKey                 = hintableKey;
    exports.maybeIdentifier             = maybeIdentifier;
    exports.eventName                   = eventName;
    exports.annotateLiterals            = annotateLiterals;
    exports.isSupportedLanguage         = isSupportedLanguage;
    exports.KEYWORDS                    = KEYWORDS;
    exports.LITERALS                    = LITERALS;
    exports.LANGUAGE_ID                 = LANGUAGE_ID;
    exports.SINGLE_QUOTE                = SINGLE_QUOTE;
    exports.DOUBLE_QUOTE                = DOUBLE_QUOTE;
    exports.SUPPORTED_LANGUAGES         = SUPPORTED_LANGUAGES;
});
