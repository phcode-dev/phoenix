/*
 * Copyright (c) 2019 - present Adobe. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

define(function (require, exports, module) {


    const Commands = require("command/Commands"),
        Strings = require("strings"),
        AppInit = require("utils/AppInit"),
        CommandManager = require("command/CommandManager"),
        EditorManager = require("editor/EditorManager"),
        Editor              = require("editor/Editor").Editor,
        ProviderRegistrationHandler = require("features/PriorityBasedRegistration").RegistrationHandler;

    const JUMP_TO_DEF_MARKER = "jumpMarker";

    let _providerRegistrationHandler = new ProviderRegistrationHandler(),
        registerJumpToDefProvider = _providerRegistrationHandler.registerProvider.bind(_providerRegistrationHandler),
        removeJumpToDefProvider = _providerRegistrationHandler.removeProvider.bind(_providerRegistrationHandler);


    function _getJumpToDefProvider(editor, position = null) {
        let jumpToDefProvider = null;
        let language = editor.getLanguageForSelection(),
            enabledProviders = _providerRegistrationHandler.getProvidersForLanguageId(language.getId());


        enabledProviders.some(function (item, index) {
            // if canJumpToDef is not provided, we assume that the provicer can jump to definition.
            if (!item.provider.canJumpToDef || item.provider.canJumpToDef(editor, position)) {
                jumpToDefProvider = item.provider;
                return true;
            }
        });
        return jumpToDefProvider;
    }

    /**
     * Asynchronously asks providers to handle jump-to-definition.
     * @return {!Promise} Resolved when the provider signals that it's done; rejected if no
     * provider responded or the provider that responded failed.
     */
    function _doJumpToDef() {
        let request = null,
            result = new $.Deferred(),
            editor = EditorManager.getActiveEditor();

        if (!editor) {
            result.reject();
            return result.promise();
        }

        let jumpToDefProvider = _getJumpToDefProvider(editor);
        if (!jumpToDefProvider) {
            result.reject();
            return result.promise();
        }
        request = jumpToDefProvider.doJumpToDef(editor);

        if (!request) {
            result.reject();
            return result.promise();
        }

        request.done(function () {
            result.resolve();
        }).fail(function () {
            result.reject();
        });

        return result.promise();
    }

    function _clearHoverMarkers(editor) {
        if(editor && editor.hoverMarksPresent){
            editor.clearAllMarks(JUMP_TO_DEF_MARKER);
            editor.hoverMarksPresent = false;
        }
    }

    function _drawHoverMarkers(editor, pos) {
        if(editor){
            _clearHoverMarkers(editor);
            let jumpToDefProvider = _getJumpToDefProvider(editor, pos);
            if(jumpToDefProvider){
                editor.markToken(JUMP_TO_DEF_MARKER, pos, Editor.getMarkOptionHyperlinkText());
                editor.hoverMarksPresent = true;
            }
        }
    }

    function _hoverMarkersOnMouseMove(evt){
        let editor = EditorManager.getHoveredEditor(evt);
        _clearHoverMarkers(editor);
        if(editor && (evt.ctrlKey || evt.metaKey)){
            let pos = editor.coordsChar({left: evt.clientX, top: evt.clientY});
            // No preview if mouse is past last char on line
            if (pos.ch >= editor.document.getLine(pos.line).length) {
                return;
            }
            _drawHoverMarkers(editor, pos);
        }
    }

    AppInit.appReady(function () {
        let editorHolder = $("#editor-holder")[0];
        editorHolder.addEventListener("mousemove", _hoverMarkersOnMouseMove, true);
        editorHolder.addEventListener("keyup", _hoverMarkersOnMouseMove, true);
    });

    CommandManager.register(Strings.CMD_JUMPTO_DEFINITION, Commands.NAVIGATE_JUMPTO_DEFINITION, _doJumpToDef);

    exports.registerJumpToDefProvider = registerJumpToDefProvider;
    exports.removeJumpToDefProvider = removeJumpToDefProvider;
});
