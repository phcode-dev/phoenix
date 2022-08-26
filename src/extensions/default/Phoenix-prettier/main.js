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
        PreferencesManager  = brackets.getModule("preferences/PreferencesManager"),
        ExtensionsWorker = brackets.getModule("worker/ExtensionsWorker");

    const prefs = PreferencesManager.getExtensionPrefs("beautify");
    prefs.definePreference("options", "object", {
        printWidth: 80,
        semi: true,
        trailingComma: "none",
        singleQuote: false,
        quoteProps: "as-needed",
        bracketSameLine: true,
        singleAttributePerLine: false,
        proseWrap: "always"
    }, {
        description: Strings.BEAUTIFY_OPTIONS,
        keys: {
            printWidth: {
                type: "number",
                description: Strings.BEAUTIFY_OPTION_PRINT_WIDTH,
                initial: 80
            },
            semi: {
                type: "boolean",
                description: Strings.BEAUTIFY_OPTION_SEMICOLON,
                initial: true
            },
            trailingComma: {
                type: "string",
                description: Strings.BEAUTIFY_OPTION_PRINT_TRAILING_COMMAS,
                values: ["none", "es5", "all"],
                initial: "none"
            },
            singleQuote: {
                type: "boolean",
                description: Strings.BEAUTIFY_OPTION_SINGLE_QUOTE,
                initial: false
            },
            quoteProps: {
                type: "string",
                description: Strings.BEAUTIFY_OPTION_QUOTE_PROPS,
                values: ["as-needed", "consistent", "preserve"],
                initial: "as-needed"
            },
            proseWrap: {
                type: "string",
                description: Strings.BEAUTIFY_OPTION_PROSE_WRAP,
                values: ["always", "never", "preserve"],
                initial: "always"
            },
            bracketSameLine: {
                type: "boolean",
                description: Strings.BEAUTIFY_OPTION_BRACKET_SAME_LINE,
                initial: true
            },
            singleAttributePerLine: {
                type: "boolean",
                description: Strings.BEAUTIFY_OPTION_SINGLE_ATTRIBUTE_PER_LINE,
                initial: false
            }
        }
    });

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
        let options = prefs.get("options");
        Object.assign(options, {
            parser: "babel",
            trailingComma: "none",
            tabWidth: 4,
            useTabs: false,
            printWidth: 80,
            filepath: editor.document.file.fullPath
        });

        let prettierParams ={
            text: editor.document.getText(),
            options: options
        };

        let beautifySelection = false;
        if(editor.hasSelection()){
            beautifySelection = true;
            prettierParams.options.rangeStart = editor.indexFromPos(selection.start);
            prettierParams.options.rangeEnd = editor.indexFromPos(selection.end);

            // fix prettier bug where it was not prettifying if something starts with comment
            let token = editor.getToken(selection.start);
            while(token && (token.type === null || token.type === "comment")){
                token = editor.getNextToken({line: token.line, ch: token.end});
            }
            let tokensIndex = editor.indexFromPos({line: token.line, ch: token.start});
            if(tokensIndex> prettierParams.options.rangeStart
                && tokensIndex < prettierParams.options.rangeEnd){
                prettierParams.options.rangeStart = tokensIndex;
            }
        }
        console.log(prettierParams);
        ExtensionsWorker.execPeer("prettify", prettierParams).then(response=>{
            if(!response || prettierParams.text === response){
                return;
            }
            let doc = editor.document;
            doc.batchOperation(function() {
                editor.operation(function () {
                    console.log(response.changedText);
                    if(beautifySelection){
                        editor.document.replaceRange(response.changedText, editor.posFromIndex(response.rangeStart),
                            editor.posFromIndex(response.rangeEndInOldText));
                        editor.setSelection(editor.posFromIndex(response.rangeStart),
                            editor.posFromIndex(response.rangeEnd), true);
                    } else {
                        editor.document.setText(response.text);
                        editor.setSelection({line: 0, ch: 0}, editor.getEndingCursorPos());
                    }
                });
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


