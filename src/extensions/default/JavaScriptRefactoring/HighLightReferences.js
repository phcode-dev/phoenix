/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

define(function (require, exports, module) {


    let EditorManager        = brackets.getModule("editor/EditorManager"),
        ScopeManager         = brackets.getModule("JSUtils/ScopeManager"),
        Session              = brackets.getModule("JSUtils/Session"),
        MessageIds           = JSON.parse(brackets.getModule("text!JSUtils/MessageIds.json")),
        Editor               = brackets.getModule("editor/Editor").Editor;

    let session             = null;

    //Create new session
    function initializeSession(editor) {
        session = new Session(editor);
    }

    //Post message to tern node domain that will request tern server to find refs
    function getRefs(fileInfo, offset) {
        ScopeManager.postMessage({
            type: MessageIds.TERN_REFS,
            fileInfo: fileInfo,
            offset: offset
        });

        return ScopeManager.addPendingRequest(fileInfo.name, offset, MessageIds.TERN_REFS);
    }

    //Create info required to find reference
    function requestFindRefs(session, document, offset) {
        if (!document || !session) {
            return;
        }
        let path    = document.file.fullPath,
            fileInfo = {
                type: MessageIds.TERN_FILE_INFO_TYPE_FULL,
                name: path,
                offsetLines: 0,
                text: ScopeManager.filterText(session.getJavascriptText())
            };
        let ternPromise = getRefs(fileInfo, offset);

        return {promise: ternPromise};
    }

    // This is the highlight references under cursor feature. We should ideally move this to
    // features/findReferencesManager

    const HIGHLIGHT_REFS_MARKER = "JS_REFS";

    function _handleHighLightRefs(editor, refsResp) {
        if (!refsResp || !refsResp.references || !refsResp.references.refs) {
            return;
        }
        editor.operation(function () {
            for(let ref of refsResp.references.refs){
                if(editor.document.file.fullPath.endsWith(ref.file)){
                    editor.markText(HIGHLIGHT_REFS_MARKER, ref.start, ref.end, Editor.getMarkOptionMatchingRefs());
                }
            }
        });
    }

    function _hasASingleCursor(editor) {
        let selections = editor.getSelections();
        if(selections.length > 1){
            // multi cursor, no highlight
            return false;
        }
        let start = selections[0].start,
            end = selections[0].end;
        if(start.line !== end.line || start.ch !== end.ch){
            // has a range selection
            return false;
        }
        return true;
    }

    let allowedHighlightTypes = ["def", "variable", "variable-2", "variable-3", "property"];
    let lastHighlightToken = {};
    function _cursorActivity(_evt, editor) {
        // Only provide a JavaScript editor when cursor is in JavaScript content
        if (editor.getModeForSelection() !== "javascript") {
            return;
        }

        if(!_hasASingleCursor(editor)){
            editor.clearAllMarks(HIGHLIGHT_REFS_MARKER);
            return;
        }

        let token = editor.getToken();
        if(lastHighlightToken === token) {
            return;
        }

        editor.clearAllMarks(HIGHLIGHT_REFS_MARKER);
        lastHighlightToken = token;
        if(!allowedHighlightTypes.includes(token.type)){
            return;
        }

        let offset = session.getOffset();

        // only do this request if token under cursor is a variable type
        requestFindRefs(session, session.editor.document, offset).promise
            .done(response =>{
                _handleHighLightRefs(editor, response);
            })
            .fail(function (err) {
                console.error("find references failed with: ", err);
            });
    }

    function _activeEditorChanged(_evt,  current, previous) {
        if(previous){
            previous.off("cursorActivity.highlightRefs");
        }
        if(current){
            current.off("cursorActivity.highlightRefs");
            current.on("cursorActivity.highlightRefs", _cursorActivity);
            initializeSession(current);
            _cursorActivity(_evt, current);
        }
    }

    EditorManager.on("activeEditorChange", _activeEditorChanged);

    exports.HIGHLIGHT_REFS_MARKER = HIGHLIGHT_REFS_MARKER;
});
