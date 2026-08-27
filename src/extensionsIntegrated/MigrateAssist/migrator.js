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
 * Pulls projects, preferences and extensions across from the origin being retired.
 *
 * Runs on the new origin only. A hidden iframe on the legacy origin (see src/migrateAssist.html)
 * zips one top level folder at a time and streams it over postMessage; this side reassembles each
 * zip and hands it to ZipUtils.unzipBinDataToLocation, which writes files without deleting anything
 * first. That gives us exactly the collision rule we want, source wins and extras survive.
 *
 * The automatic path is silent unless there is genuinely something to move. The manual path, driven
 * from the Help menu, always reports what happened, because an explicit user action that appears to
 * do nothing is worse than no action at all.
 *
 * @module extensionsIntegrated/MigrateAssist/migrator
 */
define(function (require, exports, module) {
    const Dialogs = require("widgets/Dialogs"),
        DefaultDialogs = require("widgets/DefaultDialogs"),
        NotificationUI = require("widgets/NotificationUI"),
        Strings = require("strings"),
        StringUtils = require("utils/StringUtils"),
        Metrics = require("utils/Metrics"),
        TaskManager = require("features/TaskManager"),
        PreferencesManager = require("preferences/PreferencesManager"),
        CommandManager = require("command/CommandManager"),
        Commands = require("command/Commands"),
        Constants = require("./constants");

    const HANDSHAKE_TIMEOUT_MS = 15000,
        FILE_TIMEOUT_MS = 60000,
        CHUNK_SIZE = 8 * 1024 * 1024,
        IFRAME_ID = "migrate-assist-frame";

    const RESULT_MIGRATED = "migrated",
        RESULT_DECLINED = "declined",
        RESULT_INTERRUPTED = "interrupted",
        RESULT_NOTHING = "nothing",
        RESULT_UNREACHABLE = "unreachable";

    let migrationRunning = false;

    /**
     * Talks to the helper page on the legacy origin. Resolves once the scan comes back; individual
     * bundles are then requested one at a time so only one zip is ever in memory.
     */
    function _createBridge() {
        const legacyOrigin = Constants.getLegacyOrigin();
        const iframe = document.createElement("iframe");
        iframe.id = IFRAME_ID;
        iframe.setAttribute("title", "data migration helper");
        iframe.style.display = "none";

        let pendingScan = null,
            fileHandler = null,
            destroyed = false;

        function _onMessage(event) {
            // Both checks matter: the origin proves who sent it, the source proves it came from our
            // frame rather than any other iframe sharing this window's message bus.
            if (event.origin !== legacyOrigin || event.source !== iframe.contentWindow) {
                return;
            }
            const data = event.data;
            if (!data || typeof data !== "object") {
                return;
            }
            if (data.type === "MIGRATE_READY" && pendingScan) {
                iframe.contentWindow.postMessage({ type: "MIGRATE_SCAN" }, legacyOrigin);
            } else if (data.type === "MIGRATE_SCAN_RESULT" && pendingScan) {
                const resolve = pendingScan;
                pendingScan = null;
                resolve(data);
            } else if (fileHandler) {
                fileHandler(data);
            }
        }

        // Registered before the src is set. The frame can post READY faster than the next microtask,
        // and attaching afterwards loses the handshake and hangs until the timeout.
        window.addEventListener("message", _onMessage);

        function destroy() {
            if (destroyed) {
                return;
            }
            destroyed = true;
            window.removeEventListener("message", _onMessage);
            if (iframe.parentNode) {
                iframe.parentNode.removeChild(iframe);
            }
        }

        function scan() {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    pendingScan = null;
                    // Covers the origin being offline, refusing to be framed, or simply not having
                    // this page deployed yet.
                    reject(new Error("timed out waiting for " + legacyOrigin));
                }, HANDSHAKE_TIMEOUT_MS);
                pendingScan = function (result) {
                    clearTimeout(timer);
                    resolve(result);
                };
                iframe.src = Constants.getMigrateAssistURL() + "?parentOrigin="
                    + encodeURIComponent(location.origin);
                document.body.appendChild(iframe);
            });
        }

        /**
         * Requests one file, reassembling it from chunks if it is larger than the chunk size.
         */
        function fetchFile(path) {
            return new Promise((resolve, reject) => {
                const parts = [];
                let received = 0;
                const timer = setTimeout(() => {
                    fileHandler = null;
                    reject(new Error("timed out receiving " + path));
                }, FILE_TIMEOUT_MS);

                function requestFrom(offset) {
                    iframe.contentWindow.postMessage(
                        { type: "MIGRATE_READ", path: path, offset: offset, length: CHUNK_SIZE },
                        legacyOrigin);
                }

                fileHandler = function (data) {
                    if (data.path !== path) {
                        return;
                    }
                    if (data.type === "MIGRATE_ERROR") {
                        clearTimeout(timer);
                        fileHandler = null;
                        reject(new Error(data.message));
                        return;
                    }
                    if (data.type !== "MIGRATE_DATA") {
                        return;
                    }
                    parts.push(new Uint8Array(data.chunk));
                    received = received + data.chunk.byteLength;
                    if (!data.eof) {
                        requestFrom(received);
                        return;
                    }
                    clearTimeout(timer);
                    fileHandler = null;
                    if (parts.length === 1) {
                        resolve(parts[0]);
                        return;
                    }
                    const merged = new Uint8Array(received);
                    let offset = 0;
                    for (const part of parts) {
                        merged.set(part, offset);
                        offset = offset + part.byteLength;
                    }
                    resolve(merged);
                };
                requestFrom(0);
            });
        }

        return { scan, fetchFile, destroy };
    }

    /**
     * Progress lives in the status bar rather than a modal. The transfer is dominated by IndexedDB
     * writes at roughly 10ms per file, so a few thousand files is minutes long, and blocking the
     * whole editor behind an undismissable dialog for that is not acceptable. The user is told once
     * up front, works normally while it runs, and gets a dialog again only when it is done.
     */
    function _startProgressTask(totalFiles) {
        const task = TaskManager.addNewTask(
            Strings.MIGRATE_PROGRESS_TITLE,
            StringUtils.format(Strings.MIGRATE_PROGRESS_STATUS, 0, totalFiles),
            `<i class="fa-solid fa-download"></i>`);
        return {
            update: function (done) {
                task.setProgressPercent(Math.round((done / totalFiles) * 100));
                task.setMessage(StringUtils.format(Strings.MIGRATE_PROGRESS_STATUS, done, totalFiles));
            },
            succeed: function (done) {
                task.setProgressPercent(100);
                task.setMessage(StringUtils.format(Strings.MIGRATE_PROGRESS_STATUS, done, totalFiles));
                task.setSucceeded();
                task.close();
            },
            fail: function () {
                task.setFailed();
                task.close();
            }
        };
    }

    /**
     * Shown once, before anything is copied, so the user knows why their machine is busy.
     */
    function _confirmStart(fileCount) {
        return Dialogs.showModalDialog(
            DefaultDialogs.DIALOG_ID_INFO,
            Strings.MIGRATE_PROGRESS_TITLE,
            StringUtils.format(Strings.MIGRATE_START_MESSAGE, fileCount, Constants.getLegacyDomainName()),
            [
                {
                    className: Dialogs.DIALOG_BTN_CLASS_NORMAL,
                    id: Dialogs.DIALOG_BTN_CANCEL,
                    text: Strings.CANCEL
                },
                {
                    className: Dialogs.DIALOG_BTN_CLASS_PRIMARY,
                    id: Dialogs.DIALOG_BTN_OK,
                    text: Strings.MIGRATE_START_CONFIRM
                }
            ]
        ).getPromise();
    }

    /**
     * Everything after the single up front question is reported at the bottom of the window rather
     * than in another modal. The user opted in and went back to work; interrupting them again to say
     * it finished would undo the point of moving progress out of a dialog in the first place.
     */
    function _toast(title, message, style, $extra) {
        const $content = $("<div>").append($("<div>").text(message));
        if ($extra) {
            $content.append($extra);
        }
        return NotificationUI.createToastFromTemplate(title, $content, {
            dismissOnClick: false, // there is a close button, and a stray click must not eat the action
            toastStyle: style
        });
    }

    function _showCompletion(migratedFiles, failed) {
        const $actions = $("<div>").addClass("migrate-assist-toast-actions");
        const $reload = $("<button>").addClass("btn primary btn-mini")
            .text(Strings.MIGRATE_RELOAD_NOW);
        $reload.on("click", function () {
            CommandManager.execute(Commands.APP_RELOAD);
        });
        $actions.append($reload);
        if (failed.length) {
            $actions.prepend($("<div>").addClass("migrate-assist-toast-detail")
                .text(StringUtils.format(Strings.MIGRATE_DONE_PARTIAL, failed.length)));
        }
        _toast(Strings.MIGRATE_DONE_TITLE,
            StringUtils.format(Strings.MIGRATE_DONE_MESSAGE, migratedFiles),
            failed.length ? NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.WARNING
                : NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.SUCCESS,
            $actions);
    }

    /**
     * Filer needs the parent directory to exist before a write, and mkdirs is recursive.
     */
    function _ensureParentDir(filePath) {
        return new Promise((resolve, reject) => {
            window.fs.mkdirs(window.path.dirname(filePath), 0o755, true, (err) => {
                if (err && err.code !== "EEXIST") {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    }

    async function _applyPreferences(prefsText) {
        // Flush first. The in memory user scope is authoritative, so overwriting the file underneath
        // it would just get clobbered by the next save.
        await PreferencesManager.save();
        const prefFile = PreferencesManager.getUserPrefFile();
        await Phoenix.VFS.writeFileAsync(prefFile, prefsText, "utf8");
        // Tell the preference system the file changed so the scope reloads and listeners, including
        // the theme, pick it up without a restart.
        PreferencesManager.fileChanged(prefFile);
    }

    function _applyPhStore(phStore) {
        for (const key of Object.keys(phStore || {})) {
            PhStore.setItem(key, phStore[key]);
        }
    }

    /**
     * @param {boolean} manual true when the user asked for this from the Help menu
     * @return {Promise<string>} one of RESULT_MIGRATED, RESULT_NOTHING, RESULT_UNREACHABLE
     */
    async function run(manual) {
        if (migrationRunning) {
            return RESULT_NOTHING;
        }
        migrationRunning = true;
        const bridge = _createBridge();
        let progress = null;
        let userAccepted = false;
        try {
            const scan = await bridge.scan();
            if (!scan.hasData || !scan.files.length) {
                Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist",
                    manual ? "manualNothing" : "autoNothing");
                return RESULT_NOTHING;
            }

            // Recorded before the dialog is even answered, so closing the tab on it counts as
            // having been asked. The automatic path will not raise it again.
            PhStore.setItem(Constants.MIGRATION_PROMPTED_KEY, { at: Date.now() });

            // Asked once, before anything is copied. After this the user is left alone.
            const choice = await _confirmStart(scan.files.length);
            if (choice !== Dialogs.DIALOG_BTN_OK) {
                Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist", "declined");
                return RESULT_DECLINED;
            }
            userAccepted = true;

            Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist",
                manual ? "manualStart" : "autoStart");
            progress = _startProgressTask(scan.files.length);

            const failed = [];
            let migratedFiles = 0;
            for (const file of scan.files) {
                try {
                    const bytes = await bridge.fetchFile(file.path);
                    // Paths are identical on both origins, so the destination is the source path.
                    await _ensureParentDir(file.path);
                    await Phoenix.VFS.writeFileAsync(file.path, window.Filer.Buffer.from(bytes),
                        window.fs.BYTE_ARRAY_ENCODING);
                    migratedFiles = migratedFiles + 1;
                } catch (err) {
                    // One unreadable file should not cost the user everything else.
                    console.error("MigrateAssist: could not copy", file.path, err);
                    failed.push(file.path);
                }
                progress.update(migratedFiles + failed.length);
            }

            if (scan.prefs) {
                try {
                    await _applyPreferences(scan.prefs);
                } catch (err) {
                    console.error("MigrateAssist: could not apply preferences", err);
                    failed.push("phcode.json");
                }
            }
            _applyPhStore(scan.phStore);

            PhStore.setItem(Constants.MIGRATION_DONE_KEY, {
                at: Date.now(),
                files: migratedFiles,
                failed: failed.length
            });
            Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist",
                failed.length ? "completedWithErrors" : "completed");

            progress.succeed(migratedFiles);
            _showCompletion(migratedFiles, failed);
            return RESULT_MIGRATED;
        } catch (err) {
            console.error("MigrateAssist: migration could not run", err);
            if (progress) {
                progress.fail();
            }
            if (userAccepted) {
                // They opted in and watched a task start, so a silent stop is not acceptable even on
                // the automatic path. Whatever landed before the break stays; a retry overwrites it.
                Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist", "interrupted");
                _toast(Strings.MIGRATE_INTERRUPTED_TITLE,
                    StringUtils.format(Strings.MIGRATE_INTERRUPTED_MESSAGE,
                        Constants.getLegacyDomainName()),
                    NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.ERROR);
                return RESULT_INTERRUPTED;
            }
            Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist",
                manual ? "manualUnreachable" : "autoUnreachable");
            return RESULT_UNREACHABLE;
        } finally {
            migrationRunning = false;
            bridge.destroy();
        }
    }

    /**
     * Boot time entry point. Stays completely silent unless there is something to move, and never
     * runs again once the migration has succeeded.
     */
    function runOnBoot() {
        if (!Constants.isNewOrigin() || Phoenix.isNativeApp || Phoenix.isTestWindow) {
            return;
        }
        if (!Constants.isMigrationSupportedBrowser()) {
            return;
        }
        if (PhStore.getItem(Constants.MIGRATION_DONE_KEY)) {
            return;
        }
        // Already asked once. Anything further is on the user, from the Help menu.
        if (PhStore.getItem(Constants.MIGRATION_PROMPTED_KEY)) {
            return;
        }
        // Once the legacy origin is gone there is nothing to probe, so the feature disables itself
        // rather than opening a doomed iframe on every boot forever.
        if (Constants.isPastSunset()) {
            return;
        }
        run(false);
    }

    /**
     * Help menu entry point. Ignores the done flag and the sunset date, and always says what
     * happened.
     */
    async function runManually() {
        const result = await run(true);
        if (result === RESULT_DECLINED || result === RESULT_INTERRUPTED) {
            // Declining needs no confirmation, and an interrupted run has already said so itself.
            return;
        }
        if (result === RESULT_NOTHING) {
            _toast(Strings.MIGRATE_NOTHING_TITLE,
                StringUtils.format(Strings.MIGRATE_NOTHING_MESSAGE, Constants.getLegacyDomainName()),
                NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.INFO);
        } else if (result === RESULT_UNREACHABLE) {
            _toast(Strings.MIGRATE_UNREACHABLE_TITLE,
                StringUtils.format(Strings.MIGRATE_UNREACHABLE_MESSAGE, Constants.getLegacyDomainName()),
                NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.ERROR);
        }
    }

    exports.runOnBoot = runOnBoot;
    exports.runManually = runManually;
});
