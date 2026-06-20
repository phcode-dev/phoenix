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
 * Project-wide code intelligence for JavaScript/TypeScript - on by default.
 *
 * vtsls (tsserver) only analyses your *whole* project - cross-file Find Usages, rename,
 * go-to-definition into other files - when it can find an on-disk `tsconfig.json`/`jsconfig.json`.
 * Without one it falls back to an "inferred project" scoped to the open file and its imports.
 *
 * Rather than nag with a dialog, we make project-wide intelligence the default: the first time a
 * JS/TS file is opened in a project that has no config, we silently create a `jsconfig.json` and
 * show an unobtrusive toast ("See Config" / "Enable TypeScript" / "Learn more"). We always create a
 * `jsconfig.json` - never a `tsconfig.json` - because jsconfig is editor-only (the TS compiler and
 * bundlers ignore it, so it can never change a build) yet still scopes `.ts` files project-wide.
 * To opt out, the user opens the config and deletes it; we remember (PREF_CREATED) and won't
 * recreate it - instead the Problems panel offers a one-click re-enable.
 *
 * Desktop-only (the LSP is desktop-only); never runs in test windows (it would write configs into
 * fixtures and break tests).
 *
 * @module extensionsIntegrated/TypeScriptSupport/CodeIntelligence
 */
