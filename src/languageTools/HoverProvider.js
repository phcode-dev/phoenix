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
 * HoverProvider - shows LSP `textDocument/hover` documentation on mouse hover via the
 * QuickViewManager. This is the one provider the legacy DefaultProviders did not have.
 *
 * @module languageTools/HoverProvider
 */
define(function (require, exports, module) {


    // Hover styling lives in src/styles/brackets.less (.lsp-hover-quickview) so it tracks the
    // active light/dark theme.
    const marked = require("thirdparty/marked.min");

    /**
     * Convert LSP hover `contents` (MarkupContent | MarkedString | string | array of those)
     * into a single markdown string.
     */
    function _contentsToMarkdown(contents) {
        if (!contents) {
            return "";
        }
        if (typeof contents === "string") {
            return contents;
        }
        if (Array.isArray(contents)) {
            return contents.map(_contentsToMarkdown).filter(Boolean).join("\n\n---\n\n");
        }
        if (contents.kind) {
            // MarkupContent { kind: 'markdown' | 'plaintext', value }
            return contents.value || "";
        }
        if (contents.language) {
            // MarkedString { language, value }
            return "```" + contents.language + "\n" + (contents.value || "") + "\n```";
        }
        return contents.value || "";
    }

    function _renderContents(contents) {
        const markdown = _contentsToMarkdown(contents);
        if (!markdown || !markdown.trim()) {
            return null;
        }
        try {
            return marked.parse(markdown);
        } catch (e) {
            return null;
        }
    }

    /**
     * @param {Object} client - a LanguageClient from LSPClient.js
     */
    function HoverProvider(client) {
        this.client = client;
        this.QUICK_VIEW_NAME = "lsp.hover." + client.serverId;
    }

    HoverProvider.prototype.getQuickView = function (editor, pos, token, line) {
        const self = this;
        return new Promise(function (resolve, reject) {
            if (!self.client || !self.client.getServerCapabilities() ||
                    !self.client.getServerCapabilities().hoverProvider) {
                reject();
                return;
            }
            const filePath = editor.document.file._path;
            self.client.requestHover({ filePath: filePath, cursorPos: pos })
                .done(function (hover) {
                    const html = hover && _renderContents(hover.contents);
                    if (!html) {
                        reject();
                        return;
                    }
                    let start = { line: pos.line, ch: token.start };
                    let end = { line: pos.line, ch: token.end };
                    if (hover.range) {
                        start = { line: hover.range.start.line, ch: hover.range.start.character };
                        end = { line: hover.range.end.line, ch: hover.range.end.character };
                    }
                    resolve({
                        start: start,
                        end: end,
                        content: $("<div>").addClass("lsp-hover-quickview").html(html)
                    });
                })
                .fail(function () {
                    reject();
                });
        });
    };

    exports.HoverProvider = HoverProvider;
});
