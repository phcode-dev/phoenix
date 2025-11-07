/*
 * Copyright (c) 2025 - present core.ai . All rights reserved.
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

/*eslint max-len: ["error", { "code": 200 }]*/
define(function (require, exports, module) {

    var LanguageTools = brackets.getModule("languageTools/LanguageTools"),
        AppInit = brackets.getModule("utils/AppInit"),
        ExtensionUtils = brackets.getModule("utils/ExtensionUtils"),
        PreferencesManager = brackets.getModule("preferences/PreferencesManager");

    var clientFilePath = ExtensionUtils.getModulePath(module, "client.js"),
        clientName = "TypeScriptLanguageServer",
        clientPromise = null,
        client = null;

    // Preference to enable/disable TypeScript/JavaScript LSP
    PreferencesManager.definePreference("languageTools.enableTypeScriptLSP", "boolean", true, {
        description: "Enable TypeScript/JavaScript Language Server Protocol support for enhanced code intelligence"
    });

    function isLSPEnabled() {
        return PreferencesManager.get("languageTools.enableTypeScriptLSP");
    }

    AppInit.appReady(function () {
        if (!isLSPEnabled()) {
            console.log("TypeScript LSP is disabled via preferences");
            return;
        }

        console.log("Initializing TypeScript Language Server...");

        // Initialize the TypeScript/JavaScript language client
        // Support both JavaScript and TypeScript files
        clientPromise = LanguageTools.initiateToolingService(
            clientName,
            clientFilePath,
            ['javascript', 'typescript', 'jsx', 'tsx']
        );

        clientPromise.done(function (languageClient) {
            client = languageClient;

            // Send custom request to set options
            client.sendCustomRequest({
                messageType: "brackets",
                type: "setOptions"
            }).then(function (response) {
                console.log("TypeScript Language Server initialized successfully:", response);
            }).catch(function (err) {
                console.error("Failed to set TypeScript Language Server options:", err);
            });

        }).fail(function (err) {
            console.error("Failed to initialize TypeScript Language Server:", err);
        });
    });

    // Listen for preference changes
    PreferencesManager.on("change", "languageTools.enableTypeScriptLSP", function () {
        var enabled = isLSPEnabled();
        if (enabled && !client) {
            console.log("TypeScript LSP enabled - restart Phoenix to activate");
        } else if (!enabled && client) {
            console.log("TypeScript LSP disabled - restart Phoenix to deactivate");
        }
    });

    exports.getClient = function () {
        return client;
    };
});
