/*
 * Copyright (c) 2026 core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/*global describe, it, expect, jasmine */

define(function (require, exports, module) {
    const supportSource = require("text!languageTools/LSPInstallSupport.js"),
        phpSource = require("text!extensions/default/PHPSupport/ServerInstaller.js"),
        pythonSource = require("text!extensions/default/PythonSupport/ServerInstaller.js"),
        Strings = require("strings"),
        _ = require("thirdparty/lodash");

    /**
     * Run the shipped modules with isolated storage, tasks and failed downloads. No real server
     * installation or browser state is touched; reloading keeps only the fixture's persisted state.
     * @param {string} source Installer module source.
     * @return {Object} Installer, task/dialog observations and controllable clock/network.
     */
    function createHarness(source) {
        const storage = new Map();
        const tasks = [];
        const dialogs = [];
        const state = { attempts: 0, removed: [], day: 10, online: true, enabled: true };
        const error = new Error("fixture failure <internal detail>");
        const copy = jasmine.createSpy("copy");
        const modules = {
            strings: Strings,
            "thirdparty/lodash": _,
            "utils/Metrics": { countEvent() {} },
            "preferences/PreferencesManager": { get: () => state.enabled },
            "utils/NodeUtils": {
                _npmInstallInFolder: async () => { state.attempts++; throw error; }
            },
            "features/TaskManager": {
                addNewTask(title, message, icon, options) {
                    const task = Object.assign({ title, message, options,
                        show: jasmine.createSpy("show"), close: jasmine.createSpy("close"),
                        setFailed: jasmine.createSpy("failed"), setSucceeded() {}, setProgressPercent() {},
                        setMessage(value) { this.message = value; }, showRestartIcon() {}, showStopIcon() {}
                    }, options);
                    tasks.push(task);
                    return task;
                }
            },
            "widgets/Dialogs": {
                DIALOG_BTN_OK: "ok",
                showModalDialog(kind, title, message) {
                    const dialog = { message, close: jasmine.createSpy("close"),
                        getElement: () => ({ on: (event, callback) => { dialog.onButton = callback; } }) };
                    dialogs.push(dialog);
                    return dialog;
                }
            }
        };
        const platform = {
            isTestWindow: false,
            app: { getPlatformArch: async () => "x64", copyToClipboard: copy },
            fs: { getTauriPlatformPath: path => path },
            VFS: {
                getAppSupportDir: () => "/fixture/",
                existsAsync: async () => false,
                unlinkAsync: async path => { state.removed.push(path); },
                ensureExistsDirAsync: async () => {}, writeFileAsync: async () => {}
            }
        };
        const browser = { addEventListener(type, callback) { state.onOnline = callback; } };
        const fixtureBrackets = { getModule: id => modules[id], platform: "linux",
            config: { lsp_server_pins: { intelephense: "1.18.5", pyrefly: "1.1.1", ruff: "0.15.20" } } };
        const store = { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) };
        class FixtureDate extends Date {
            constructor() { super(2026, 9, state.day, 12); }
        }

        /** @return {Object} Fresh module instance bound to this fixture's dependencies. */
        function load(moduleSource) {
            const result = {};
            const define = factory => factory(id => modules[id], result, { exports: result });
            const execute = eval("(function(define, brackets, Phoenix, PhStore, window, navigator, " +
                "fetch, console, setTimeout, Date) {\n" + moduleSource + "\n})");
            execute(define, fixtureBrackets, platform, store, browser, { get onLine() { return state.online; } },
                async () => { state.attempts++; throw error; }, { error() {} }, () => {}, FixtureDate);
            return result;
        }
        modules["languageTools/LSPInstallSupport"] = load(supportSource);
        return { state, tasks, dialogs, copy, error, reload: () => load(source), installer: load(source), platform };
    }

    describe("unit:LSP Installation", function () {
        [["PHP", phpSource], ["Python", pythonSource]].forEach(function ([name, source]) {
            it(name + " attempts automatic setup only once across file switches and app restarts", async function () {
                const h = createHarness(source);
                await h.installer.autoInstall();
                await h.installer.autoInstall();
                expect(h.state.attempts).toBe(1);
                expect(h.tasks.length).toBe(1);
                expect(h.tasks[0].show.calls.count()).toBe(1);
                const restarted = h.reload();
                await restarted.autoInstall();
                await restarted.autoInstall();
                expect(h.state.attempts).toBe(1);
                expect(h.tasks.length).toBe(2);
                expect(h.tasks[1].options.noSpinnerNotification).toBe(true);
                expect(h.tasks[1].show).not.toHaveBeenCalled();
            });

            it(name + " allows a fresh automatic attempt on the next day", async function () {
                const h = createHarness(source);
                await h.installer.autoInstall();
                h.state.day++;
                await h.installer.autoInstall();
                expect(h.state.attempts).toBe(2);
            });

            it(name + " keeps the quiet task's manual install action available today", async function () {
                const h = createHarness(source);
                await h.installer.autoInstall();
                const restarted = h.reload();
                await restarted.autoInstall();
                h.tasks[1].onRetryClick();
                await restarted.installNow();
                expect(h.state.attempts).toBe(2);
                expect(h.tasks[1].close).toHaveBeenCalled();
            });

            it(name + " shares an in-flight install with file switches and repair requests", async function () {
                const h = createHarness(source);
                const first = h.installer.autoInstall();
                expect(h.installer.autoInstall()).toBe(first);
                expect(h.installer.repairInstall(true)).toBe(first);
                await first;
                expect(h.state.attempts).toBe(1);
            });

            it(name + " does not consume an attempt while offline or disabled", async function () {
                const h = createHarness(source);
                h.state.enabled = false;
                await h.installer.autoInstall();
                h.state.enabled = true;
                h.state.online = false;
                await h.installer.autoInstall();
                expect(h.state.attempts).toBe(0);
                expect(h.tasks.length).toBe(0);
                h.state.online = true;
                h.state.onOnline();
                await h.installer.installNow();
                expect(h.state.attempts).toBe(1);
            });

            it(name + " blocks automatic repair before deleting files but permits manual repair", async function () {
                const h = createHarness(source);
                await h.installer.autoInstall();
                const deleted = h.state.removed.length;
                await h.installer.repairInstall(true);
                expect(h.state.removed.length).toBe(deleted);
                expect(h.state.attempts).toBe(1);
                await h.installer.repairInstall();
                expect(h.state.removed.length).toBeGreaterThan(deleted);
                expect(h.state.attempts).toBe(2);
            });

            it(name + " reveals copyable error details only when its failed task is selected", async function () {
                const h = createHarness(source);
                await h.installer.autoInstall();
                expect(h.dialogs.length).toBe(0);
                expect(h.tasks[0].message).not.toContain(h.error.message);
                h.tasks[0].onSelect();
                const dialog = h.dialogs[0];
                expect(dialog.message).toContain(_.escape(h.error.message));
                expect(dialog.message).not.toContain("<internal detail>");
                dialog.onButton({}, "copy");
                expect(h.copy).toHaveBeenCalledWith(h.error.message);
                expect(dialog.close).not.toHaveBeenCalled();
                dialog.onButton({}, "ok");
                expect(dialog.close).toHaveBeenCalled();
            });

            it(name + " never starts automatic downloads in test windows", async function () {
                const h = createHarness(source);
                h.platform.isTestWindow = true;
                await h.installer.autoInstall();
                expect(h.state.attempts).toBe(0);
                expect(h.tasks.length).toBe(0);
            });
        });
    });
});
