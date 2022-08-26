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
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, brackets */
//jshint-ignore:no-start
/**
 * This module beautifies HTML/JS/other language code with the help of prettier plugin
 * See https://prettier.io/docs/en/api.html for how to use prettier API and other docs
 * To test variour prettier options, See https://prettier.io/playground/
 */

define(function (require, exports, module) {

    const ExtensionUtils = brackets.getModule("utils/ExtensionUtils"),
        FeatureGate = brackets.getModule("utils/FeatureGate"),
        AppInit = brackets.getModule("utils/AppInit"),
        CommandManager = brackets.getModule("command/CommandManager"),
        Commands = brackets.getModule("command/Commands"),
        Menus = brackets.getModule("command/Menus"),
        Strings = brackets.getModule("strings"),
        EditorManager = brackets.getModule("editor/EditorManager"),
        ExtensionsWorker = brackets.getModule("worker/ExtensionsWorker");

    function prettify() {
        let editor = EditorManager.getActiveEditor();
        if(!editor){
            return;
        }

        let selection = editor.getSelections();
        if(selection.length >1){
            return; // dont beautify on multiple selections or cursors
        }
        selection = selection[0];
        let prettierParams ={
            text: editor.document.getText(),
            options: {
                parser: "babel",
                trailingComma: "none",
                tabWidth: 4,
                useTabs: false,
                printWidth: 80
            }
        };

        let beautifySelection = false, endIndex, charsToEndIndex;
        if(editor.hasSelection()){
            beautifySelection = true;
            prettierParams.options.rangeStart = editor.indexFromPos(selection.start);
            prettierParams.options.rangeEnd = editor.indexFromPos(selection.end);
            endIndex = editor.indexFromPos(editor.getEndingCursorPos());
            charsToEndIndex = endIndex - prettierParams.options.rangeEnd;
        }
        console.log(prettierParams);
        ExtensionsWorker.execPeer("prettify", prettierParams).then(response=>{
            if(!response){
                return;
            }
            let doc = editor.document;
            doc.batchOperation(function() {
                editor.document.setText(response);
                if(beautifySelection){
                    endIndex = editor.indexFromPos(editor.getEndingCursorPos());
                    editor.setSelection(editor.posFromIndex(prettierParams.options.rangeStart),
                        editor.posFromIndex(endIndex - charsToEndIndex));
                } else {
                    editor.setSelection({line: 0, ch:0}, editor.getEndingCursorPos());
                }
            });
        });
    }

    const FEATURE_PRETTIER = 'Phoenix-Prettier';
    FeatureGate.registerFeatureGate(FEATURE_PRETTIER, false);

    ExtensionUtils.loadStyleSheet(module, "prettier.css");

    function _createExtensionStatusBarIcon() {
        // create prettier ui elements here.
    }

    AppInit.appReady(function () {
        if (!FeatureGate.isFeatureEnabled(FEATURE_PRETTIER)) {
            return;
        }
        ExtensionsWorker.loadScriptInWorker(`${module.uri}/../worker/prettier-helper.js`);
        CommandManager.register(Strings.CMD_BEAUTIFY_CODE, Commands.EDIT_BEAUTIFY_CODE, prettify);
        let editMenu = Menus.getMenu(Menus.AppMenuBar.EDIT_MENU);
        editMenu.addMenuItem(Commands.EDIT_BEAUTIFY_CODE, "");

        let editorContextMenu = Menus.getContextMenu(Menus.ContextMenuIds.EDITOR_MENU);
        editorContextMenu.addMenuItem(Commands.EDIT_BEAUTIFY_CODE, "", Menus.AFTER, Commands.EDIT_SELECT_ALL);
        _createExtensionStatusBarIcon();
    });
});


