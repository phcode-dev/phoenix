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
    const marked = require("thirdparty/marked.min"),
        CommandManager = require("command/CommandManager"),
        Commands = require("command/Commands"),
        KeyBindingManager = require("command/KeyBindingManager"),
        QuickViewManager = require("features/QuickViewManager"),
        Strings = require("strings");

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
     * Build one clickable action row (icon + label + optional shortcut). Clicking places the cursor
     * at the hovered position, dismisses the hover popup, then runs the command - so jump/find
     * operate on the symbol the user hovered, not wherever the cursor happened to be.
     */
    function _action(iconClass, label, commandId, editor, pos, alignRight) {
        const $action = $("<div>").addClass("lsp-hover-action").attr("tabindex", "0");
        if (alignRight) {
            $action.addClass("lsp-hover-action--end");
        }
        $("<i>").addClass(iconClass + " lsp-hover-action-icon").appendTo($action);
        $("<span>").addClass("lsp-hover-action-label").text(label).appendTo($action);
        // The keyboard shortcut is surfaced as a tooltip (not inline) to keep the row compact.
        const shortcut = KeyBindingManager.getKeyBindingsDisplay(commandId);
        $action.attr("title", shortcut ? (label + " (" + shortcut + ")") : label);
        function run(e) {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            QuickViewManager.hideQuickView();
            editor.setCursorPos(pos.line, pos.ch);
            editor.focus();
            CommandManager.execute(commandId);
        }
        $action.on("click", run);
        $action.on("keydown", function (e) {
            if (e.keyCode === 13 || e.keyCode === 32) { // Enter / Space
                run(e);
            }
        });
        return $action;
    }

    /**
     * Build the action footer (Go to Definition / Find Usages), gated on what the server supports.
     * @return {?jQuery} the actions element, or null when no action is available.
     */
    function _buildActions(client, editor, pos) {
        const caps = client.getServerCapabilities() || {};
        const $actions = $("<div>").addClass("lsp-hover-actions");
        let count = 0;
        if (caps.definitionProvider) {
            $actions.append(_action("fa-solid fa-arrow-right", Strings.CMD_JUMPTO_DEFINITION,
                Commands.NAVIGATE_JUMPTO_DEFINITION, editor, pos));
            count++;
        }
        if (caps.referencesProvider) {
            $actions.append(_action("fa-solid fa-magnifying-glass", Strings.FIND_ALL_REFERENCES,
                Commands.CMD_FIND_ALL_REFERENCES, editor, pos, true));
            count++;
        }
        return count ? $actions : null;
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
                    const $content = $("<div>").addClass("lsp-hover-quickview");
                    $("<div>").addClass("lsp-hover-doc").html(html).appendTo($content);
                    const $actions = _buildActions(self.client, editor, pos);
                    if ($actions) {
                        $content.append($actions);
                    }
                    resolve({
                        start: start,
                        end: end,
                        content: $content
                    });
                })
                .fail(function () {
                    reject();
                });
        });
    };

    exports.HoverProvider = HoverProvider;
});
