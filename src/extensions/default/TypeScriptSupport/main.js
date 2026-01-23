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
 * TypeScript/JavaScript Language Support Extension
 *
 * This extension provides language support for TypeScript and JavaScript files
 * using the typescript-language-server via the pluggable LSP infrastructure.
 *
 * Features:
 * - Code completions (IntelliSense)
 * - Diagnostics (errors and warnings)
 *
 * Prerequisites:
 * - typescript-language-server must be installed globally:
 *   npm install -g typescript-language-server typescript
 */

define(function (require, exports, module) {

    const AppInit = brackets.getModule("utils/AppInit");
    const ProjectManager = brackets.getModule("project/ProjectManager");
    const CodeHintManager = brackets.getModule("editor/CodeHintManager");
    const EditorManager = brackets.getModule("editor/EditorManager");

    const LSP_CONNECTOR_ID = "ph-lsp";  // Shared LSP connector
    const SERVER_ID = "typescript";     // This extension's server ID

    const SUPPORTED_LANGUAGES = ['javascript', 'typescript', 'jsx', 'tsx'];

    let lspConnector = null;
    let initialized = false;
    let documentVersions = new Map();  // Track document versions for LSP

    /**
     * Check if this extension can run (desktop app with Node available)
     * @returns {boolean}
     */
    function canRun() {
        if (typeof Phoenix === 'undefined' || !Phoenix.isNativeApp) {
            return false;
        }
        const NodeConnector = brackets.getModule("NodeConnector");
        if (!NodeConnector || !NodeConnector.isNodeAvailable || !NodeConnector.isNodeAvailable()) {
            return false;
        }
        return true;
    }

    /**
     * Get the file URI for a document
     * @param {Document} doc - The document
     * @returns {string} - The file URI
     */
    function getFileUri(doc) {
        return "file://" + doc.file.fullPath;
    }

    /**
     * Get the LSP language ID for a document
     * @param {Document} doc - The document
     * @returns {string} - The language ID
     */
    function getLanguageId(doc) {
        const langId = doc.getLanguage().getId();
        // Map Phoenix language IDs to LSP language IDs
        const languageMap = {
            'javascript': 'javascript',
            'typescript': 'typescript',
            'jsx': 'javascriptreact',
            'tsx': 'typescriptreact'
        };
        return languageMap[langId] || langId;
    }

    /**
     * Get the next version number for a document
     * @param {string} uri - The document URI
     * @returns {number} - The next version number
     */
    function getNextVersion(uri) {
        const current = documentVersions.get(uri) || 0;
        const next = current + 1;
        documentVersions.set(uri, next);
        return next;
    }

    /**
     * TypeScript Code Hint Provider
     */
    class TypeScriptHintProvider {
        /**
         * Check if hints can be provided for this editor
         * @param {Editor} editor - The current editor
         * @param {string} implicitChar - The character that triggered hints
         * @returns {boolean} - True if hints can be provided
         */
        hasHints(editor, implicitChar) {
            if (!initialized || !lspConnector) {
                return false;
            }

            const langId = editor.document.getLanguage().getId();
            return SUPPORTED_LANGUAGES.includes(langId);
        }

        /**
         * Get completion hints for the current cursor position
         * @param {string} implicitChar - The character that triggered hints
         * @returns {Object|jQuery.Deferred} - Hint response object or deferred
         */
        getHints(implicitChar) {
            const editor = EditorManager.getActiveEditor();
            if (!editor || !initialized || !lspConnector) {
                return null;
            }

            const doc = editor.document;
            const pos = editor.getCursorPos();
            const uri = getFileUri(doc);

            const $deferred = $.Deferred();

            // Ensure document is open in LSP server and get completions
            (async () => {
                try {
                    // Send didOpen to ensure server has latest content
                    await lspConnector.execPeer('sendNotification', {
                        serverId: SERVER_ID,
                        method: 'textDocument/didOpen',
                        params: {
                            textDocument: {
                                uri: uri,
                                languageId: getLanguageId(doc),
                                version: getNextVersion(uri),
                                text: doc.getText()
                            }
                        }
                    });

                    // Request completions
                    const result = await lspConnector.execPeer('sendRequest', {
                        serverId: SERVER_ID,
                        method: 'textDocument/completion',
                        params: {
                            textDocument: { uri: uri },
                            position: { line: pos.line, character: pos.ch }
                        }
                    });

                    // Handle both array and CompletionList response formats
                    const items = result && (result.items || result) || [];

                    // Format hints for CodeHintManager
                    const hints = items.map(item => {
                        const $hint = $("<span>").addClass("brackets-ts-hints brackets-hints");
                        $hint.text(item.label);

                        // Add kind indicator
                        if (item.kind) {
                            const kindClass = getCompletionKindClass(item.kind);
                            $hint.addClass(kindClass);
                        }

                        // Add detail as tooltip
                        if (item.detail) {
                            $hint.attr('title', item.detail);
                        }

                        // Store the full item for insertion
                        $hint.data("item", item);

                        return $hint;
                    });

                    $deferred.resolve({
                        hints: hints,
                        match: null,
                        selectInitial: true,
                        handleWideResults: false
                    });
                } catch (err) {
                    console.warn("[TypeScript] Completion error:", err.message || err);
                    $deferred.reject();
                }
            })();

            return $deferred;
        }

        /**
         * Insert the selected hint
         * @param {jQuery} $hintObj - The selected hint element
         * @returns {boolean} - True to continue hinting session
         */
        insertHint($hintObj) {
            const editor = EditorManager.getActiveEditor();
            if (!editor) {
                return false;
            }

            const item = $hintObj.data("item");
            if (!item) {
                return false;
            }

            const cursor = editor.getCursorPos();

            // Use insertText if available, otherwise use label
            const insertText = item.insertText || item.label;

            // Find the start of the word being completed
            const line = editor.document.getLine(cursor.line);
            let startCh = cursor.ch;

            // Walk backwards to find word start
            while (startCh > 0 && /[\w$]/.test(line.charAt(startCh - 1))) {
                startCh--;
            }

            const start = { line: cursor.line, ch: startCh };
            const end = { line: cursor.line, ch: cursor.ch };

            editor.document.replaceRange(insertText, start, end);

            return false;
        }
    }

    /**
     * Get CSS class for completion item kind
     * @param {number} kind - The LSP CompletionItemKind
     * @returns {string} - CSS class name
     */
    function getCompletionKindClass(kind) {
        // LSP CompletionItemKind values
        const kindMap = {
            1: 'hint-text',
            2: 'hint-method',
            3: 'hint-function',
            4: 'hint-constructor',
            5: 'hint-field',
            6: 'hint-variable',
            7: 'hint-class',
            8: 'hint-interface',
            9: 'hint-module',
            10: 'hint-property',
            11: 'hint-unit',
            12: 'hint-value',
            13: 'hint-enum',
            14: 'hint-keyword',
            15: 'hint-snippet',
            16: 'hint-color',
            17: 'hint-file',
            18: 'hint-reference',
            19: 'hint-folder',
            20: 'hint-enum-member',
            21: 'hint-constant',
            22: 'hint-struct',
            23: 'hint-event',
            24: 'hint-operator',
            25: 'hint-type-parameter'
        };
        return kindMap[kind] || 'hint-unknown';
    }

    /**
     * Handle diagnostics from the LSP server
     * @param {Object} params - The publishDiagnostics params
     */
    function handleDiagnostics(params) {
        if (!params) {
            return;
        }
        const uri = params.uri;
        const diagnostics = params.diagnostics || [];

        // Log diagnostics for now - full integration with Problems panel can be added later
        if (diagnostics.length > 0) {
            console.log(`[TypeScript] ${diagnostics.length} diagnostics for ${uri}`);
            diagnostics.forEach(d => {
                if (d && d.severity && d.range && d.range.start) {
                    const severity = ['', 'Error', 'Warning', 'Info', 'Hint'][d.severity] || 'Unknown';
                    console.log(`  ${severity}: Line ${d.range.start.line + 1}: ${d.message}`);
                }
            });
        }
    }

    /**
     * Initialize the TypeScript language server
     */
    async function initialize() {
        if (!canRun()) {
            console.log("[TypeScript] Skipping - not desktop app or Node not available");
            return;
        }

        const NodeConnector = brackets.getModule("NodeConnector");
        if (!NodeConnector.isNodeReady()) {
            console.log("[TypeScript] Skipping - Node not ready");
            return;
        }

        console.log("[TypeScript] Initializing...");

        try {
            lspConnector = NodeConnector.createNodeConnector(LSP_CONNECTOR_ID, {});

            // Verify LSP connector is working with a timeout
            const pingPromise = lspConnector.execPeer('ping', {});
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Ping timeout')), 5000)
            );

            const pingResult = await Promise.race([pingPromise, timeoutPromise]);
            console.log("[TypeScript] LSP connector ping:", pingResult);

            // Get project root
            const projectRoot = ProjectManager.getProjectRoot();
            const rootPath = projectRoot ? projectRoot.fullPath : "/tmp";
            const rootUri = "file://" + rootPath;

            // Start TypeScript language server
            const startResult = await lspConnector.execPeer('startServer', {
                serverId: SERVER_ID,
                command: 'typescript-language-server',
                args: ['--stdio'],
                rootUri: rootUri
            });
            console.log("[TypeScript] Server started:", startResult);

            // Initialize LSP
            const initResult = await lspConnector.execPeer('sendRequest', {
                serverId: SERVER_ID,
                method: 'initialize',
                params: {
                    processId: null,
                    rootUri: rootUri,
                    capabilities: {
                        textDocument: {
                            completion: {
                                completionItem: {
                                    snippetSupport: false,
                                    documentationFormat: ['plaintext']
                                }
                            },
                            synchronization: {
                                didSave: true,
                                willSave: false,
                                willSaveWaitUntil: false
                            }
                        }
                    }
                }
            });
            console.log("[TypeScript] LSP initialized:", initResult);

            // Send initialized notification
            await lspConnector.execPeer('sendNotification', {
                serverId: SERVER_ID,
                method: 'initialized',
                params: {}
            });

            // Listen for LSP notifications (diagnostics, etc.)
            lspConnector.on('lspNotification', (event, data) => {
                if (!data || data.serverId !== SERVER_ID) {
                    return;
                }
                if (data.method === 'textDocument/publishDiagnostics') {
                    handleDiagnostics(data.params);
                }
            });

            // Listen for server exit
            lspConnector.on('serverExit', (event, data) => {
                if (data && data.serverId === SERVER_ID) {
                    console.log("[TypeScript] Server exited with code:", data.code);
                    initialized = false;
                }
            });

            // Register code hint provider
            const hintProvider = new TypeScriptHintProvider();
            CodeHintManager.registerHintProvider(hintProvider, SUPPORTED_LANGUAGES, 10);

            initialized = true;
            console.log("[TypeScript] Ready!");

        } catch (err) {
            console.warn("[TypeScript] Init failed:", err.message || err);
            console.warn("[TypeScript] Make sure typescript-language-server is installed:");
            console.warn("[TypeScript]   npm install -g typescript-language-server typescript");
            initialized = false;
            lspConnector = null;
        }
    }

    /**
     * Shut down the TypeScript language server
     */
    async function shutdown() {
        if (!initialized || !lspConnector) {
            return;
        }

        try {
            // Send shutdown request
            await lspConnector.execPeer('sendRequest', {
                serverId: SERVER_ID,
                method: 'shutdown',
                params: null
            });

            // Send exit notification
            await lspConnector.execPeer('sendNotification', {
                serverId: SERVER_ID,
                method: 'exit',
                params: null
            });

            // Stop the server
            await lspConnector.execPeer('stopServer', { serverId: SERVER_ID });

            initialized = false;
            console.log("[TypeScript] Shut down");
        } catch (err) {
            console.warn("[TypeScript] Shutdown error:", err.message || err);
        }
    }

    // Initialize when app is ready
    AppInit.appReady(function () {
        // Only initialize if we can run
        if (!canRun()) {
            return;
        }

        initialize().catch(err => {
            console.warn("[TypeScript] Init failed:", err.message || err);
        });
    });

    // Handle project changes
    ProjectManager.on("projectOpen", function () {
        if (initialized) {
            // Restart server for new project
            shutdown().then(() => {
                initialize();
            }).catch(err => {
                console.warn("[TypeScript] Restart failed:", err.message || err);
            });
        }
    });

    // Export for testing
    exports.initialize = initialize;
    exports.shutdown = shutdown;
});
