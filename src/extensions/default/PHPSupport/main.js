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
 * PHPSupport - PHP code intelligence via the Intelephense language server: completion with docs,
 * hover, signature help, jump-to-definition, find references and diagnostics, all through the
 * shared LSP framework. Desktop only.
 *
 * The server is proprietary freeware and cannot ship with the app - see ServerInstaller for the
 * consent + on-demand npm install flow. Embedded JS/CSS/HTML inside .php files stays served by
 * the existing editors' providers (Tern et al); Intelephense serves the PHP regions.
 *
 * @module extensions/default/PHPSupport/main
 */
define(function (require, exports, module) {


    const AppInit = brackets.getModule("utils/AppInit"),
        ProjectManager = brackets.getModule("project/ProjectManager"),
        EditorManager = brackets.getModule("editor/EditorManager"),
        PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
        NodeConnector = brackets.getModule("NodeConnector"),
        Strings = brackets.getModule("strings"),
        ServerInstaller = require("./ServerInstaller");

    const SERVER_ID = "php";
    const SUPPORTED_LANGUAGES = ["php"];
    const PREF_LICENSE_KEY = "php.licenseKey";

    // Master switch; also doubles as the durable memory of a declined install prompt (the
    // decline sets it false; setting it back to true re-offers the install).
    PreferencesManager.definePreference(ServerInstaller.PREF_PHP_CODE_INTELLIGENCE, "boolean", true, {
        description: Strings.DESCRIPTION_PHP_CODE_INTELLIGENCE
    });
    // Intelephense premium licence key (or an absolute path to a key file). Owners of a licence
    // configured via the standard global licence file need not set this - the server finds that
    // file by itself.
    PreferencesManager.definePreference(PREF_LICENSE_KEY, "string", "", {
        description: Strings.DESCRIPTION_PHP_LICENSE_KEY
    });

    // Mutated in place before a restart when the licence key changes - registerLanguageServer
    // keeps a reference to this object, so restarts pick the new values up.
    const INITIALIZATION_OPTIONS = {};

    let lspClientPromise = null;
    let registered = false;
    let _client = null;
    let starting = false;
    let pendingRepoint = false;
    let initErrorReported = false;

    function canRun() {
        return Phoenix.isNativeApp && NodeConnector.isNodeAvailable();
    }

    function loadLSPClient() {
        if (!lspClientPromise) {
            lspClientPromise = new Promise(function (resolve, reject) {
                brackets.getModule(["languageTools/LSPClient"], resolve, function () {
                    setTimeout(function () {
                        brackets.getModule(["languageTools/LSPClient"], resolve, reject);
                    }, 500);
                });
            });
        }
        return lspClientPromise;
    }

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

    function _refreshInitializationOptions(clearCache) {
        const licenseKey = (PreferencesManager.get(PREF_LICENSE_KEY) || "").trim();
        // note the server's British spelling: licenceKey
        INITIALIZATION_OPTIONS.licenceKey = licenseKey || undefined;
        INITIALIZATION_OPTIONS.storagePath = ServerInstaller.getCachePlatformPath();
        INITIALIZATION_OPTIONS.globalStoragePath = ServerInstaller.getCachePlatformPath();
        INITIALIZATION_OPTIONS.clearCache = !!clearCache;
    }

    async function _registerServer(entryPath, upgraded) {
        if (registered) {
            return;
        }
        const LSPClient = await loadLSPClient();
        _refreshInitializationOptions(upgraded);
        const client = await LSPClient.registerLanguageServer({
            serverId: SERVER_ID,
            command: entryPath,                 // absolute .js entry, spawned on phnode itself
            args: ["--stdio"],
            languages: SUPPORTED_LANGUAGES,
            languageIdMap: { php: "php" },
            initializationOptions: INITIALIZATION_OPTIONS
        });
        if (client) {
            registered = true;
            _client = client;
        }
    }

    async function start() {
        if (registered || !canRun()) {
            return;
        }
        const ready = await waitForNodeReady(30000);
        if (!ready) {
            console.error("[PHPSupport] Node not ready - PHP LSP disabled");
            return;
        }
        const state = await ServerInstaller.installedState();
        if (!state.installed) {
            // not acquired yet: offer the unobtrusive consent UI (prompt toast + Problems-panel
            // row). Clicking Install runs the installer; its onInstalled callback starts us.
            ServerInstaller.offerInstallUI(_isPhpDocumentActive());
            return;
        }
        if (!state.pinMatches) {
            // silent version upgrade - consent was given when it first installed
            const result = await ServerInstaller.installNow();
            if (!result) {
                return;
            }
            // installNow's onInstalled callback registers the server
            return;
        }
        await _registerServer(ServerInstaller.getEntryPlatformPath(), false);
    }

    /**
     * True when the active editor's DOCUMENT is PHP. Deliberately not getLanguageForSelection:
     * the php mode is mixed, so a cursor inside an embedded <script> reports "javascript" - but
     * a php file is open either way and the server should be up.
     * @return {boolean}
     */
    function _isPhpDocumentActive() {
        const editor = EditorManager.getActiveEditor();
        if (!editor || !editor.document) {
            return false;
        }
        return editor.document.getLanguage().getId() === "php";
    }

    function _ensureServerForActiveEditor() {
        if (!canRun() || !_isPhpDocumentActive()) {
            return;
        }
        if (PreferencesManager.get(ServerInstaller.PREF_PHP_CODE_INTELLIGENCE) === false) {
            return;
        }
        if (!registered) {
            if (starting) {
                return;
            }
            starting = true;
            pendingRepoint = false;
            start().catch(function (err) {
                if (!initErrorReported) {
                    initErrorReported = true;
                    window.logger && window.logger.reportError(err, "[PHPSupport] PHP LSP init failed");
                }
            }).finally(function () {
                starting = false;
            });
            return;
        }
        if (pendingRepoint) {
            pendingRepoint = false;
            loadLSPClient().then(function (LSPClient) {
                LSPClient.changeWorkspaceRoot(SERVER_ID);
            });
        }
    }

    // Pre-warm the framework module (not the server) as soon as the extension loads.
    if (canRun()) {
        loadLSPClient();
    }

    AppInit.appReady(function () {
        if (!canRun()) {
            return;
        }

        ServerInstaller.init({
            onInstalled: function (result) {
                _registerServer(result.entryPath, result.upgraded).catch(function (err) {
                    window.logger && window.logger.reportError(err, "[PHPSupport] start after install failed");
                });
            }
        });

        EditorManager.on("activeEditorChange.phpSupport", function () {
            _ensureServerForActiveEditor();
            ServerInstaller.updatePanelRow(_isPhpDocumentActive() && !registered);
        });
        _ensureServerForActiveEditor();

        ProjectManager.on(ProjectManager.EVENT_PROJECT_OPEN + ".phpSupport", function () {
            pendingRepoint = true;
            _ensureServerForActiveEditor();
        });

        // Licence key change: restart the running server so the new key applies (premium features
        // activate server-side at initialize time). If not running yet, the next start picks it up.
        PreferencesManager.on("change", PREF_LICENSE_KEY, function () {
            if (registered) {
                _refreshInitializationOptions(false);
                loadLSPClient().then(function (LSPClient) {
                    LSPClient.restartLanguageServer(SERVER_ID);
                });
            }
        });

        // Master switch flipped back on (e.g. after an earlier decline): offer install again on
        // the currently open php file.
        PreferencesManager.on("change", ServerInstaller.PREF_PHP_CODE_INTELLIGENCE, function () {
            if (PreferencesManager.get(ServerInstaller.PREF_PHP_CODE_INTELLIGENCE) !== false) {
                _ensureServerForActiveEditor();
            }
        });
    });

    // for tests
    exports._ensureServerForActiveEditor = _ensureServerForActiveEditor;
    exports.SERVER_ID = SERVER_ID;
    if (Phoenix.isTestWindow) {
        // the registered LanguageClient (null until the server has started) - lets integration
        // tests drive the LSP providers/requests directly
        exports._getClient = function () {
            return _client;
        };
    }
});
