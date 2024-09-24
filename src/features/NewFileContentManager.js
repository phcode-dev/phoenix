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

/*jslint regexp: true */

// @INCLUDE_IN_API_DOCS

/**
 * NewFileContentManager provides support to add default template content when a new/empty file is created.
 * Extensions can register to provide content with `NewFileContentManager.registerContentProvider` API.
 *
 * ## Usage
 * Let's say whenever a user creates a new js file, we have to prefill the contents to "sample content"
 *
 * @example
 * ```js
 * const NewFileContentManager = brackets.getModule("features/NewFileContentManager");
 * // replace `js` with language ID(Eg. javascript) if you want to restrict the preview to js files only. use `all` for
 * // all languages.
 * NewFileContentManager.registerContentProvider(exports, ["js"], 1);
 *
 * // provide a helpful name for the ContentProvider. This will be useful if you have to debug.
 * exports.CONTENT_PROVIDER_NAME = "extension.someName";
 * // now implement the getContent function that will be invoked when ever user creates a new empty file.
 * exports.getContent = function(fullPath) {
 *         return new Promise((resolve, reject)=>{
 *             resolve("sample content");
 *         });
 *     };
 * ```
 *
 * ## API
 * ### registerContentProvider
 * Register a Content provider with this api.
 *
 * @example
 * ```js
 * // syntax
 * NewFileContentManager.registerContentProvider(provider, supportedLanguages, priority);
 * ```
 * The API requires three parameters:
 * 1. `provider`: must implement a  `getContent` function which will be invoked to get the content. See API doc below.
 * 1. `supportedLanguages`: An array of languages that the provider supports. If `["all"]` is supplied, then the
 *    provider will be invoked for all languages. Restrict to specific languages: Eg: `["javascript", "html", "php"]`
 * 1. `priority`: Contents provided hy providers with higher priority will win if there are more than
 *    one provider registered for the language. Default is 0.
 *
 * @example
 * ```js
 * // to register a provider that will be invoked for all languages. where provider is any object that implements
 * // a getContent function
 * NewFileContentManager.registerContentProvider(provider, ["all"]);
 *
 * // to register a provider that will be invoked for specific languages
 * NewFileContentManager.registerContentProvider(provider, ["javascript", "html", "php"]);
 * ```
 *
 * ### removeContentProvider
 * Removes a registered content provider. The API takes the same arguments as `registerContentProvider`.
 *
 * @example
 * ```js
 * // syntax
 * NewFileContentManager.removeContentProvider(provider, supportedLanguages);
 * // Example
 * NewFileContentManager.removeContentProvider(provider, ["javascript", "html"]);
 * ```
 *
 * ### provider.getContent
 * Each provider must implement the `getContent` function that returns a promise. The promise either resolves with
 * the content text or rejects if there is no content made available by the provider.
 *
 * @example
 * ```js
 * exports.CONTENT_PROVIDER_NAME = "extension.someName"; // for debugging
 * // function signature
 * exports.getContent = function(fullPath) {
 *         return new Promise((resolve, reject)=>{
 *             resolve("sample content");
 *         });
 *     };
 * ```
 *
 * #### parameters
 * The function will be called with the path of the file that needs the content.
 * 1. `fullPath` - string path
 *
 * #### return types
 * A promise that resolves with the content text or rejects if there is no content made available by the provider.
 *
 * @module features/NewFileContentManager
 */

define(function (require, exports, module) {


    // Brackets modules
    const LanguageManager = require("language/LanguageManager"),
        ProviderRegistrationHandler = require("features/PriorityBasedRegistration").RegistrationHandler;

    const _providerRegistrationHandler = new ProviderRegistrationHandler(),
        registerContentProvider = _providerRegistrationHandler.registerProvider.bind(_providerRegistrationHandler),
        removeContentProvider = _providerRegistrationHandler.removeProvider.bind(_providerRegistrationHandler);

    function _getContent(results, providerInfos) {
        console.log("New File content: ", results, "Providers", providerInfos);
        for(let i=0; i< results.length; i++){
            // providers are already sorted in descending priority order
            let result = results[i];
            if(result.status === "fulfilled" && result.value){
                return result.value;
            }
        }

        return "";
    }

    /**
     * Returns a promise that resolves to the default text content of the given file after querying
     * all the content providers. If no text is returned by any providers, it will return an empty string "".
     * To get the default content given a path
     * NewFileContentManager.getInitialContentForFile("/path/to/file.jsx");
     * @param {string} fullPath
     * @returns {Promise<string>} The text contents
     */
    async function getInitialContentForFile(fullPath) {
        let language = LanguageManager.getLanguageForPath(fullPath);
        let contentProviders = _providerRegistrationHandler.getProvidersForLanguageId(language.getId());
        let providerPromises = [], activeProviderInfos = [];
        for(let providerInfo of contentProviders){
            let provider = providerInfo.provider;
            if(!provider.getContent){
                console.error("NewFileContentManager provider does not implement the required getContent function",
                    provider);
                continue;
            }
            providerPromises.push(provider.getContent(fullPath));
            activeProviderInfos.push(providerInfo);
        }
        let results = await Promise.allSettled(providerPromises);
        return _getContent(results, activeProviderInfos);
    }

    // public API
    exports.registerContentProvider = registerContentProvider;
    exports.removeContentProvider   = removeContentProvider;
    exports.getInitialContentForFile = getInitialContentForFile;
});
