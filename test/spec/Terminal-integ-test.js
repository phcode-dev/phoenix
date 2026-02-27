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

/*global describe, it, expect, beforeAll, afterAll, awaitsFor */

define(function (require, exports, module) {

    if (!Phoenix.isNativeApp) {
        return;
    }

    const SpecRunnerUtils = require("spec/SpecRunnerUtils");
    const Strings = require("strings");

    const IS_WINDOWS = Phoenix.platform === "win";

    describe("integration:Terminal", function () {
        let testWindow,
            __PR,
            WorkspaceManager,
            testProjectPath;

        const PANEL_ID = "terminal-panel";

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            __PR = testWindow.__PR;
            WorkspaceManager = testWindow.brackets.test.WorkspaceManager;

            // Create a real temp directory so the terminal has a
            // physical native path to use as cwd.
            testProjectPath = await SpecRunnerUtils.getTempTestDirectory(
                "/spec/JSUtils-test-files"
            );
            await SpecRunnerUtils.loadProjectInTestWindow(testProjectPath);
        }, 30000);

        afterAll(async function () {
            // Dispose all terminal PTY processes before teardown.
            // panel.hide() keeps terminals alive by design, so we
            // must explicitly kill them. On Windows, a shell whose
            // cwd is the temp directory locks it and prevents
            // cleanup by the next test run.
            if (testWindow) {
                try {
                    const termModule = testWindow.brackets.getModule(
                        "extensionsIntegrated/Terminal/main"
                    );
                    if (termModule && termModule._disposeAll) {
                        // _disposeAll is async — awaits all kill
                        // commands so PTYs are signalled before
                        // the test window is torn down.
                        await termModule._disposeAll();
                    }
                    // Wait for terminals to fully exit. On Windows,
                    // taskkill is async and the shell process may
                    // hold the cwd lock for several seconds after
                    // the kill signal is sent.
                    if (IS_WINDOWS) {
                        await awaitsFor(function () {
                            return testWindow.$(
                                ".terminal-flyout-item"
                            ).length === 0;
                        }, "terminals to be disposed", 5000);
                        // taskkill returns before the process fully
                        // exits — the directory lock can persist for
                        // a few more seconds. Wait for the OS to
                        // release the lock so the next test run's
                        // getTempTestDirectory can clean up.
                        await new Promise(function (resolve) {
                            setTimeout(resolve, 5000);
                        });
                    }
                } catch (e) {
                    // test window may already be torn down
                }
            }
            const panel = WorkspaceManager
                ? WorkspaceManager.getPanelForID(PANEL_ID)
                : null;
            if (panel && panel.isVisible()) {
                panel.hide();
            }
            testWindow = null;
            __PR = null;
            WorkspaceManager = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);

        // --- Helpers ---

        async function openTerminal() {
            await __PR.execCommand(__PR.Commands.VIEW_TERMINAL);
            await awaitsFor(function () {
                return testWindow.$("#terminal-panel").is(":visible");
            }, "terminal panel to be visible", 10000);
        }

        function clickNewTerminal() {
            testWindow.$(".terminal-flyout-new-btn").click();
        }

        function getTerminalCount() {
            return testWindow.$(".terminal-flyout-item").length;
        }

        function clickPanelCloseButton() {
            testWindow.$(
                '.bottom-panel-tab[data-panel-id="terminal-panel"]'
                + ' .bottom-panel-tab-close-btn'
            ).click();
        }

        function isDialogOpen() {
            return testWindow.$(".modal.instance").length >= 1;
        }

        function getDialogTitle() {
            return testWindow.$(
                ".modal.instance .dialog-title"
            ).text();
        }

        function getDialogConfirmButtonText() {
            return testWindow.$(
                ".modal.instance .dialog-button.primary"
            ).text();
        }

        /**
         * Trigger a flyout process refresh so tab titles
         * reflect the current foreground process.
         */
        function triggerFlyoutRefresh() {
            testWindow.$(".terminal-tab-flyout")
                .trigger("mouseenter");
        }

        /**
         * Wait for the active terminal's shell to initialize.
         * The flyout title text changes from "Terminal" to the
         * shell name (e.g. "bash") once process info is fetched.
         */
        async function waitForShellReady() {
            await awaitsFor(function () {
                triggerFlyoutRefresh();
                const title = testWindow.$(
                    ".terminal-flyout-item.active "
                    + ".terminal-flyout-title"
                ).text();
                return title && title !== "Terminal";
            }, "shell to initialize", 10000);
        }

        /**
         * Wait for a child process (e.g. "node") to appear as
         * the active terminal's foreground process in the flyout.
         */
        async function waitForActiveProcess(processName) {
            await awaitsFor(function () {
                triggerFlyoutRefresh();
                const title = testWindow.$(
                    ".terminal-flyout-item.active "
                    + ".terminal-flyout-title"
                ).text();
                return title && title.indexOf(processName) !== -1;
            }, processName + " process to appear in flyout",
            15000);
        }

        /**
         * Write data to the active terminal's PTY via the
         * terminal extension's test helper.
         */
        async function writeToTerminal(text) {
            const termModule = testWindow.brackets.getModule(
                "extensionsIntegrated/Terminal/main"
            );
            await termModule._writeToActiveTerminal(text);
        }

        /**
         * Get the native platform path for the loaded project.
         * Mirrors the same VFS→native conversion the terminal uses.
         */
        function getNativeProjectPath() {
            const Phoenix = testWindow.Phoenix;
            const ProjectManager =
                testWindow.brackets.test.ProjectManager;
            const fullPath =
                ProjectManager.getProjectRoot().fullPath;
            const tauriPrefix = Phoenix.VFS.getTauriDir();
            let nativePath;
            if (fullPath.startsWith(tauriPrefix)) {
                nativePath =
                    Phoenix.fs.getTauriPlatformPath(fullPath);
            } else {
                nativePath = fullPath;
            }
            // Strip trailing slash (terminal does the same)
            if (nativePath.length > 1 &&
                (nativePath.endsWith("/") ||
                 nativePath.endsWith("\\"))) {
                nativePath = nativePath.slice(0, -1);
            }
            return nativePath;
        }

        // --- Tests ---

        describe("Panel basics", function () {
            it("should open terminal in the current project directory",
                async function () {
                    await openTerminal();
                    expect(testWindow.$("#terminal-panel")
                        .is(":visible")).toBeTrue();
                    expect(getTerminalCount()).toBe(1);

                    if (IS_WINDOWS) {
                        // On Windows, PowerShell/cmd set the title to
                        // their own executable path rather than
                        // "user@host: /path/to/cwd". Verify the shell
                        // started and updated its title from the default
                        // profile name.
                        await waitForShellReady();
                        const flyoutTitle = testWindow.$(
                            ".terminal-flyout-item.active"
                        ).attr("title") || "";
                        expect(flyoutTitle).not.toBe("");
                    } else {
                        // On Linux/macOS, bash/zsh set the title to
                        // include the cwd (e.g. "user@host: /path").
                        const expectedPath = getNativeProjectPath();
                        const projectDirName = expectedPath
                            .split("/").pop().split("\\").pop();

                        await awaitsFor(function () {
                            const title = testWindow.$(
                                ".terminal-flyout-item.active"
                            ).attr("title") || "";
                            return title.indexOf(projectDirName) !== -1;
                        }, "terminal title to contain project dir",
                        10000);

                        const flyoutTitle = testWindow.$(
                            ".terminal-flyout-item.active"
                        ).attr("title") || "";
                        expect(flyoutTitle).toContain(projectDirName);
                    }
                });

            it("should close single idle terminal without dialog",
                async function () {
                    if (!testWindow.$("#terminal-panel")
                        .is(":visible")) {
                        await openTerminal();
                    }
                    await awaitsFor(function () {
                        return getTerminalCount() === 1;
                    }, "single terminal to exist", 5000);

                    await waitForShellReady();

                    clickPanelCloseButton();

                    await awaitsFor(function () {
                        return !testWindow.$("#terminal-panel")
                            .is(":visible");
                    }, "terminal panel to close", 5000);

                    expect(isDialogOpen()).toBeFalse();
                    expect(getTerminalCount()).toBe(0);
                });
        });

        describe("Close confirmation with multiple terminals",
            function () {
                it("should show close-all dialog and cancel keeps panel",
                    async function () {
                        await openTerminal();
                        await awaitsFor(function () {
                            return getTerminalCount() === 1;
                        }, "first terminal", 10000);

                        clickNewTerminal();
                        await awaitsFor(function () {
                            return getTerminalCount() === 2;
                        }, "second terminal", 10000);

                        await waitForShellReady();

                        clickPanelCloseButton();

                        await __PR.waitForModalDialog();

                        expect(getDialogTitle())
                            .toBe(Strings.TERMINAL_CLOSE_ALL_TITLE);
                        expect(getDialogConfirmButtonText())
                            .toBe(Strings.TERMINAL_CLOSE_ALL_BTN);

                        // Cancel
                        __PR.clickDialogButtonID(
                            __PR.Dialogs.DIALOG_BTN_CANCEL
                        );
                        await __PR.waitForModalDialogClosed();

                        expect(testWindow.$("#terminal-panel")
                            .is(":visible")).toBeTrue();
                        expect(getTerminalCount()).toBe(2);
                    });

                it("should close all terminals when confirmed",
                    async function () {
                        // Still 2 terminals from previous test
                        expect(getTerminalCount()).toBe(2);

                        clickPanelCloseButton();
                        await __PR.waitForModalDialog();

                        __PR.clickDialogButtonID(
                            __PR.Dialogs.DIALOG_BTN_OK
                        );
                        await __PR.waitForModalDialogClosed();

                        await awaitsFor(function () {
                            return !testWindow.$("#terminal-panel")
                                .is(":visible");
                        }, "terminal panel to close", 5000);

                        expect(getTerminalCount()).toBe(0);
                    });
            });

        describe("Close confirmation with active process", function () {
            it("should show close-terminal dialog for single terminal",
                async function () {
                    await openTerminal();
                    await awaitsFor(function () {
                        return getTerminalCount() === 1;
                    }, "terminal to be created", 10000);

                    await waitForShellReady();

                    // Start a long-running node process
                    await writeToTerminal(
                        'node -e "setTimeout(()=>{},60000)"\r'
                    );
                    await waitForActiveProcess("node");

                    clickPanelCloseButton();

                    await __PR.waitForModalDialog();


                    expect(getDialogTitle())
                        .toBe(Strings.TERMINAL_CLOSE_SINGLE_TITLE);
                    expect(getDialogConfirmButtonText())
                        .toBe(Strings.TERMINAL_CLOSE_SINGLE_BTN);

                    // Cancel — terminal stays
                    __PR.clickDialogButtonID(
                        __PR.Dialogs.DIALOG_BTN_CANCEL
                    );
                    await __PR.waitForModalDialogClosed();

                    expect(testWindow.$("#terminal-panel")
                        .is(":visible")).toBeTrue();
                    expect(getTerminalCount()).toBe(1);

                    // Now confirm
                    clickPanelCloseButton();
                    await __PR.waitForModalDialog();
                    __PR.clickDialogButtonID(
                        __PR.Dialogs.DIALOG_BTN_OK
                    );
                    await __PR.waitForModalDialogClosed();

                    await awaitsFor(function () {
                        return !testWindow.$("#terminal-panel")
                            .is(":visible");
                    }, "panel to close after confirm", 5000);

                    expect(getTerminalCount()).toBe(0);
                });

            it("should show stop-processes dialog with multiple terminals",
                async function () {
                    await openTerminal();
                    await awaitsFor(function () {
                        return getTerminalCount() === 1;
                    }, "first terminal", 10000);

                    clickNewTerminal();
                    await awaitsFor(function () {
                        return getTerminalCount() === 2;
                    }, "second terminal", 10000);

                    await waitForShellReady();

                    await writeToTerminal(
                        'node -e "setTimeout(()=>{},60000)"\r'
                    );
                    await waitForActiveProcess("node");

                    clickPanelCloseButton();

                    await __PR.waitForModalDialog();


                    expect(getDialogTitle())
                        .toBe(Strings.TERMINAL_CLOSE_ALL_TITLE);
                    expect(getDialogConfirmButtonText())
                        .toBe(Strings.TERMINAL_CLOSE_ALL_STOP_BTN);

                    // Cancel
                    __PR.clickDialogButtonID(
                        __PR.Dialogs.DIALOG_BTN_CANCEL
                    );
                    await __PR.waitForModalDialogClosed();

                    expect(getTerminalCount()).toBe(2);

                    // Confirm
                    clickPanelCloseButton();
                    await __PR.waitForModalDialog();
                    __PR.clickDialogButtonID(
                        __PR.Dialogs.DIALOG_BTN_OK
                    );
                    await __PR.waitForModalDialogClosed();

                    await awaitsFor(function () {
                        return !testWindow.$("#terminal-panel")
                            .is(":visible");
                    }, "panel to close after confirm", 5000);

                    expect(getTerminalCount()).toBe(0);
                });
        });

        describe("Programmatic hide vs user close", function () {
            it("should keep terminals alive after panel.hide()",
                async function () {
                    await openTerminal();
                    await awaitsFor(function () {
                        return getTerminalCount() === 1;
                    }, "terminal to be created", 10000);

                    const panel =
                        WorkspaceManager.getPanelForID(PANEL_ID);
                    panel.hide();

                    await awaitsFor(function () {
                        return !testWindow.$("#terminal-panel")
                            .is(":visible");
                    }, "terminal panel to hide", 5000);

                    expect(isDialogOpen()).toBeFalse();

                    // Re-show — terminal should still exist
                    panel.show();
                    await awaitsFor(function () {
                        return testWindow.$("#terminal-panel")
                            .is(":visible");
                    }, "terminal panel to show again", 5000);

                    expect(getTerminalCount()).toBe(1);

                    // Clean up
                    clickPanelCloseButton();
                    await awaitsFor(function () {
                        return !testWindow.$("#terminal-panel")
                            .is(":visible");
                    }, "terminal panel to close", 5000);
                });
        });
    });
});
