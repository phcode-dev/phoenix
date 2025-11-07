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

/*eslint-env es6, node*/
/*eslint max-len: ["error", { "code": 200 }]*/

/**
 * TypeScript Language Server Client (Node.js side)
 *
 * ARCHITECTURE NOTE:
 * Phoenix runs in the browser, but this file runs in Node.js via Phoenix's NodeDomain.
 * Flow: Browser (main.js) → NodeDomain → Node.js (this file) → TypeScript LSP server
 *
 * This file:
 * 1. Runs in a Node.js process spawned by Phoenix's NodeConnection
 * 2. Creates a LanguageClient to manage the TypeScript language server
 * 3. Spawns the actual typescript-language-server as a child process
 * 4. Bridges LSP protocol between Phoenix (browser) and the language server (Node.js)
 */

var LanguageClient = require(global.LanguageClientInfo.languageClientPath).LanguageClient,
    path = require("path"),
    clientName = "TypeScriptLanguageServer",
    client = null;

function getServerOptions() {
    // Path to the typescript-language-server executable
    // Go from: src/extensions/default/TypeScriptLanguageServer/ to project root
    var serverPath = path.resolve(__dirname, "../../../../node_modules/.bin/typescript-language-server");

    var serverOptions = {
        command: serverPath,
        args: ["--stdio"]
    };

    return serverOptions;
}

function setOptions(params) {
    var options = {
        serverOptions: getServerOptions(),
        initializationOptions: {
            preferences: {
                // Enable all TypeScript/JavaScript features
                includeCompletionsForModuleExports: true,
                includeCompletionsWithInsertText: true,
                importModuleSpecifierPreference: "relative",
                allowIncompleteCompletions: true
            }
        }
    };

    client.setOptions(options);

    return Promise.resolve("TypeScript Language Server options set successfully");
}

function init(domainManager) {
    client = new LanguageClient(clientName, domainManager);
    client.addOnRequestHandler('setOptions', setOptions);
}

exports.init = init;
