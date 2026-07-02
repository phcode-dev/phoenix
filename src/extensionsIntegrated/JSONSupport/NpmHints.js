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
 */

/**
 * NpmHints - live npm package NAME and VERSION completion inside package.json dependency
 * sections. Registered at a higher priority than the JSON language server's schema completion,
 * but claims ONLY dependency-section contexts in package.json - everywhere else it declines and
 * schema completion serves.
 *
 * Name mode (cursor in a key under dependencies/devDependencies/...): registry search, relevance
 * order preserved. Version mode (cursor in the value): the package's real version list, newest
 * first, with ^latest / ~latest range shortcuts on top. Inserting a name chains straight into
 * version mode (PrefsCodeHints' string-value flow).
 *
 * @module extensionsIntegrated/JSONSupport/NpmHints
 */
define(function (require, exports, module) {


    const JSONUtils = require("language/JSONUtils"),
        Strings = require("strings"),
        semver = require("thirdparty/semver.browser"),
        DefaultProviders = require("languageTools/DefaultProviders"),
        _ = require("thirdparty/lodash"),
        NpmRegistry = require("./NpmRegistry");

    const DEP_SECTIONS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
    const PACKAGE_JSON = "package.json";
    const MIN_QUERY_LENGTH = 2;
    const SEARCH_DEBOUNCE_MS = 250;
    const MAX_VERSION_HINTS = 50;

    function NpmHints() {
        this.editor = null;
        this.ctxInfo = null;
        this._searchSession = 0;    // monotonically increasing; stale debounced searches discard
        this._searchTimer = null;
    }

    function _isPackageJson(editor) {
        return editor && editor.document && editor.document.file &&
            editor.document.file.name === PACKAGE_JSON;
    }

    function _depContext(ctxInfo) {
        return !!(ctxInfo && ctxInfo.tokenType &&
            DEP_SECTIONS.indexOf(ctxInfo.parentKeyName) !== -1);
    }

    function _query(ctxInfo) {
        const raw = JSONUtils.stripQuotes(ctxInfo.token.string.substr(0, ctxInfo.offset)).trim();
        return JSONUtils.regexAllowedChars.test(raw) ? "" : raw;
    }

    // Emphasize the typed query inside a hint's main text (the standard .matched-hint style the
    // other hint providers use). Registry search is fuzzy, so a name may not contain the query -
    // those rows render plain.
    function _highlightMatches($hintObj, mainText, query) {
        if (!query) {
            $hintObj.text(mainText);
            return;
        }
        const lower = mainText.toLowerCase(),
            needle = query.toLowerCase();
        let from = 0, idx;
        while ((idx = lower.indexOf(needle, from)) !== -1) {
            if (idx > from) {
                $hintObj.append(document.createTextNode(mainText.slice(from, idx)));
            }
            $hintObj.append($("<span>").addClass("matched-hint").text(mainText.slice(idx, idx + needle.length)));
            from = idx + needle.length;
        }
        $hintObj.append(document.createTextNode(mainText.slice(from)));
    }

    function _hintItem(mainText, description, mode, query) {
        const $hintItem = $("<span>").addClass("brackets-hints npm-hint"),
            $hintObj = $("<span>").addClass("hint-obj");
        _highlightMatches($hintObj, mainText, query);
        $hintItem.append($hintObj);
        if (description) {
            if (mode === "name") {
                // Package descriptions read in the side docs popup on highlight (onHighlight) -
                // keeping them off the rows keeps the list narrow and scannable.
                $hintItem.data("npmDoc", description);
            } else {
                // Version rows carry only a tiny fixed label ("latest, minor updates ok").
                $hintItem.append($("<span>").addClass("hint-description").text(description));
            }
        }
        $hintItem.data("npmMode", mode);
        return $hintItem;
    }

    /**
     * Claim the session only for dependency-section contexts inside package.json.
     * @param {!Editor} editor
     * @param {string} implicitChar
     * @return {boolean}
     */
    NpmHints.prototype.hasHints = function (editor, implicitChar) {
        if (!_isPackageJson(editor)) {
            return false;
        }
        this.editor = editor;
        this.ctxInfo = JSONUtils.getContextInfo(editor, editor.getCursorPos(), true);
        return _depContext(this.ctxInfo);
    };

    NpmHints.prototype._nameHints = function (query, explicitInvocation) {
        const self = this,
            deferred = $.Deferred(),
            session = ++this._searchSession;
        if (this._searchTimer) {
            clearTimeout(this._searchTimer);
        }
        // The debounce exists to coalesce keystrokes; an explicit Ctrl-Space is a one-shot ask.
        const delay = explicitInvocation ? 0 : SEARCH_DEBOUNCE_MS;
        this._searchTimer = setTimeout(function () {
            self._searchTimer = null;
            NpmRegistry.searchPackages(query).then(function (results) {
                if (session !== self._searchSession) {
                    deferred.reject();  // superseded by newer keystrokes
                    return;
                }
                deferred.resolve({
                    hints: results.map(function (pkg) {
                        return _hintItem(pkg.name, pkg.description, "name", query);
                    }),
                    match: null,            // registry order is relevance order - no re-highlighting
                    selectInitial: true,
                    handleWideResults: false
                });
            }).catch(function () {
                deferred.reject();
            });
        }, delay);
        return deferred;
    };

    NpmHints.prototype._versionHints = function (packageName, query) {
        const deferred = $.Deferred();
        NpmRegistry.getVersions(packageName).then(function (result) {
            const sorted = result.versions.slice().sort(semver.rcompare);
            const bare = query.replace(/^[\^~]/, "");
            // Filter the FULL version list before capping - a "5." prefix must surface the 5.x
            // train even when the newest 50 versions are all 7.x. If nothing matches the typed
            // prefix at all, degrade to the newest versions rather than showing an empty list.
            let matching = sorted;
            if (bare) {
                matching = sorted.filter(function (version) {
                    return version.indexOf(bare) === 0;
                });
                if (!matching.length) {
                    matching = sorted;
                }
            }
            const hints = [];
            if (result.latest && (!bare || result.latest.indexOf(bare) === 0)) {
                hints.push(_hintItem("^" + result.latest, Strings.NPM_HINT_LATEST_MINOR, "version"));
                hints.push(_hintItem("~" + result.latest, Strings.NPM_HINT_LATEST_PATCH, "version"));
            }
            matching.slice(0, MAX_VERSION_HINTS).forEach(function (version) {
                hints.push(_hintItem(version, null, "version", bare));
            });
            deferred.resolve({
                hints: hints,
                match: null,
                selectInitial: true,
                handleWideResults: false
            });
        }).catch(function () {
            deferred.reject();
        });
        return deferred;
    };

    /**
     * @param {string} implicitChar
     * @return {?({hints, match, selectInitial, handleWideResults}|jQuery.Deferred)}
     */
    NpmHints.prototype.getHints = function (implicitChar) {
        const ctxInfo = this.ctxInfo =
            JSONUtils.getContextInfo(this.editor, this.editor.getCursorPos(), true);
        if (!_depContext(ctxInfo)) {
            return null;
        }
        let query = _query(ctxInfo);
        if (ctxInfo.tokenType === JSONUtils.TOKEN_KEY) {
            if (query.length < MIN_QUERY_LENGTH && implicitChar === null) {
                // Explicit Ctrl-Space with little or nothing typed BEFORE the cursor (e.g. "n|yc"):
                // search the whole token instead - the user is asking about the name under the
                // cursor, and returning empty here would silently show nothing.
                const fullToken = JSONUtils.stripQuotes(ctxInfo.token.string).trim();
                if (fullToken.length > query.length && !JSONUtils.regexAllowedChars.test(fullToken)) {
                    query = fullToken;
                }
                if (!query.length) {
                    return { hints: [], match: null, selectInitial: true, handleWideResults: false };
                }
            } else if (query.length < MIN_QUERY_LENGTH) {
                // implicit (typing): wait for enough characters before hitting the registry
                return { hints: [], match: null, selectInitial: true, handleWideResults: false };
            }
            return this._nameHints(query, implicitChar === null);
        }
        // TOKEN_VALUE: version suggestions for the entry's package name
        return this._versionHints(ctxInfo.keyName, query);
    };

    /**
     * Show the highlighted package's full description in the side docs popup - the inline
     * description is a single ellipsized line, so long registry descriptions read there instead
     * (same surface the LSP completion docs use).
     * @param {jQuery} $hint - the highlighted anchor inside the hint list
     */
    NpmHints.prototype.onHighlight = function ($hint) {
        const $span = $hint.closest("li").data("hint"),
            doc = $span && $span.data && $span.data("npmDoc"),
            mode = $span && $span.data && $span.data("npmMode");
        // version-mode descriptions are two words - a popup would just echo the row. No name
        // header either: the highlighted row already shows exactly that.
        if (doc && mode === "name") {
            DefaultProviders.showHintDocPopup($hint, "<p>" + _.escape(doc) + "</p>");
        } else {
            DefaultProviders.hideHintDocPopup();
        }
    };

    /**
     * Insert the selected hint. Name inserts produce `"name": ""` with the caret inside the value
     * quotes and return true, chaining directly into a version-mode session.
     * @param {jQuery} $hint
     * @return {boolean} whether another session should start
     */
    NpmHints.prototype.insertHint = function ($hint) {
        const ctxInfo = JSONUtils.getContextInfo(this.editor, this.editor.getCursorPos(), false, true),
            pos = this.editor.getCursorPos(),
            mode = $hint.data("npmMode"),
            start = { line: pos.line, ch: -1 },
            end = { line: pos.line, ch: -1 };
        let completion = $hint.find(".hint-obj").text(),
            startChar,
            quoteChar = "\"";

        if (ctxInfo.tokenType === JSONUtils.TOKEN_KEY && mode === "name") {
            startChar = ctxInfo.token.string.charAt(0);
            if (/^['"]$/.test(startChar)) {
                quoteChar = startChar;
            }
            completion = quoteChar + completion + quoteChar;
            if (!ctxInfo.shouldReplace) {
                completion += ": \"\"";
            }
            start.ch = pos.ch - ctxInfo.offset;
            end.ch = ctxInfo.token.end;
            this.editor.document.replaceRange(completion, start, end);
            if (!ctxInfo.shouldReplace) {
                // place the caret between the value quotes and open the version list
                this.editor.setCursorPos(start.line, start.ch + completion.length - 1);
                return true;
            }
            return false;
        }
        if (ctxInfo.tokenType === JSONUtils.TOKEN_VALUE) {
            if (JSONUtils.regexAllowedChars.test(ctxInfo.token.string)) {
                start.ch = end.ch = pos.ch;
            } else if (ctxInfo.shouldReplace) {
                start.ch = ctxInfo.token.start;
                end.ch = ctxInfo.token.end;
            } else {
                start.ch = pos.ch - ctxInfo.offset;
                end.ch = ctxInfo.token.end;
            }
            startChar = ctxInfo.token.string.charAt(0);
            if (/^['"]$/.test(startChar)) {
                quoteChar = startChar;
            }
            this.editor.document.replaceRange(quoteChar + completion + quoteChar, start, end);
            return false;
        }
        return false;
    };

    exports.NpmHints = NpmHints;
    exports.DEP_SECTIONS = DEP_SECTIONS;
    exports.isPackageJson = _isPackageJson;
    exports.depContext = _depContext;
});
