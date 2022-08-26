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
 *                 changedText: "partial or full text that changed. If partial, specify the range options below",
 *                 ranges:{
 *                     replaceStart: number,
 *                     replaceEnd: number,
 *                     selectStart: number,
 *                     selectEnd: number
 *                 }
 *             });
 *         });
 *     };
 * ```
 *
 * #### The resoved promise object
 * The resolved promise should contain the following details:
 * 1. changedText - string, this should be the fully prettified text of the whole file or a fragment of pretty text
 *    if a range was selected. If a range is selected, then the resolved object must contain a ranges attribute.
 *    This may also be null if the extension itself has prettified the code and doesn't want
 *    any further processing from BeautificationManager.
 * 1. ranges - is a set of 4 numbers that gives details on what changes are to be done to the BeautificationManager.
 *    it has 4 fields:
 *    1. replaceStart - number, the index from which the editor should replace the text in the original text editor.
 *       indexes can be obtained using the `editor.indexFromPos` API.
 *    1. replaceEnd - number, the index to which the editor should replace the text in the original text editor
 *    1. selectStart - number, the index from which the editor should select text based on new text indexes
 *    1. selectEnd - number, the index to which the editor should select text based on new text indexes
 * @module features/BeautificationManager
 */
define(function (require, exports, module) {


    const Commands = require("command/Commands"),
        Strings = require("strings"),
        AppInit = require("utils/AppInit"),
        CommandManager = require("command/CommandManager"),
        Menus = brackets.getModule("command/Menus"),
        EditorManager = require("editor/EditorManager"),
        ProviderRegistrationHandler = require("features/PriorityBasedRegistration").RegistrationHandler;

    let _providerRegistrationHandler = new ProviderRegistrationHandler(),
        registerBeautificationProvider = _providerRegistrationHandler
            .registerProvider.bind(_providerRegistrationHandler),
        removeBeautificationProvider = _providerRegistrationHandler
            .removeProvider.bind(_providerRegistrationHandler);

    async function _getBeautifiedCodeDetails(editor) {
        let language = editor.getLanguageForSelection(),
            enabledProviders = _providerRegistrationHandler.getProvidersForLanguageId(language.getId());

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
        return null;
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
            let doc = editor.document;
            doc.batchOperation(function() {
                editor.operation(function () {
                    console.log(beautyObject);
                    if(beautyObject.ranges){
                        let ranges = beautyObject.ranges;
                        editor.document.replaceRange(beautyObject.changedText,
                            editor.posFromIndex(ranges.replaceStart),
                            editor.posFromIndex(ranges.replaceEnd));
                            editor.setSelection(editor.posFromIndex(ranges.selectStart),
                            editor.posFromIndex(ranges.selectEnd), true);
                    } else {
                        editor.document.setText(beautyObject.changedText);
                        editor.setSelection({line: 0, ch: 0}, editor.getEndingCursorPos());
                    }
                });
            });
        }).catch(e=>{
            console.log("No beautify providers responded", e);
        });
    }

    AppInit.appReady(function () {
        CommandManager.register(Strings.CMD_BEAUTIFY_CODE, Commands.EDIT_BEAUTIFY_CODE, _prettify);
        let editMenu = Menus.getMenu(Menus.AppMenuBar.EDIT_MENU);
        editMenu.addMenuItem(Commands.EDIT_BEAUTIFY_CODE, "");

        let editorContextMenu = Menus.getContextMenu(Menus.ContextMenuIds.EDITOR_MENU);
        editorContextMenu.addMenuItem(Commands.EDIT_BEAUTIFY_CODE, "", Menus.AFTER, Commands.EDIT_SELECT_ALL);
        // todo active editor change and disable beautify if not supported
    });

    exports.registerBeautificationProvider = registerBeautificationProvider;
    exports.removeBeautificationProvider = removeBeautificationProvider;
});
