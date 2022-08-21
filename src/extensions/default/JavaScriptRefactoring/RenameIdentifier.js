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
        TokenUtils           = brackets.getModule("utils/TokenUtils"),
        Strings              = brackets.getModule("strings"),
        Editor               = brackets.getModule("editor/Editor").Editor,
        ProjectManager      = brackets.getModule("project/ProjectManager");

    let session             = null,  // object that encapsulates the current session state
        keywords = ["define", "alert", "exports", "require", "module", "arguments"];

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
                    editor.markText(HIGHLIGHT_REFS_MARKER, ref.start, ref.end, Editor.MARK_OPTION_MATCHING_REFS);
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

        if(!_hasASingleCursor(editor)){
            return;
        }

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

    //Do rename of identifier which is at cursor
    function handleRename() {
        let editor = EditorManager.getActiveEditor(),
            offset, token;

        if (!editor) {
            return;
        }

        if (editor.getSelections().length > 1) {
            editor.displayErrorMessageAtCursor(Strings.ERROR_RENAME_MULTICURSOR);
            return;
        }
        initializeSession(editor);


        if (!editor || editor.getModeForSelection() !== "javascript") {
            return;
        }

        token = TokenUtils.getTokenAt(editor._codeMirror, editor._codeMirror.posFromIndex(session.getOffset()));

        if (keywords.indexOf(token.string) >= 0) {
            editor.displayErrorMessageAtCursor(Strings.ERROR_RENAME_GENERAL);
            return;
        }

        let result = new $.Deferred();

        function isInSameFile(obj, refsResp) {
            let projectRoot = ProjectManager.getProjectRoot(),
                projectDir,
                fileName = "";
            if (projectRoot) {
                projectDir = projectRoot.fullPath;
            }

            // get the relative path of File as Tern can also return
            // references with file name as a relative path wrt projectRoot
            // so refernce file name will be compared with both relative and absolute path to check if it is same file
            if (projectDir && refsResp && refsResp.file && refsResp.file.indexOf(projectDir) === 0) {
                fileName = refsResp.file.slice(projectDir.length);
            }
            // In case of unsaved files, After renameing once Tern is returning filename without forward slash
            return (obj && (obj.file === refsResp.file || obj.file === fileName
                            || obj.file === refsResp.file.slice(1, refsResp.file.length)));
        }

        function _multiFileRename(refs) {
            // TODO: Multi file rename here
            // note that before we enable this, we should load tern with the full code base to identify all
            // references properly. This sadly needs refactoring the current tern integration heavily
        }

        /**
         * Check if references are in this file only
         * If yes then select all references
         */
        function handleFindRefs (refsResp) {
            if (!refsResp || !refsResp.references || !refsResp.references.refs) {
                return;
            }

            let inlineWidget = EditorManager.getFocusedInlineWidget(),
                editor = EditorManager.getActiveEditor(),
                refs = refsResp.references.refs;

            //In case of inline widget if some references are outside widget's text range then don't allow for rename
            if (inlineWidget) {
                let isInTextRange  = !refs.find(function(item) {
                    return (item.start.line < inlineWidget._startLine || item.end.line > inlineWidget._endLine);
                });

                if (!isInTextRange) {
                    editor.displayErrorMessageAtCursor(Strings.ERROR_RENAME_QUICKEDIT);
                    return;
                }
            }

            let currentPosition = editor.posFromIndex(refsResp.offset),
                refsArray;
            refsArray = refs.filter(function (element) {
                return isInSameFile(element, refsResp);
            });
            if (refsArray.length !== refs.length) {
                // There are references across multiple files, we are not ready to handle this yet
                _multiFileRename(refs);
                return;
            }

            // Finding the Primary Reference in Array
            let primaryRef = refsArray.find(function (element) {
                return ((element.start.line === currentPosition.line || element.end.line === currentPosition.line)
                        && currentPosition.ch <= element.end.ch && currentPosition.ch >= element.start.ch);
            });
            // Setting the primary flag of Primary Refence to true
            primaryRef.primary = true;

            editor.setSelections(refsArray);
        }

        /**
         * Make a find ref request.
         * @param {Session} session - the session
         * @param {number} offset - the offset of where to jump from
         */
        function requestFindReferences(session, offset) {
            let response = requestFindRefs(session, session.editor.document, offset);

            if (response && response.hasOwnProperty("promise")) {
                response.promise.done(handleFindRefs).fail(function (errorMsg) {
                    EditorManager.getActiveEditor().displayErrorMessageAtCursor(errorMsg);
                    result.reject();
                });
            }
        }

        offset = session.getOffset();
        requestFindReferences(session, offset);

        return result.promise();
    }

    exports.handleRename = handleRename;
    exports.HIGHLIGHT_REFS_MARKER = HIGHLIGHT_REFS_MARKER;
});
