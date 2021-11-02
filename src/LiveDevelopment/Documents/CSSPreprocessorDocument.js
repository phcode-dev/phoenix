/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2014 - 2021 Adobe Systems Incorporated. All rights reserved.
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
 * CSSPreprocessorDocument manages a single LESS or SASS source document
 *
 * __HIGHLIGHTING__
 *
 * CSSPreprocessorDocument supports highlighting all DOMNode corresponding to the rule at
 * the cursor position in the editor.
 *
 */
define(function CSSPreprocessorDocumentModule(require, exports, module) {


    var _               = require("thirdparty/lodash"),
        EventDispatcher = require("utils/EventDispatcher"),
        CSSUtils        = require("language/CSSUtils"),
        EditorManager   = require("editor/EditorManager"),
        HighlightAgent  = require("LiveDevelopment/Agents/HighlightAgent"),
        Inspector       = require("LiveDevelopment/Inspector/Inspector");

    /**
     * @constructor
     * @param {!Document} doc The source document from Brackets
     * @param {?Editor} editor The editor for this document. This is not used here since
     *                  we always need to get the active editor for a preprocessor document
     *                  and not the one passed in `editor`.
     */
    var CSSPreprocessorDocument = function CSSPreprocessorDocument(doc, editor) {
        this.doc = doc;

        this.onCursorActivity = this.onCursorActivity.bind(this);

        // Add a ref to the doc since we're listening for change events
        this.doc.addRef();
        this.onActiveEditorChange = this.onActiveEditorChange.bind(this);
        EditorManager.on("activeEditorChange", this.onActiveEditorChange);
        this.onActiveEditorChange(null, EditorManager.getActiveEditor(), null);
    };

    // CSSPreprocessorDocument doesn't dispatch events, but the "live document" interface requires an on() API
    EventDispatcher.makeEventDispatcher(CSSPreprocessorDocument.prototype);

    /** Close the document */
    CSSPreprocessorDocument.prototype.close = function close() {
        this.doc.off(".CSSPreprocessorDocument");
        EditorManager.off("activeEditorChange", this.onActiveEditorChange);
        this.doc.releaseRef();
        this.detachFromEditor();
    };

    /** Return false so edits cause "out of sync" icon to appear */
    CSSPreprocessorDocument.prototype.isLiveEditingEnabled = function () {
        // Normally this isn't called since wasURLRequested() returns false for us, but if user's
        // page uses less.js to dynamically load LESS files, then it'll be true and we'll get called.
        return false;
    };

    CSSPreprocessorDocument.prototype.attachToEditor = function (editor) {
        this.editor = editor;

        if (this.editor) {
            this.editor.on("cursorActivity.CSSPreprocessorDocument", this.onCursorActivity);
            this.updateHighlight();
        }
    };

    CSSPreprocessorDocument.prototype.detachFromEditor = function () {
        if (this.editor) {
            HighlightAgent.hide();
            this.editor.off(".CSSPreprocessorDocument");
            this.editor = null;
        }
    };

    CSSPreprocessorDocument.prototype.updateHighlight = function () {
        if (Inspector.config.highlight && this.editor) {
            var editor = this.editor,
                selectors = [];
            _.each(this.editor.getSelections(), function (sel) {
                var selector = CSSUtils.findSelectorAtDocumentPos(editor, (sel.reversed ? sel.end : sel.start));
                if (selector) {
                    selectors.push(selector);
                }
            });
            if (selectors.length) {
                HighlightAgent.rule(selectors.join(","));
            } else {
                HighlightAgent.hide();
            }
        }
    };

    /** Event Handlers *******************************************************/

    /** Triggered on cursor activity of the editor */
    CSSPreprocessorDocument.prototype.onCursorActivity = function onCursorActivity(event, editor) {
        this.updateHighlight();
    };

    /** Triggered when the active editor changes */
    CSSPreprocessorDocument.prototype.onActiveEditorChange = function (event, newActive, oldActive) {
        this.detachFromEditor();

        if (newActive && newActive.document === this.doc) {
            this.attachToEditor(newActive);
        }
    };

    // Export the class
    module.exports = CSSPreprocessorDocument;
});
