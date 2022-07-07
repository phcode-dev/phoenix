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

/*jslint regexp: true */

define(function (require, exports, module) {


    // Brackets modules
    var EditorManager           = brackets.getModule("editor/EditorManager"),
        ExtensionUtils          = brackets.getModule("utils/ExtensionUtils"),
        ProjectManager          = brackets.getModule("project/ProjectManager");

    // Local modules
    var InlineImageViewer       = require("InlineImageViewer");

    /**
     * Return the token string that is at the specified position.
     *
     * @param hostEditor {!Editor} editor
     * @param {!{line:Number, ch:Number}} pos
     * @return {String} token string at the specified position
     */
    function _getStringAtPos(hostEditor, pos) {
        var token = hostEditor._codeMirror.getTokenAt(pos, true);

        // If the pos is at the beginning of a name, token will be the
        // preceding whitespace or dot. In that case, try the next pos.
        if (!/\S/.test(token.string) || token.string === ".") {
            token = hostEditor._codeMirror.getTokenAt({line: pos.line, ch: pos.ch + 1}, true);
        }

        if (token.type === "string") {
            var string = token.string;

            // Strip quotes
            var ch = string[0];
            if (ch === "\"" || ch === "'") {
                string = string.substr(1);
            }
            ch = string[string.length - 1];
            if (ch === "\"" || ch === "'") {
                string = string.substr(0, string.length - 1);
            }

            return string;
        }

            // Check for url(...);
        var line = hostEditor._codeMirror.getLine(pos.line);
        var match = /url\s*\(([^)]*)\)/.exec(line);

        if (match && match[1]) {
                // URLs are relative to the doc
            var docPath = hostEditor.document.file.fullPath;

            docPath = docPath.substr(0, docPath.lastIndexOf("/"));

            return docPath + "/" + match[1];
        }


        return "";
    }

    /**
     * This function is registered with EditManager as an inline editor provider. It creates an inline editor
     * when cursor is on a JavaScript function name, find all functions that match the name
     * and show (one/all of them) in an inline editor.
     *
     * @param {!Editor} editor
     * @param {!{line:Number, ch:Number}} pos
     * @return {$.Promise} a promise that will be resolved with an InlineWidget
     *      or null if we're not going to provide anything.
     */
    function inlineImageViewerProvider(hostEditor, pos) {

        // Only provide image viewer if the selection is within a single line
        var sel = hostEditor.getSelection(false);
        if (sel.start.line !== sel.end.line) {
            return null;
        }

        // Always use the selection start for determining the image file name. The pos
        // parameter is usually the selection end.
        var fileName = _getStringAtPos(hostEditor, hostEditor.getSelection(false).start);
        if (fileName === "") {
            return null;
        }

        // Check for valid file extensions
        if (!/(\.png|\.jpg|\.jpeg|\.gif|\.webp|\.svg)$/i.test(fileName)) {
            return null;
        }

        // TODO: Check for relative path
        var projectPath = ProjectManager.getProjectRoot().fullPath;

        if (fileName.indexOf(projectPath) !== 0) {
            fileName = projectPath + fileName;
        }
        var result = new $.Deferred();

        var imageViewer = new InlineImageViewer(fileName.substr(fileName.lastIndexOf("/")), fileName);
        imageViewer.load(hostEditor);

        result.resolve(imageViewer);

        return result.promise();
    }

    ExtensionUtils.loadStyleSheet(module, "style.css");
    EditorManager.registerInlineEditProvider(inlineImageViewerProvider);
});
