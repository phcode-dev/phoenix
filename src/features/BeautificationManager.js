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

// @INCLUDE_IN_API_DOCS

/**
 * Beautification manager interacts with beautify extensions to determine what to do when user issues `beautify code`
 * command. Beautification providers can use this module to register new providers to beautify new languages.
 *
 * ## API
 * ### registerBeautificationProvider
 * Register a Beautification provider with this api.
 *
 * ```js
 * // syntax
 * BeautificationManager.registerBeautificationProvider(provider, supportedLanguages, priority);
 * ```
 * The API requires three parameters:
 * 1. `provider`: must implement a  `beautify` function which will be invoked to beautify code in editor. See doc below.
 * 1. `supportedLanguages`: An array of languages that the provider supports. If `["all"]` is supplied, then the
 *    provider will be invoked for all languages. Restrict to specific languages: Eg: `["javascript", "html", "php"]`
 * 1. `priority`: Used to break ties among providers for a particular language. Providers with a higher number
 *     will be asked for beatified code before those with a lower priority value. Defaults to zero.
 *
 * ```js
 * // to register a provider that will be invoked for all languages. where provider is any object that implements
 * // a beautify function
 * BeautificationManager.registerBeautificationProvider(provider, ["all"]);
 *
 * // to register a provider that will be invoked for specific languages
 * BeautificationManager.registerBeautificationProvider(provider, ["javascript", "html", "php"]);
 * ```
 *
 * ### removeBeautificationProvider
 * Removes a registered Beautification provider. The API takes the same arguments as `registerBeautificationProvider`.
 * ```js
 * // syntax
 * BeautificationManager.removeBeautificationProvider(provider, supportedLanguages);
 * // Example
 * BeautificationManager.removeBeautificationProvider(provider, ["javascript", "html"]);
 * ```
 *
 * ### beautify
 * Each provider must implement the `beautify` function that returns a promise. The promise either resolves with
 * the beautified code details or rejects if there is nothing to beautify for the provider.
 * ```js
 * // function signature
 * provider.beautify = function(editor) {
 *         return new Promise((resolve, reject)=>{
 *             resolve({
 *                 changedText: "partial or full text that changed.",
 *                 // Optional: If range is specified, only the given range will be replaced. else full text is replaced
 *                 ranges:{
 *                     replaceStart: {line,ch},
 *                     replaceEnd: {line,ch}
 *                 },
 *                 // optional cursorIndex enable `beautify on save feature` if provided.
 *                 cursorIndex: number
 *             });
 *         });
 *     };
 * ```
 *
 * #### The resoved promise object
 * The resolved promise should either be `null`(indicating that the extension itself has prettified the code and
 * doesn't want any further processing from BeautificationManager.) or contain the following details:
 * 1. `changedText` - string, this should be the fully prettified text of the whole file or a fragment of pretty text
 *    if a range was selected.
 *    - If a range is returned, then the beautification manger will replace only the range with changed text in editor.
 *    - Providing optional `cursorIndex` will enable `beautify on save feature`.
 * 1. `ranges` - Optional object, set of 2 cursors that gives details on what range to replace with given changed text.
 *    If range is not specified, the full text in the editor will be replaced. range has 2 fields:
 *    1. `replaceStart{line,ch}` - the start of range to replace
 *    1. `replaceEnd{line,ch}` - the end of range to replace
 * 1. `cursorIndex{number}` - Where to place the cursor after the text is replaced in editor. Note: this is number offset.
 * @module features/BeautificationManager
 */
