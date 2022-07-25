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
 * Editor instance helpers for indentation relator editor flows.
 */

define(function (require, exports, module) {

    const CodeMirror = require("thirdparty/CodeMirror/lib/codemirror"),
        Menus = require("command/Menus");

    function _applyChanges(changeList) {
        // _visibleRange has already updated via its own Document listener. See if this change caused
        // it to lose sync. If so, our whole view is stale - signal our owner to close us.
        if (this._visibleRange) {
            if (this._visibleRange.startLine === null || this._visibleRange.endLine === null) {
                this.trigger("lostContent");
                return;
            }
        }

        // Apply text changes to CodeMirror editor
        var cm = this._codeMirror;
        cm.operation(function () {
            var change, newText, i;
            for (i = 0; i < changeList.length; i++) {
                change = changeList[i];
                newText = change.text.join('\n');
                if (!change.from || !change.to) {
                    if (change.from || change.to) {
                        console.error("Change record received with only one end undefined--replacing entire text");
                    }
                    cm.setValue(newText);
                } else {
                    cm.replaceRange(newText, change.from, change.to, change.origin);
                }

            }
        });

        // The update above may have inserted new lines - must hide any that fall outside our range
        this._updateHiddenLines();
    };

    /**
     * Responds to changes in the CodeMirror editor's text, syncing the changes to the Document.
     * There are several cases where we want to ignore a CodeMirror change:
     *  - if we're the master editor, editor changes can be ignored because Document is already listening
     *    for our changes
     *  - if we're a secondary editor, editor changes should be ignored if they were caused by us reacting
     *    to a Document change
     */
    function _handleEditorChange(changeList) {
        // we're currently syncing from the Document, so don't echo back TO the Document
        if (this._duringSync) {
            return;
        }

        // Secondary editor: force creation of "master" editor backing the model, if doesn't exist yet
        this.document._ensureMasterEditor();

        if (this.document._masterEditor !== this) {
            // Secondary editor:
            // we're not the ground truth; if we got here, this was a real editor change (not a
            // sync from the real ground truth), so we need to sync from us into the document
            // (which will directly push the change into the master editor).
            // FUTURE: Technically we should add a replaceRange() method to Document and go through
            // that instead of talking to its master editor directly. It's not clear yet exactly
            // what the right Document API would be, though.
            this._duringSync = true;
            this.document._masterEditor._applyChanges(changeList);
            this._duringSync = false;

            // Update which lines are hidden inside our editor, since we're not going to go through
            // _applyChanges() in our own editor.
            this._updateHiddenLines();
        }
        // Else, Master editor:
        // we're the ground truth; nothing else to do, since Document listens directly to us
        // note: this change might have been a real edit made by the user, OR this might have
        // been a change synced from another editor

        // The "editorChange" event is mostly for the use of the CodeHintManager.
        // It differs from the normal "change" event, that it's actually publicly usable,
        // whereas the "change" event should be listened to on the document. Also the
        // Editor dispatches a change event before this event is dispatched, because
        // CodeHintManager needs to hook in here when other things are already done.
        this.trigger("editorChange", this, changeList);
    }

    /**
     * Responds to changes in the Document's text, syncing the changes into our CodeMirror instance.
     * There are several cases where we want to ignore a Document change:
     *  - if we're the master editor, Document changes should be ignored because we already have the right
     *    text (either the change originated with us, or it has already been set into us by Document)
     *  - if we're a secondary editor, Document changes should be ignored if they were caused by us sending
     *    the document an editor change that originated with us
     */
    function _handleDocumentChange(event, doc, changeList) {
        // we're currently syncing to the Document, so don't echo back FROM the Document
        if (this._duringSync) {
            return;
        }

        if (this.document._masterEditor !== this) {
            // Secondary editor:
            // we're not the ground truth; and if we got here, this was a Document change that
            // didn't come from us (e.g. a sync from another editor, a direct programmatic change
            // to the document, or a sync from external disk changes)... so sync from the Document
            this._duringSync = true;
            this._applyChanges(changeList);
            this._duringSync = false;
        }
        // Else, Master editor:
        // we're the ground truth; nothing to do since Document change is just echoing our
        // editor changes
    }

    /**
     * Responds to the Document's underlying file being deleted. The Document is now basically dead,
     * so we must close.
     */
    function _handleDocumentDeleted(event) {
        // Pass the delete event along as the cause (needed in MultiRangeInlineEditor)
        this.trigger("lostContent", event);
    }

    /**
     * Responds to language changes, for instance when the file extension is changed.
     */
    function _handleDocumentLanguageChanged(event) {
        this._codeMirror.setOption("mode", this._getModeFromDocument());
    }


    /**
     * Install event handlers on the CodeMirror instance, translating them into
     * jQuery events on the Editor instance.
     */
    function _installEditorListeners() {
        var self = this;

        // Redispatch these CodeMirror key events as Editor events
        function _onKeyEvent(instance, event) {
            self.trigger("keyEvent", self, event);  // deprecated
            self.trigger(event.type, self, event);
            return event.defaultPrevented;   // false tells CodeMirror we didn't eat the event
        }
        this._codeMirror.on("keydown",  _onKeyEvent);
        this._codeMirror.on("keypress", _onKeyEvent);
        this._codeMirror.on("keyup",    _onKeyEvent);

        // FUTURE: if this list grows longer, consider making this a more generic mapping
        // NOTE: change is a "private" event--others shouldn't listen to it on Editor, only on
        // Document
        // Also, note that we use the new "changes" event in v4, which provides an array of
        // change objects. Our own event is still called just "change".
        this._codeMirror.on("changes", function (instance, changeList) {
            self.trigger("change", self, changeList);
        });
        this._codeMirror.on("beforeChange", function (instance, changeObj) {
            self.trigger("beforeChange", self, changeObj);
        });
        this._codeMirror.on("cursorActivity", function (instance) {
            self.trigger("cursorActivity", self);
        });
        this._codeMirror.on("beforeSelectionChange", function (instance, selectionObj) {
            self.trigger("beforeSelectionChange", selectionObj);
        });
        this._codeMirror.on("scroll", function (instance) {
            // If this editor is visible, close all dropdowns on scroll.
            // (We don't want to do this if we're just scrolling in a non-visible editor
            // in response to some document change event.)
            if (self.isFullyVisible()) {
                Menus.closeAll();
            }

            self.trigger("scroll", self);
        });

        // Convert CodeMirror onFocus events to EditorManager activeEditorChanged
        this._codeMirror.on("focus", function () {
            self._focused = true;
            self.trigger("focus", self);

        });

        this._codeMirror.on("blur", function () {
            self._focused = false;
            self.trigger("blur", self);
        });

        this._codeMirror.on("update", function (instance) {
            self.trigger("update", self);
        });
        this._codeMirror.on("overwriteToggle", function (instance, newstate) {
            self.trigger("overwriteToggle", self, newstate);
        });

        // Disable CodeMirror's drop handling if a file/folder is dropped
        this._codeMirror.on("drop", function (cm, event) {
            var files = event.dataTransfer.files;
            if (files && files.length) {
                event.preventDefault();
            }
        });
        // For word wrap. Code adapted from https://codemirror.net/demo/indentwrap.html#
        this._codeMirror.on("renderLine", function (cm, line, elt) {
            var charWidth = self._codeMirror.defaultCharWidth();
            var off = CodeMirror.countColumn(line.text, null, cm.getOption("tabSize")) * charWidth;
            elt.style.textIndent = "-" + off + "px";
            elt.style.paddingLeft = off + "px";
        });
    }

    /**
     * add required helpers to editor
     * @param Editor
     */
    function addHelpers(Editor) {
        Editor.prototype._applyChanges = _applyChanges;
        Editor.prototype._handleEditorChange = _handleEditorChange;
        Editor.prototype._handleDocumentChange = _handleDocumentChange;
        Editor.prototype._handleDocumentDeleted = _handleDocumentDeleted;
        Editor.prototype._handleDocumentLanguageChanged = _handleDocumentLanguageChanged;
        Editor.prototype._installEditorListeners = _installEditorListeners;
    }

    exports.addHelpers =addHelpers;
});
