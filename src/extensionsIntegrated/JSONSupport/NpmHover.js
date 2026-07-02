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
 * NpmHover - QuickView over package.json dependency entries: hovering a dependency's name (or
 * version) shows the package's registry summary - description, latest version, license and a
 * homepage link - in the same popup surface the LSP hover uses.
 *
 * @module extensionsIntegrated/JSONSupport/NpmHover
 */
define(function (require, exports, module) {


    const QuickViewManager = require("features/QuickViewManager"),
        JSONUtils = require("language/JSONUtils"),
        NativeApp = require("utils/NativeApp"),
        Strings = require("strings"),
        semver = require("thirdparty/semver.browser"),
        _ = require("thirdparty/lodash"),
        NpmHints = require("./NpmHints"),
        NpmRegistry = require("./NpmRegistry");

    function _externalLink(label, url) {
        return $("<a>").attr({ href: "#", title: url }).text(label)
            .on("click", function (e) {
                e.preventDefault();
                e.stopPropagation();
                NativeApp.openURLInDefaultBrowser(url);
            });
    }

    // The npm page for the DECLARED version when the range anchors a concrete one
    // ("^5.4.11" -> /v/5.4.11, where npmjs.com renders that version's README); otherwise the
    // package's main page.
    function _npmPageUrl(name, declaredRange) {
        const base = "https://www.npmjs.com/package/" + name;
        const anchor = (declaredRange || "").replace(/^[\s^~>=<]+/, "").trim();
        return semver.valid(anchor) ? base + "/v/" + anchor : base;
    }

    function _content(info, declaredRange) {
        const $content = $("<div>").addClass("lsp-hover-quickview npm-hover-quickview");
        const $doc = $("<div>").addClass("lsp-hover-doc").appendTo($content);

        const meta = [info.version && ("v" + info.version), info.license]
            .filter(Boolean).join(" · ");
        const $title = $("<p>").append($("<strong>").text(info.name));
        if (meta) {
            $title.append(document.createTextNode(" "))
                .append($("<span>").css("opacity", 0.65).text(meta));
        }
        $doc.append($title);

        if (info.description) {
            $doc.append($("<p>").text(info.description));
        }
        // links row: homepage on the left, "View docs" (the npm page, which renders the README
        // for the declared version) pinned bottom-right
        const $links = $("<p>").addClass("npm-hover-links");
        if (info.homepage && /^https?:\/\//.test(info.homepage)) {
            $links.append(_externalLink(Strings.NPM_HOVER_HOMEPAGE, info.homepage));
        }
        $links.append(_externalLink(Strings.NPM_HOVER_VIEW_DOCS, _npmPageUrl(info.name, declaredRange))
            .addClass("npm-hover-docs-link"));
        $doc.append($links);
        return $content;
    }

    const provider = {
        QUICK_VIEW_NAME: "npmPackageHover",

        getQuickView: function (editor, pos, token, line) {
            return new Promise(function (resolve, reject) {
                if (!NpmHints.isPackageJson(editor)) {
                    reject();
                    return;
                }
                const ctxInfo = JSONUtils.getContextInfo(editor, pos, true);
                if (!NpmHints.depContext(ctxInfo)) {
                    reject();
                    return;
                }
                // hovering the key gives the name directly; hovering the value gives it via keyName
                const onKey = ctxInfo.tokenType === JSONUtils.TOKEN_KEY;
                const name = onKey
                    ? JSONUtils.stripQuotes(ctxInfo.token.string).trim()
                    : ctxInfo.keyName;
                if (!name) {
                    reject();
                    return;
                }
                // declared range: the hovered token itself in value position; when hovering the
                // key, read it off the entry's line (JSONUtils does not fill valueName here)
                let declaredRange;
                if (onKey) {
                    const lineMatch = (line || editor.document.getLine(pos.line) || "")
                        .match(/:\s*"((?:[^"\\]|\\.)*)"/);
                    declaredRange = (lineMatch && lineMatch[1]) || "";
                } else {
                    declaredRange = JSONUtils.stripQuotes(ctxInfo.token.string || "").trim();
                }
                NpmRegistry.getPackageInfo(name).then(function (info) {
                    resolve({
                        start: { line: pos.line, ch: ctxInfo.token.start },
                        end: { line: pos.line, ch: ctxInfo.token.end },
                        content: _content(info, declaredRange)
                    });
                }).catch(function () {
                    reject();   // unknown/private package - show nothing
                });
            });
        }
    };

    /**
     * Register the dependency hover. Call once from appReady.
     */
    function init() {
        QuickViewManager.registerQuickViewProvider(provider, ["json"]);
    }

    exports.init = init;
    // for unit tests
    exports._content = _content;
    exports._npmPageUrl = _npmPageUrl;
});
