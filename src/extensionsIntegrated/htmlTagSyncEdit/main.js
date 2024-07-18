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

/*global*/

// This file handles synchronous tag edit for html files. ie, if we edit <div> then the </div> part is also updated.

define(function (require, exports, module) {
    const AppInit = require("utils/AppInit"),
        Editor = require("editor/Editor").Editor,
        CodeMirror = require("thirdparty/CodeMirror/lib/codemirror"),
        EditorManager = require("editor/EditorManager");

    const HTML_TAG_SYNC = ".htmlTagSync",
        MARK_TYPE_TAG_RENAME_START = "startTagSyncEdit",
        MARK_TYPE_TAG_RENAME_END = "endTagSyncEdit";
    const MARK_STYLE = {
        className: "editor-text-tag-sync-underline",
        clearWhenEmpty: false,
        inclusiveLeft: true,
        inclusiveRight: true
    };
    let activeEditor, marksPresent, tagPosition;

    const tagSyncFileModes = new Set(["htm", "html", "xhtml", "xml"]);

    function isTagSyncEditable() {
        if (!activeEditor) {
            return false;
        }
        let language = activeEditor.getLanguageForSelection();
        return tagSyncFileModes.has(language.getId());
    }

    function clearRenameMarkers() {
        if(!marksPresent || !activeEditor){
            return;
        }
        marksPresent = false;
        activeEditor.off(Editor.EVENT_CHANGE + HTML_TAG_SYNC);
        activeEditor.clearAllMarks(MARK_TYPE_TAG_RENAME_START);
        activeEditor.clearAllMarks(MARK_TYPE_TAG_RENAME_END);
    }

    function _getTagToken(cursor) {
        let token = activeEditor.getToken(cursor);
        if(token && token.type === "tag bracket") {// the cursosr is just before the tag like: <|tag or </|tag or <|/tag
            cursor.ch++; // move one step to <t|ag or </t|ag or </|tag ; position </|tag is still invalid tough
            token = activeEditor.getToken(cursor);
        }
        if(!token || !(token.type === "tag" || token.type === "tag error")) {
            return null;
        }
        return token;
    }

    function _replaceMarkText(markType, text, editOrigin) {
        let markToReplace = activeEditor.getAllMarks(markType);
        if(!markToReplace.length) {
            return;
        }
        markToReplace = markToReplace[0].find();
        activeEditor.replaceRange(text, markToReplace.from, markToReplace.to, editOrigin);
    }

    let ignoreChanges = false;
    function _changeHandler(_evt, _editor, changes) {
        if(!changes || !changes.length || ignoreChanges || changes[0].origin === "undo"){
            return;
        }
        const cursor = activeEditor.getCursorPos();
        let token = _getTagToken(cursor);
        if(!token && marksPresent && _isEditingEmptyTag()) {
            ignoreChanges = true;
            _replaceMarkText(MARK_TYPE_TAG_RENAME_START, "", "syncTagPaste");
            _replaceMarkText(MARK_TYPE_TAG_RENAME_END, "", "syncTagPaste");
            ignoreChanges = false;
            return;
        }
        if(!token || !marksPresent) {
            clearRenameMarkers();
            return;
        }
        const tag = token.string;
        let markToReplace = activeEditor.getAllMarks(MARK_TYPE_TAG_RENAME_END);
        if(tagPosition === "close"){
            markToReplace = activeEditor.getAllMarks(MARK_TYPE_TAG_RENAME_START);
        }
        if(!markToReplace.length) {
            return;
        }
        markToReplace = markToReplace[0].find();
        const markedText = activeEditor.getTextBetween(markToReplace.from, markToReplace.to);
        if(markedText === tag){
            return;
        }
        ignoreChanges = true;
        if(changes[0].origin === "paste"){
            activeEditor.undo();
            activeEditor.operation(()=>{
                _replaceMarkText(MARK_TYPE_TAG_RENAME_START, tag, "syncTagPaste");
                _replaceMarkText(MARK_TYPE_TAG_RENAME_END, tag, "syncTagPaste");
            });
            ignoreChanges = false;
            return;
        }
        activeEditor.replaceRange(tag, markToReplace.from, markToReplace.to, changes[0].origin);
        ignoreChanges = false;
    }

    function updateRenameMarkers(matchingTags, cursor) {
        // todo multi cursor
        const tagName = matchingTags.open.tag;
        let openPos = matchingTags.open.from,
            closePos = matchingTags.close.from;
        clearRenameMarkers();
        marksPresent = true;
        tagPosition = matchingTags.at;
        // we have to mark only the tag in an open tag of form <|tag| attr="...>
        const openPosStart = {line: openPos.line, ch: openPos.ch +1};
        const openPosEnd = {line: openPos.line, ch: openPos.ch + 1 + tagName.length};
        activeEditor.markText(MARK_TYPE_TAG_RENAME_START, openPosStart, openPosEnd, MARK_STYLE);
        // we have to mark only the tag in an open tag of form </|tag| attr="...>
        const closePosStart = {line: closePos.line, ch: closePos.ch +2};
        const closePosEnd = {line: closePos.line, ch: closePos.ch + 2 + tagName.length};
        activeEditor.markText(MARK_TYPE_TAG_RENAME_END, closePosStart, closePosEnd, MARK_STYLE);
        activeEditor.on(Editor.EVENT_CHANGE + HTML_TAG_SYNC, _changeHandler);
    }

    /**
     * we are editing an empty tag if cursor is something like <|> or <| > or <| class=""> or </|> or </| >
     * @param cursor
     * @returns {*|null|boolean}
     * @private
     */
    function _isEditingEmptyTag() {
        if(!marksPresent){
            return false;
        }
        const cursor = activeEditor.getCursorPos();
        let token = activeEditor.getToken(cursor);
        let curChar = activeEditor.getCharacterAtPosition(cursor);
        if(!token || !curChar || token.type === "tag") {
            return false;
        }
        // <| > or </| > or <|> or </|>
        if((token.type === "tag bracket" || token.string === "</") && (curChar === " " || curChar === ">")) {
            return true;
        }
        return false;
    }

    function cursorActivity() {
        const isTagEditableDoc = isTagSyncEditable();
        if(!isTagEditableDoc){
            clearRenameMarkers();
            return;
        }
        const cursor = activeEditor.getCursorPos();
        let token = _getTagToken(cursor);
        if(!token) {
            if(!_isEditingEmptyTag()){
                clearRenameMarkers();
            }
            return;
        }
        const startMark = activeEditor.findMarksAt(cursor, MARK_TYPE_TAG_RENAME_START);
        const endMark = activeEditor.findMarksAt(cursor, MARK_TYPE_TAG_RENAME_END);
        if(startMark.length || endMark.length) {
            // there is already a mark here, don't do anything. This will come in play when the user is editing a start
            // or end tag and we need to sync update in change handler.
            return;
        }
        const matchingTags = CodeMirror.findMatchingTag(activeEditor._codeMirror, cursor);
        if(!matchingTags) {
            clearRenameMarkers();
            return;
        }
        if(!matchingTags.close){
            clearRenameMarkers();
            return;
        }
        updateRenameMarkers(matchingTags, cursor);
    }

    AppInit.appReady(function () {
        EditorManager.on(EditorManager.EVENT_ACTIVE_EDITOR_CHANGED + HTML_TAG_SYNC, ()=>{
            if(activeEditor) {
                activeEditor.off(Editor.EVENT_CURSOR_ACTIVITY + HTML_TAG_SYNC);
                clearRenameMarkers();
            }
            activeEditor = EditorManager.getActiveEditor();
            if(!activeEditor){
                return;
            }
            activeEditor.on(Editor.EVENT_CURSOR_ACTIVITY + HTML_TAG_SYNC, cursorActivity);
            cursorActivity();
        });
    });
});