define(function (require, exports, module) {


    const ProjectManager = brackets.getModule("project/ProjectManager"),
        EditorManager = brackets.getModule("editor/EditorManager"),
        MainViewManager = brackets.getModule("view/MainViewManager"),
        FileSystem = brackets.getModule("filesystem/FileSystem"),
        CommandManager = brackets.getModule("command/CommandManager"),
        Commands = brackets.getModule("command/Commands"),
        NotificationUI = brackets.getModule("widgets/NotificationUI"),
        NativeApp = brackets.getModule("utils/NativeApp"),
        PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
        StringUtils = brackets.getModule("utils/StringUtils"),
        Strings = brackets.getModule("strings");

    // Per-project persisted flag: Phoenix has created a config here at least once. We never
    // auto-create again once set, so deleting the config (the opt-out) sticks; the Problems-panel
    // row then offers to re-enable.
    const PREF_CREATED = "tsCodeIntel.created";

    // "Learn more" -> the TypeScript/JavaScript config reference (documents every compilerOption in
    // the jsconfig.json we generate: module, target, moduleResolution, checkJs, jsx, ...).
    const DOCS_URL = "https://www.typescriptlang.org/tsconfig/";

    // The single config we ever create. Editor-only (build-safe) and scopes .ts as well as .js.
    const CONFIG_FILE = "jsconfig.json";
    // Configs whose presence means the project is already scoped - leave it alone.
    const EXISTING_CONFIG_FILES = ["tsconfig.json", "jsconfig.json"];

    // Languages that map to a "TypeScript" label.
    const TS_LANGUAGES = ["typescript", "tsx"];

    // Modern, type-error-free defaults. `jsx: "react"` only affects .jsx/.tsx, harmless elsewhere.
    // checkJs flips on TypeScript-grade type checking of JS when the user opts in.
    function _jsConfig(checkJs) {
        return {
            compilerOptions: {
                module: "esnext",
                target: "esnext",
                moduleResolution: "bundler",
                checkJs: !!checkJs,
                jsx: "react"
            },
            exclude: ["node_modules", "dist", "build"]
        };
    }

    // Options injected by main.js (kept decoupled from the LSP client wiring).
    let _options = {};
    // Project roots we've already evaluated this session (avoids re-scanning on every file switch).
    const _evaluated = new Set();
    // Project roots where the user closed the Problems-panel re-enable row this session.
    const _panelRowClosed = new Set();
    // The currently-shown toast, so we can dismiss it when the project changes.
    let _activeNotification = null;

    function _dismissActiveNotification() {
        if (_activeNotification) {
            _activeNotification.close();
            _activeNotification = null;
        }
    }

    function _projectRootPath() {
        const root = ProjectManager.getProjectRoot();
        return root && root.fullPath;
    }

    // True if the active project changed since `rootPath` was captured - i.e. the user switched
    // projects while an await was in flight, so the in-progress result is now stale. (This re-reads
    // the *current* root on purpose; comparing against the captured `rootPath` is the whole point.)
    function _projectChangedSince(rootPath) {
        return _projectRootPath() !== rootPath;
    }

    function _isCreated() {
        return !!PreferencesManager.stateManager.get(PREF_CREATED, PreferencesManager.stateManager.PROJECT_CONTEXT);
    }

    function _setCreated(val) {
        PreferencesManager.stateManager.set(PREF_CREATED, !!val, PreferencesManager.stateManager.PROJECT_CONTEXT);
    }

    /**
     * @return {Promise<boolean>} true if the project root already has a tsconfig/jsconfig.
     */
    function _hasProjectConfig() {
        const rootPath = _projectRootPath();
        if (!rootPath) {
            return Promise.resolve(false);
        }
        return Promise.all(EXISTING_CONFIG_FILES.map(function (name) {
            return new Promise(function (resolve) {
                FileSystem.getFileForPath(rootPath + name).exists(function (err, exists) {
                    resolve(!err && exists);
                });
            });
        })).then(function (results) {
            return results.indexOf(true) !== -1;
        });
    }

    /**
     * @return {Promise<boolean>} true if the project contains a real .ts/.tsx file. `.d.ts` ambient
     * declarations don't count - they're common in plain-JS projects and don't make it a TS project.
     * Only TypeScript is probed: a project with no .ts is labelled JavaScript by default, so there's
     * nothing to gain from a separate JS scan.
     */
    function _projectHasTsFiles() {
        return new Promise(function (resolve) {
            // getAllFiles returns the project's cached file list; `.some()` stops at the first match
            // instead of collecting every TS file just to check the count.
            ProjectManager.getAllFiles().done(function (files) {
                resolve(files.some(function (file) {
                    return (/\.tsx?$/i).test(file.name) && !(/\.d\.ts$/i).test(file.name);
                }));
            }).fail(function () {
                resolve(false);
            });
        });
    }

    function _openConfig() {
        const rootPath = _projectRootPath();
        if (rootPath) {
            CommandManager.execute(Commands.FILE_OPEN, { fullPath: rootPath + CONFIG_FILE });
        }
    }

    /**
     * Write the jsconfig (creating or updating it), then restart the server so it re-scopes.
     * @param {boolean} checkJs
     * @return {Promise<boolean>} resolves true on success
     */
    function _writeConfig(checkJs) {
        return new Promise(function (resolve) {
            const rootPath = _projectRootPath();
            if (!rootPath) {
                resolve(false);
                return;
            }
            const content = JSON.stringify(_jsConfig(checkJs), null, 4) + "\n";
            FileSystem.getFileForPath(rootPath + CONFIG_FILE).write(content, function (err) {
                if (err) {
                    console.error("[TypeScriptSupport] failed to write " + CONFIG_FILE, err);
                    resolve(false);
                    return;
                }
                _setCreated(true); // remember we own a config here, so deletion = opt-out
                if (typeof _options.restartServer === "function") {
                    _options.restartServer();
                }
                resolve(true);
            });
        });
    }

    function _learnMore() {
        NativeApp.openURLInDefaultBrowser(DOCS_URL);
    }

    // Reusable quiet/subtle NotificationUI surface (theme-matching, not a bright colored toast).
    const TOAST_STYLE = NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.SUBTLE;

    // Show this toast and remember it so a project switch can dismiss it.
    function _trackToast(title, $tpl) {
        _dismissActiveNotification();
        const notification = NotificationUI.createToastFromTemplate(title, $tpl,
            // instantOpen: skip the default ~2s open-animation delay so it shows right away.
            { dismissOnClick: false, toastStyle: TOAST_STYLE, autoCloseTimeS: 30, instantOpen: true });
        _activeNotification = notification;
        notification.done(function () {
            if (_activeNotification === notification) {
                _activeNotification = null;
            }
        });
        return notification;
    }

    function _action(label) {
        return $("<button class='ts-code-intel-action'>").text(label);
    }

    /**
     * Unobtrusive "intelligence enabled" toast. For a plain-JS project it also offers a one-click
     * "Enable TypeScript" (turns on TypeScript-grade type checking via checkJs). No "Undo" - to opt
     * out the user just opens the config (See Config) and deletes it.
     * @param {boolean} isTs - label as TypeScript (and hide the "enable TS" button)
     */
    function _showEnabledToast(isTs) {
        const langName = isTs ? Strings.CODE_INTEL_TS : Strings.CODE_INTEL_JS;

        const $tpl = $("<div class='ts-code-intel-toast'>");
        $("<div class='ts-code-intel-msg'>").text(Strings.CODE_INTEL_ENABLED_MESSAGE).appendTo($tpl);
        const $btns = $("<div class='ts-code-intel-buttons'>").appendTo($tpl);
        const $see = _action(Strings.CODE_INTEL_SEE_CONFIG).appendTo($btns);
        let $enableTs = null;
        if (!isTs) {
            $enableTs = _action(Strings.CODE_INTEL_ENABLE_TS).appendTo($btns);
        }
        const $learn = _action(Strings.CODE_INTEL_LEARN_MORE).appendTo($btns);

        _trackToast(StringUtils.format(Strings.CODE_INTEL_ENABLED_TITLE, langName), $tpl);

        $see.on("click", function () {
            _openConfig();
        });
        if ($enableTs) {
            $enableTs.on("click", function () {
                _writeConfig(true).then(function (ok) {
                    if (ok) {
                        _showEnabledToast(true); // relabel as TypeScript (also dismisses this toast)
                    }
                });
            });
        }
        $learn.on("click", _learnMore);
    }

    // ----- Problems-panel re-enable row -----------------------------------------------------------
    // A banner inside #problems-panel offering to re-enable project-wide intelligence. Shown when a
    // JS/TS file is active in a project where Phoenix created a config before but it's now gone (the
    // user deleted it). It lives as a sibling of the results table, so CodeInspection re-rendering
    // the table doesn't wipe it.

    function _ensurePanelRow() {
        const $panel = $("#problems-panel");
        if (!$panel.length) {
            return null;
        }
        let $row = $panel.find(".ts-code-intel-panel-row");
        if ($row.length) {
            return $row;
        }
        $row = $("<div class='ts-code-intel-panel-row'>").hide();
        $("<span class='ts-code-intel-panel-text'>").text(Strings.CODE_INTEL_PANEL_TEXT).appendTo($row);
        $("<button class='btn btn-mini primary ts-code-intel-panel-enable'>")
            .text(Strings.CODE_INTEL_PANEL_ENABLE)
            .on("click", function () {
                promptEnable();
            })
            .appendTo($row);
        $("<a class='ts-code-intel-panel-close'>")
            .attr("title", Strings.CODE_INTEL_PANEL_DISMISS).html("&times;")
            .on("click", function () {
                const rootPath = _projectRootPath();
                if (rootPath) {
                    _panelRowClosed.add(rootPath); // session-only: reappears next launch
                }
                $row.hide();
            })
            .appendTo($row);
        $panel.children(".toolbar").after($row);
        return $row;
    }

    function _updatePanelRow() {
        if (typeof Phoenix !== "undefined" && Phoenix.isTestWindow) {
            return;
        }
        const $row = _ensurePanelRow();
        if (!$row) {
            return;
        }
        const rootPath = _projectRootPath();
        const editor = EditorManager.getActiveEditor();
        const lang = editor && editor.document && editor.document.getLanguage().getId();
        const supportedActive = lang && _options.supportedLanguages.indexOf(lang) !== -1;
        // Show only when a JS/TS file is active, Phoenix created a config here before (so its absence
        // means the user deleted it), and they didn't close the row this session.
        if (!rootPath || !supportedActive || !_isCreated() || _panelRowClosed.has(rootPath)) {
            $row.hide();
            return;
        }
        _hasProjectConfig().then(function (hasConfig) {
            if (_projectChangedSince(rootPath)) {
                return;
            }
            $row.toggle(!hasConfig);
        });
    }

    /**
     * On the first JS/TS file opened in a config-less, non-dismissed project (once per session),
     * silently create a jsconfig and surface the unobtrusive toast.
     * @param {Editor} editor
     */
    async function _autoEnable(editor) {
        if (Phoenix.isTestWindow) {
            return; // never write configs from a test window - it would pollute fixtures
        }
        if (!editor || !editor.document) {
            return;
        }
        const lang = editor.document.getLanguage().getId();
        if (_options.supportedLanguages.indexOf(lang) === -1) {
            return;
        }
        const rootPath = _projectRootPath();
        if (!rootPath || _evaluated.has(rootPath)) {
            return;
        }
        _evaluated.add(rootPath);
        if (_isCreated()) {
            return; // we created a config here before; if it's gone the user deleted it - don't fight
        }
        const hasConfig = await _hasProjectConfig();
        if (_projectChangedSince(rootPath) || hasConfig) {
            return; // project switched mid-read, or already scoped - nothing to do
        }
        // The opened file being .ts/.tsx is itself proof of a TS project (skip the scan); otherwise
        // scan for a real .ts file elsewhere in the project.
        const hasTs = (TS_LANGUAGES.indexOf(lang) !== -1) || (await _projectHasTsFiles());
        if (_projectChangedSince(rootPath)) {
            return;
        }
        const ok = await _writeConfig(false);
        if (ok) {
            _showEnabledToast(hasTs);
        }
    }

    /**
     * Public entry for the Problems-panel re-enable affordance: (re)create the config for the
     * current project and reuse the same enabled-toast flow as auto-enable. The label comes from the
     * active file's language (instant) rather than a full project scan, so the toast isn't delayed.
     */
    function promptEnable() {
        const editor = EditorManager.getActiveEditor();
        const lang = editor && editor.document && editor.document.getLanguage().getId();
        const isTs = TS_LANGUAGES.indexOf(lang) !== -1;
        _writeConfig(false).then(function (ok) {
            if (!ok) {
                return;
            }
            _updatePanelRow(); // config exists again - hide the re-enable row
            _showEnabledToast(isTs);
        });
    }

    /**
     * @param {{supportedLanguages: Array<string>, restartServer: function}} options
     */
    function init(options) {
        _options = options || {};
        EditorManager.on("activeEditorChange.tsCodeIntel", function (evt, current) {
            _autoEnable(current);
            _updatePanelRow(); // the row depends on the active file's language
        });
        // Also catch switches to non-editor views (image/preview) where activeEditorChange may not fire.
        MainViewManager.on("currentFileChange.tsCodeIntel", _updatePanelRow);
        // A pending toast belongs to the project that was open when it appeared - drop it on switch;
        // also refresh the Problems-panel re-enable row for the new project.
        ProjectManager.on(ProjectManager.EVENT_PROJECT_OPEN + ".tsCodeIntel", function () {
            _dismissActiveNotification();
            _updatePanelRow();
        });
        // Evaluate the file already showing at startup (the common "restored a JS file" case).
        _autoEnable(EditorManager.getActiveEditor());
        _updatePanelRow();
    }

    exports.init = init;
    exports.promptEnable = promptEnable;
});
