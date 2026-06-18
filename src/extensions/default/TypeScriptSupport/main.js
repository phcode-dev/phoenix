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

/**
 * TypeScript / JavaScript language support via the bundled `vtsls` language server.
 *
 * This extension is intentionally thin: all the heavy lifting lives in the shared
 * `languageTools/LSPClient` module, which it loads lazily (only on desktop, only once Node is
 * ready) so it never slows down boot. It just declares which languages map to which server and
 * what initialization options vtsls needs.
 */
define(function (require, exports, module) {


    const AppInit = brackets.getModule("utils/AppInit"),
        ProjectManager = brackets.getModule("project/ProjectManager"),
        NodeConnector = brackets.getModule("NodeConnector");

    const SERVER_ID = "typescript";
    const SUPPORTED_LANGUAGES = ["javascript", "typescript", "jsx", "tsx"];

    // Phoenix language id -> LSP languageId
    const LANGUAGE_ID_MAP = {
        javascript: "javascript",
        typescript: "typescript",
        jsx: "javascriptreact",
        tsx: "typescriptreact"
    };

    // vtsls-specific initialization options (mirrors the configuration Zed/VS Code use).
    const INITIALIZATION_OPTIONS = {
        vtsls: {
            experimental: {
                completion: {
                    enableServerSideFuzzyMatch: true,
                    entriesLimit: 5000
                }
            },
            autoUseWorkspaceTsdk: true
        }
    };

    let registered = false;
    let lspClientPromise = null;

    /**
     * Asynchronously load the shared LSP framework on demand (keeps boot fast - these modules
     * are not part of the boot dependency graph). Memoized; retries once to ride out any
     * module-load race during startup.
     * @return {Promise<Object>} the languageTools/LSPClient module
     */
    function loadLSPClient() {
        if (!lspClientPromise) {
            lspClientPromise = new Promise(function (resolve, reject) {
                brackets.getModule(["languageTools/LSPClient"], resolve, function () {
                    // Retry once - clear the require error state and try again on next tick.
                    setTimeout(function () {
                        brackets.getModule(["languageTools/LSPClient"], resolve, reject);
                    }, 500);
                });
            });
        }
        return lspClientPromise;
    }

    /**
     * LSP only runs in the desktop app where the Node engine is available.
     * @return {boolean}
     */
    function canRun() {
        return typeof Phoenix !== "undefined" && Phoenix.isNativeApp &&
            NodeConnector.isNodeAvailable && NodeConnector.isNodeAvailable();
    }

    /**
     * Resolve once the Node engine is ready (it is started lazily after boot).
     * @param {number} timeout - max time to wait in ms
     * @return {Promise<boolean>}
     */
    function waitForNodeReady(timeout) {
        return new Promise(function (resolve) {
            const deadline = Date.now() + timeout;
            (function check() {
                if (NodeConnector.isNodeReady()) {
                    resolve(true);
                } else if (Date.now() > deadline) {
                    resolve(false);
                } else {
                    setTimeout(check, 300);
                }
            }());
        });
    }

    async function start() {
        if (registered || !canRun()) {
            return;
        }
        const ready = await waitForNodeReady(30000);
        if (!ready) {
            console.error("[TypeScriptSupport] Node not ready - LSP disabled");
            return;
        }
        // Lazy-load the LSP framework only when we actually need it.
        const LSPClient = await loadLSPClient();
        const client = await LSPClient.registerLanguageServer({
            serverId: SERVER_ID,
            command: "vtsls",
            args: ["--stdio"],
            languages: SUPPORTED_LANGUAGES,
            languageIdMap: LANGUAGE_ID_MAP,
            initializationOptions: INITIALIZATION_OPTIONS
        });
        if (client) {
            registered = true;
        }
    }

    // Begin loading the LSP framework as soon as the (desktop-only) extension loads - the
    // reliable moment for module loading - so it is ready by the time start() runs.
    if (canRun()) {
        loadLSPClient();
    }

    AppInit.appReady(function () {
        if (!canRun()) {
            return;
        }
        start().catch(function (err) {
            console.error("[TypeScriptSupport] init failed", err && (err.message || err));
        });

        // Restart the server against the new workspace root when the project changes.
        ProjectManager.on("projectOpen", function () {
            if (registered) {
                loadLSPClient().then(function (LSPClient) {
                    LSPClient.restartLanguageServer(SERVER_ID);
                });
            }
        });
    });
});
