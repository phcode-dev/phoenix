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
// this is a state machine over an abstract syntax tree and is a bit complex. apologies to the reader.

define(function (require, exports, module) {
    const AppInit = require("utils/AppInit"),
        Editor = require("editor/Editor").Editor,
        LanguageManager     = require("language/LanguageManager"),
        CodeMirror = require("thirdparty/CodeMirror/lib/codemirror"),
        Commands            = require("command/Commands"),
        PreferencesManager  = require("preferences/PreferencesManager"),
        WorkspaceManager      = require("view/WorkspaceManager"),
        Strings             = require("strings"),
        Menus = require("command/Menus"),
        CommandManager     = require("command/CommandManager"),
        EditorManager = require("editor/EditorManager");

    const CMD_AUTO_RENAME_TAGS = "edit.autoRenameTags";

    const HTML_TAG_SYNC = ".htmlTagSync",
        MARK_TYPE_TAG_RENAME_START = "startTagSyncEdit",
        MARK_TYPE_TAG_RENAME_END = "endTagSyncEdit",
        MARK_TYPE_TAG_RENAME_ESCAPED = "escapeTagSyncEdit";

    const PREFERENCES_AUTO_RENAME_TAGS = "autoRenameTags";
    PreferencesManager.definePreference(PREFERENCES_AUTO_RENAME_TAGS, "boolean", true, {
        description: Strings.DESCRIPTION_AUTO_RENAME_TAGS
    });

    let syncEditEnabled = PreferencesManager.get(PREFERENCES_AUTO_RENAME_TAGS);

    const MARK_STYLE = {
            className: "editor-text-tag-sync-underline",
            clearWhenEmpty: false,
            inclusiveLeft: true,
            inclusiveRight: true
        }, MARK_STYLE_ESCAPE = {
            className: "editor-text-tag-sync-escape",
            clearWhenEmpty: false,
            inclusiveLeft: true,
            inclusiveRight: true
        };
    let activeEditor, marksPresent, tagPosition, langType;

    function clearRenameMarkers() {
        if(!marksPresent || !activeEditor){
            return;
        }
        marksPresent = false;
        activeEditor.off(Editor.EVENT_CHANGE + HTML_TAG_SYNC);
        activeEditor.clearAllMarks(MARK_TYPE_TAG_RENAME_START);
        activeEditor.clearAllMarks(MARK_TYPE_TAG_RENAME_END);
        activeEditor.clearAllMarks(MARK_TYPE_TAG_RENAME_ESCAPED);
    }

    function _getTagToken(cursor) {
        let curChar = activeEditor.getCharacterAtPosition(cursor);
        if(curChar === "<"){ // <|<  or <div>|</div> is not a valid tag edit point
            return null;
        }
        let token = activeEditor.getToken(cursor);
        if(token && token.string === "<>"){
            // empty tags are not syncable if they are not being edited
            return null;
        }
        if(token && token.type === "tag bracket" && token.string !== ">") {
            // the cursosr is just before the tag like: <|tag or </|tag or <|/tag ; but not <tag|>
            // move one step to <t|ag or </t|ag or </|tag ; position </|tag is still invalid tough
            cursor.ch++;
            token = activeEditor.getToken(cursor);
        } else if(langType === "xml" && token && (curChar === ">" || curChar === " ") && cursor.ch >= 1){
            // usually in xml <tag|> or <tag| > position, the ast will give > or " "
            token = activeEditor.getToken({line: cursor.line, ch: cursor.ch -1});
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

    function _repositionCursor(offset) {
        let mark = (tagPosition === "open") ?
            activeEditor.getAllMarks(MARK_TYPE_TAG_RENAME_START):
            activeEditor.getAllMarks(MARK_TYPE_TAG_RENAME_END);
        if(!mark.length) {
            // there is no mark here, don't do anything.
            return;
        }
        mark = mark[0].find();
        activeEditor.setCursorPos(mark.from.line, mark.from.ch+offset);
    }

    let ignoreChanges = false;
    function _changeHandler(_evt, _editor, changes) {
        if(!changes || !activeEditor || !changes.length || ignoreChanges || changes[0].origin === "undo"){
            return;
        }
        if(!marksPresent) {
            clearRenameMarkers();
            return;
        }
        const cursor = activeEditor.getCursorPos();
        const escapeMarks = activeEditor.findMarksAt(cursor, MARK_TYPE_TAG_RENAME_ESCAPED);
        if(escapeMarks.length){
            // so if the user pressed escape key while on a rename marker, we disable tag sync the rename temporarily
            // till user moves to a different tag
            return;
        }
        let mark = tagPosition === "open" ?
            activeEditor.findMarksAt(cursor, MARK_TYPE_TAG_RENAME_START):
            activeEditor.findMarksAt(cursor, MARK_TYPE_TAG_RENAME_END);
        if(!mark.length) {
            // there is no mark here, don't do anything.
            return;
        }
        mark = mark[0].find();
        const markedText = activeEditor.getTextBetween(mark.from, mark.to);
        if(!markedText && marksPresent && _isEditingEmptyTag()) {
            ignoreChanges = true;
            activeEditor.undo();
            activeEditor.operation(()=>{
                _replaceMarkText(MARK_TYPE_TAG_RENAME_START, "", "syncTagPaste");
                _replaceMarkText(MARK_TYPE_TAG_RENAME_END, "", "syncTagPaste");
            });
            ignoreChanges = false;
            return;
        }
        if(!markedText || markedText.includes(" ")){
            clearRenameMarkers();
            return;
        }
        const cursorOffsetInMark = cursor.ch - mark.from.ch;
        const tag = markedText.trim();
        let markToReplace = activeEditor.getAllMarks(MARK_TYPE_TAG_RENAME_END);
        if(tagPosition === "close"){
            markToReplace = activeEditor.getAllMarks(MARK_TYPE_TAG_RENAME_START);
        }
        if(!markToReplace.length) {
            return;
        }
        markToReplace = markToReplace[0].find();
        const markedReplaceText = activeEditor.getTextBetween(markToReplace.from, markToReplace.to);
        if(markedReplaceText === tag){
            return;
        }
        ignoreChanges = true;
        let editOrigin = changes[0].origin;
        if(changes[0].origin === "paste"){
            editOrigin = "syncTagPaste";
        }
        activeEditor.undo();
        activeEditor.operation(()=>{
            _replaceMarkText(MARK_TYPE_TAG_RENAME_START, tag, editOrigin);
            _replaceMarkText(MARK_TYPE_TAG_RENAME_END, tag, editOrigin);
            _repositionCursor(cursorOffsetInMark);
        });
        ignoreChanges = false;
    }

    function updateRenameMarkers(matchingTags, cursor) {
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
        if(!token || token.type === "tag") {
            return false;
        }
        // <| > or </| > or <|> or </|> or </|\n but not >|\n
        if((token.type === "tag bracket" || token.string === "</") && (curChar === " " || curChar === ">" ||
            (token.string !== ">" && !curChar))) {
            // if curChar is null, it means that its the last charecter
            return true;
        }
        return false;
    }

    function cursorActivity() {
        const cursor = activeEditor.getCursorPos();
        if(activeEditor.hasMultipleCursors()){
            clearRenameMarkers();
            return;
        }
        const startMark = activeEditor.findMarksAt(cursor, MARK_TYPE_TAG_RENAME_START);
        const endMark = activeEditor.findMarksAt(cursor, MARK_TYPE_TAG_RENAME_END);
        const escapeMark = activeEditor.findMarksAt(cursor, MARK_TYPE_TAG_RENAME_ESCAPED);
        if(startMark.length || endMark.length || escapeMark.length) {
            // there is already a mark here, don't do anything. This will come in play when the user is editing a start
            // or end tag and we need to sync update in change handler.
            return;
        }
        let token = _getTagToken(cursor);
        if(!token) {
            if(!_isEditingEmptyTag()){
                clearRenameMarkers();
            }
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

    function toggleAutoRenameTags() {
        PreferencesManager.set(PREFERENCES_AUTO_RENAME_TAGS, !PreferencesManager.get(PREFERENCES_AUTO_RENAME_TAGS));
    }

    function enableIfNeeded() {
        syncEditEnabled = PreferencesManager.get(PREFERENCES_AUTO_RENAME_TAGS);
        init();
    }

    const tagSyncFileModes = new Set(["htm", "html", "xhtml", "xml", "svg", "php"]);
    function _isTagSyncEditable(editor) {
        // ideally we can just listen to html sections within non-html files too instead of only accepting html file
        // types. This was the original impl but found that html text in markdown sync edit worked as a disaster
        // mostly due to codemirror issues in AST out of our scope. So we just do this full file switch now.
        const language = LanguageManager.getLanguageForPath(editor.document.file.fullPath);
        if(!language || !language.getId()){
            return false;
        }
        langType = language.getId();
        return tagSyncFileModes.has(language.getId());
    }

    function init() {
        if(activeEditor) {
            activeEditor.off(Editor.EVENT_CURSOR_ACTIVITY + HTML_TAG_SYNC);
            clearRenameMarkers();
        }
        if(!syncEditEnabled || (Phoenix.isTestWindow && !window.___syncEditEnabledForTests)){
            return;
        }
        activeEditor = EditorManager.getActiveEditor();
        langType = null;
        if(!activeEditor || !_isTagSyncEditable(activeEditor)) {
            return;
        }
        activeEditor.on(Editor.EVENT_CURSOR_ACTIVITY + HTML_TAG_SYNC, cursorActivity);
        cursorActivity();
    }

    function _handleEscapeKeyEvent(event) {
        if(!marksPresent || !activeEditor){
            return false;
        }
        const cursor = activeEditor.getCursorPos();
        const startMark = activeEditor.getAllMarks(MARK_TYPE_TAG_RENAME_START);
        const endMark = activeEditor.getAllMarks(MARK_TYPE_TAG_RENAME_END);
        let activeMark = (tagPosition === "open") ?
            activeEditor.findMarksAt(cursor, MARK_TYPE_TAG_RENAME_START):
            activeEditor.findMarksAt(cursor, MARK_TYPE_TAG_RENAME_END);
        if(activeMark.length){
            const mark = activeMark[0].find();
            activeEditor.markText(MARK_TYPE_TAG_RENAME_ESCAPED, mark.from, mark.to, MARK_STYLE_ESCAPE);
            startMark.length && startMark[0].clear();
            endMark.length && endMark[0].clear();
            return true;
        }
        return false;
    }

    AppInit.appReady(function () {
        EditorManager.on(EditorManager.EVENT_ACTIVE_EDITOR_CHANGED + HTML_TAG_SYNC, init);
        setTimeout(init, 1000);
        const toggleCmd = CommandManager.register(Strings.CMD_AUTO_RENAME_TAGS, CMD_AUTO_RENAME_TAGS,
            toggleAutoRenameTags);
        toggleCmd.setChecked(PreferencesManager.get(PREFERENCES_AUTO_RENAME_TAGS));
        Menus.getMenu(Menus.AppMenuBar.EDIT_MENU).addMenuItem(CMD_AUTO_RENAME_TAGS,
            "", Menus.AFTER, Commands.TOGGLE_CLOSE_BRACKETS);
        PreferencesManager.on("change", PREFERENCES_AUTO_RENAME_TAGS, ()=>{
            toggleCmd.setChecked(PreferencesManager.get(PREFERENCES_AUTO_RENAME_TAGS));
            enableIfNeeded();
        });
        enableIfNeeded();
        WorkspaceManager.addEscapeKeyEventHandler("tagSyncEdit", _handleEscapeKeyEvent);
    });
});

// todo tests
// delete key tests
// empty by delete tests
// backspace key tests
// empty by backspace tests
// copy paste on tag
// multi cursor disable
// click on div tag with syc edit. Now click on another unrelated `tag>|` at cursor. the original underline should go
// cursor positons after edit should be as expected. test for <d| <|d <dd|dd <|dddd <dddd| and </ countearpart
// escape key handling