define(function (require, exports, module) {


    const Commands = require("command/Commands"),
        Strings = require("strings"),
        AppInit = require("utils/AppInit"),
        CommandManager = require("command/CommandManager"),
        LanguageManager = require("language/LanguageManager"),
        Menus = require("command/Menus"),
        EditorManager = require("editor/EditorManager"),
        DocumentManager = require("document/DocumentManager"),
        ProviderRegistrationHandler = require("features/PriorityBasedRegistration").RegistrationHandler;

    let _providerRegistrationHandler = new ProviderRegistrationHandler(),
        registerBeautificationProvider = _providerRegistrationHandler
            .registerProvider.bind(_providerRegistrationHandler),
        removeBeautificationProvider = _providerRegistrationHandler
            .removeProvider.bind(_providerRegistrationHandler),
        beautifyCommand;

    function _getEnabledProviders(editor) {
        let filepath = editor.document.file.fullPath;
        let language = LanguageManager.getLanguageForPath(filepath);
        return _providerRegistrationHandler.getProvidersForLanguageId(language.getId());
    }

    async function _getBeautifiedCodeDetails(editor) {
        let enabledProviders = _getEnabledProviders(editor);

        for(let item of enabledProviders){
            if(!item.provider.beautify){
                console.error("Beautify providers must implement beautify function", item);
                continue;
            }
            try{
                let beautyObject = await item.provider.beautify(editor);
                if(beautyObject){
                    return beautyObject;
                }
            } catch (e) {
                // providers reject if they didn't beautify the code. We do nothing in the case as expected failure.
            }
        }
        throw new Error("No Providers beautified text");
    }

    function _onActiveEditorChange(_evt, current) {
        if(current && _getEnabledProviders(current).length){
            beautifyCommand.setEnabled(true);
            return;
        }
        beautifyCommand.setEnabled(false);
    }

    function _replaceText(editor, beautyObject) {
        if(beautyObject.ranges){
            let ranges = beautyObject.ranges;
            if(editor.document.getRange(ranges.replaceStart, ranges.replaceEnd) !== beautyObject.changedText){
                editor.setSelection(ranges.replaceStart, ranges.replaceEnd);
                editor.replaceSelection(beautyObject.changedText, 'around');
            }
        } else {
            if(editor.document.getRange({line: 0, ch: 0}, editor.getEndingCursorPos()) !== beautyObject.changedText){
                editor.setSelection({line: 0, ch: 0}, editor.getEndingCursorPos());
                editor.replaceSelection(beautyObject.changedText, 'around');
            }
        }
    }

    function _prettify() {
        let editor = EditorManager.getActiveEditor();
        if(!editor){
            return;
        }
        _getBeautifiedCodeDetails(editor).then(beautyObject => {
            if(!beautyObject || !beautyObject.changedText){
                return;
            }
            editor.operation(function () {
                _replaceText(editor, beautyObject);
            });
        }).catch(e=>{
            let message = editor.hasSelection() ? Strings.BEAUTIFY_ERROR_SELECTION : Strings.BEAUTIFY_ERROR;
            editor.displayErrorMessageAtCursor(message);
            console.log("No beautify providers responded", e);
        });
    }

    function _prettifyOnSave(_evt, doc) {
        let editor = EditorManager.getActiveEditor();
        if(!editor || editor.document.file.fullPath !== doc.file.fullPath){
            return;
        }
        editor.clearSelection();
        _getBeautifiedCodeDetails(editor).then(beautyObject => {
            if(!beautyObject || !beautyObject.changedText || !beautyObject.cursorIndex){
                return;
            }
            editor.operation(function () {
                _replaceText(editor, beautyObject);
                let cursor = editor.posFromIndex(beautyObject.cursorIndex);
                editor.setCursorPos(cursor.line, cursor.ch);
            });
        }).catch(e=>{
            console.log("No beautify providers responded for prettify on save", e);
        });
    }

    AppInit.appReady(function () {
        beautifyCommand = CommandManager.register(Strings.CMD_BEAUTIFY_CODE, Commands.EDIT_BEAUTIFY_CODE, ()=>{
            _prettify();
        });
        let editMenu = Menus.getMenu(Menus.AppMenuBar.EDIT_MENU);
        editMenu.addMenuItem(Commands.EDIT_BEAUTIFY_CODE, "");

        let editorContextMenu = Menus.getContextMenu(Menus.ContextMenuIds.EDITOR_MENU);
        editorContextMenu.addMenuItem(Commands.EDIT_BEAUTIFY_CODE, "", Menus.AFTER, Commands.EDIT_SELECT_ALL);
        EditorManager.on("activeEditorChange", _onActiveEditorChange);
        DocumentManager.on('documentSaved.beautificationManager', _prettifyOnSave);
    });

    exports.registerBeautificationProvider = registerBeautificationProvider;
    exports.removeBeautificationProvider = removeBeautificationProvider;
});
