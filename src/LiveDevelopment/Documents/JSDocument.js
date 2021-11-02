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

/*jslint forin: true */

/**
 * JSDocument manages a single JavaScript source document
 *
 * __EDITING__
 *
 * Editing the document will cause the script to be reloaded via the
 * ScriptAgent, which updates the implementation of all functions without
 * loosing any state. To support redrawing canvases, jQuery must be loaded
 * and a rerender method must be attached to every canvas that clears and
 * renders the canvas.
 *
 * __HIGHLIGHTING__
 *
 * JSDocument supports highlighting nodes from the HighlightAgent. Support
 * for highlighting the nodes that were created / touched by the current
 * line is missing.
 */
define(function JSDocumentModule(require, exports, module) {


    var EventDispatcher = require("utils/EventDispatcher"),
        Inspector       = require("LiveDevelopment/Inspector/Inspector"),
        ScriptAgent     = require("LiveDevelopment/Agents/ScriptAgent"),
        HighlightAgent  = require("LiveDevelopment/Agents/HighlightAgent");

    /**
     * @constructor
     * @param {!Document} doc The source document from Brackets
     * @param {!Editor} editor The editor for this document
     */
    var JSDocument = function JSDocument(doc, editor) {
        if (!editor) {
            return;
        }
        this.doc = doc;
        this.editor = editor;
        this.onHighlight = this.onHighlight.bind(this);
        this.onChange = this.onChange.bind(this);
        this.onCursorActivity = this.onCursorActivity.bind(this);
        HighlightAgent.on("highlight", this.onHighlight);
        this.editor.on("change", this.onChange);
        this.editor.on("cursorActivity", this.onCursorActivity);
        this.onCursorActivity();
    };

    // JSDocument doesn't dispatch events, but the "live document" interface requires having an on() API
    EventDispatcher.makeEventDispatcher(JSDocument.prototype);

    /** Close the document */
    JSDocument.prototype.close = function close() {
        if (!this.editor) {
            return;
        }
        HighlightAgent.off("highlight", this.onHighlight);
        this.editor.off("change", this.onChange);
        this.editor.off("cursorActivity", this.onCursorActivity);
        this.onHighlight();
    };

    JSDocument.prototype.script = function script() {
        return ScriptAgent.scriptForURL(this.doc.url);
    };


    /** Event Handlers *******************************************************/

    /** Triggered on cursor activity by the editor */
    JSDocument.prototype.onCursorActivity = function onCursorActivity(event, editor) {
    };

    /** Triggered on change by the editor */
    JSDocument.prototype.onChange = function onChange(event, editor, change) {
        var src = this.doc.getText();
        Inspector.Debugger.setScriptSource(this.script().scriptId, src, function onSetScriptSource(res) {
            Inspector.Runtime.evaluate("if($)$(\"canvas\").each(function(i,e){if(e.rerender)e.rerender()})");
        }.bind(this));
    };

    /** Triggered by the HighlightAgent to highlight a node in the editor */
    JSDocument.prototype.onHighlight = function onHighlight(event, node) {
        // clear an existing highlight
        var codeMirror = this.editor._codeMirror;
        var i;
        for (i in this._highlight) {
            codeMirror.removeLineClass(this._highlight[i], "wrap", "highlight");
        }
        this._highlight = [];
        if (!node || !node.trace) {
            return;
        }

        // go through the trace and find highlight the lines of this script
        var scriptId = this.script().scriptId;
        var callFrame, line;
        for (i in node.trace) {
            callFrame = node.trace[i];
            if (callFrame.location && callFrame.location.scriptId === scriptId) {
                line = callFrame.location.lineNumber;
                codeMirror.addLineClass(line, "wrap", "highlight");
                this._highlight.push(line);
            }
        }
    };

    // Export the class
    module.exports = JSDocument;
});
