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
        FileUtils = require("file/FileUtils"),
        Commands = require("command/Commands"),
        Constants = require("./constants");

    const HANDSHAKE_TIMEOUT_MS = 15000,
        FILE_TIMEOUT_MS = 60000,
        CHUNK_SIZE = 8 * 1024 * 1024,
        IFRAME_ID = "migrate-assist-frame";

    const RESULT_MIGRATED = "migrated",
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

        // Open the task list rather than leaving the copy behind a click. Nothing else announces the
        // migration now that there is no dialog up front, so without this a user who happens to be
        // looking elsewhere never learns why the app is busy.
        // Guarded because show() toggles the dropdown: firing it while one is already open would
        // close that instead. TaskManager closes this itself once the last task finishes.
        if (!$(".dropdown-menu:visible").length) {
            task.show();
        }

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
     * Everything after the single up front question is reported at the bottom of the window rather
     * than in another modal. The user opted in and went back to work; interrupting them again to say
     * it finished would undo the point of moving progress out of a dialog in the first place.
     */
    /**
     * Nothing interrupts while the transfer is running: the status bar task carries that. Dialogs
     * are reserved for the two moments the user has to act on, finishing and failing.
     */
    function _errorDialog(title, message) {
        Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_ERROR, title, message);
    }

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

    /**
     * The Help menu path, spelled exactly as the menu itself spells it.
     */
    function _menuPath() {
        return `${Strings.HELP_MENU} > `
            + StringUtils.format(Strings.CMD_MIGRATE_DATA, Constants.getLegacyDomainName());
    }

    /**
     * Buckets a migrated file under the project or extension it belongs to, so the summary can name
     * what actually moved rather than only a file count.
     */
    function _recordCategory(filePath, projects, extensions) {
        const parts = filePath.split("/");
        // /fs/local/<project>/...
        if (filePath.startsWith("/fs/local/") && parts[3]) {
            projects.add(parts[3]);
        // /fs/app/extensions/<user|disabled>/<extension>/...
        } else if (filePath.startsWith("/fs/app/extensions/") && parts[5]) {
            extensions.add(parts[5]);
        }
    }

    /**
     * Success is a dialog, not a notification. The user's data has just moved and the copied
     * extensions and theme only load on the next boot, so there is something they have to do. A
     * notification they can miss means reloading later, seeing nothing different, and concluding it
     * failed. This is the one moment in the flow worth interrupting for.
     *
     * The summary says what moved and where it came from. "All done" on its own only prompts the
     * question of what, exactly, is done.
     */
    function _showCompletion(summary) {
        const items = [];
        if (summary.projects) {
            items.push(StringUtils.format(Strings.MIGRATE_DONE_PROJECTS, summary.projects));
        }
        if (summary.extensions) {
            items.push(StringUtils.format(Strings.MIGRATE_DONE_EXTENSIONS, summary.extensions));
        }
        if (summary.settings) {
            items.push(Strings.MIGRATE_DONE_SETTINGS);
        }

        let message = StringUtils.format(Strings.MIGRATE_DONE_FROM, Constants.getLegacyDomainName());
        message = message + "<ul>" + items.map((item) => `<li>${item}</li>`).join("") + "</ul>";
        if (summary.failed) {
            // Do not call a partial copy complete. Say how much is missing and what happens next.
            message = message + StringUtils.format(Strings.MIGRATE_PARTIAL_COUNT,
                summary.failed, summary.total);
            message = message + "<br><br>" + (summary.outOfRetries
                ? StringUtils.format(Strings.MIGRATE_INTERRUPTED_FINAL, _menuPath())
                : Strings.MIGRATE_INTERRUPTED_RETRY);
        } else {
            message = message + StringUtils.format(Strings.MIGRATE_DONE_TOTAL, summary.files);
        }

        Dialogs.showModalDialog(
            summary.failed ? DefaultDialogs.DIALOG_ID_ERROR : DefaultDialogs.DIALOG_ID_INFO,
            summary.failed ? Strings.MIGRATE_PARTIAL_TITLE : Strings.MIGRATE_DONE_TITLE,
            message,
            [
                {
                    className: Dialogs.DIALOG_BTN_CLASS_NORMAL,
                    id: Dialogs.DIALOG_BTN_CANCEL,
                    text: Strings.MIGRATE_RELOAD_LATER
                },
                {
                    className: Dialogs.DIALOG_BTN_CLASS_PRIMARY,
                    id: Dialogs.DIALOG_BTN_OK,
                    text: Strings.MIGRATE_RELOAD_NOW
                }
            ]
        ).done(function (buttonId) {
            if (buttonId === Dialogs.DIALOG_BTN_OK) {
                CommandManager.execute(Commands.APP_RELOAD);
            }
        });
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

    // Kept in step with RecentProjects, which caps its own list at the same number.
    const RECENT_PROJECTS_KEY = "STATE_recentProjects",
        MAX_RECENT_PROJECTS = 20;

    /**
     * Recent projects cannot be copied across verbatim. The list is just absolute paths, and two
     * kinds of them are dead on arrival: /mnt entries are File System Access mounts whose handles
     * are origin bound and were never migrated, and anything that failed to copy is not there
     * either. Both would sit in the dropdown looking openable and fail when clicked.
     *
     * Entries are also merged rather than replaced, so projects the user already opened on this
     * origin are not thrown away by the migration.
     */
    async function _applyRecentProjects(incoming) {
        if (!Array.isArray(incoming)) {
            return;
        }
        // Normalise before comparing. RecentProjects stores paths without a trailing slash while
        // ProjectManager hands them out with one, and both forms pass an existence check, so
        // comparing raw strings lets "default project" and "default project/" through as two
        // separate entries. The user then sees the same project twice and one of them fails to open.
        const merged = [];
        for (const rawPath of incoming.concat(PhStore.getItem(RECENT_PROJECTS_KEY) || [])) {
            if (!rawPath) {
                continue;
            }
            const projectPath = FileUtils.stripTrailingSlash(rawPath);
            if (projectPath && merged.indexOf(projectPath) === -1) {
                merged.push(projectPath);
            }
        }
        const mountDir = Phoenix.VFS.getMountDir();
        const usable = [];
        for (const projectPath of merged) {
            if (projectPath.startsWith(mountDir)) {
                continue;
            }
            if (await Phoenix.VFS.existsAsync(projectPath)) {
                usable.push(projectPath);
            }
        }
        PhStore.setItem(RECENT_PROJECTS_KEY, usable.slice(0, MAX_RECENT_PROJECTS));
        Metrics.valueEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist", "recentsDropped",
            merged.length - usable.length);
    }

    async function _applyPhStore(phStore) {
        for (const key of Object.keys(phStore || {})) {
            if (key === RECENT_PROJECTS_KEY) {
                await _applyRecentProjects(phStore[key]);
                continue;
            }
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
        const startedAt = performance.now();
        const bridge = _createBridge();
        let progress = null;
        let transferStarted = false;
        let attemptNumber = 0;
        // At run scope rather than inside the try, so a failure can say how far it got. "Did not
        // finish" on its own leaves the user unable to tell a total failure from a near miss.
        let totalFiles = 0, migratedFiles = 0;
        try {
            const scan = await bridge.scan();
            Metrics.valueEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist", "scanMs",
                Math.round(performance.now() - startedAt));
            if (!scan.hasData || !scan.files.length) {
                Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist",
                    manual ? "manualNothing" : "autoNothing");
                return RESULT_NOTHING;
            }

            // Recorded before the user has answered, so we learn the size of what is out there even
            // from people who decline. Without this the only data would be about those who said yes.
            Metrics.valueEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist", "foundFiles",
                scan.files.length);
            Metrics.valueEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist", "foundKB",
                Math.round((scan.totalBytes || 0) / 1024));

            // Nothing is asked. The status bar task says what is happening, and the copy is
            // additive rather than destructive, so a confirmation step would only add a click.
            transferStarted = true;
            // Counted the moment the transfer starts, not when it ends, so an attempt that dies
            // hard still burns its slot. That is what stops an infinite retry loop.
            attemptNumber = (PhStore.getItem(Constants.MIGRATION_ATTEMPTS_KEY) || 0) + 1;
            PhStore.setItem(Constants.MIGRATION_ATTEMPTS_KEY, attemptNumber);

            Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist",
                manual ? "manualStart" : "autoStart");
            progress = _startProgressTask(scan.files.length);

            const failed = [];
            totalFiles = scan.files.length;
            let migratedBytes = 0;
            const migratedProjects = new Set(), migratedExtensions = new Set();
            for (const file of scan.files) {
                try {
                    const bytes = await bridge.fetchFile(file.path);
                    // Paths are identical on both origins, so the destination is the source path.
                    await _ensureParentDir(file.path);
                    await Phoenix.VFS.writeFileAsync(file.path, window.Filer.Buffer.from(bytes),
                        window.fs.BYTE_ARRAY_ENCODING);
                    migratedFiles = migratedFiles + 1;
                    migratedBytes = migratedBytes + bytes.byteLength;
                    _recordCategory(file.path, migratedProjects, migratedExtensions);
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
            await _applyPhStore(scan.phStore);

            // Only a clean run counts as done. Per file errors are caught inside the loop so the
            // run can continue, which means a bridge that dies half way looks like 800 individual
            // failures rather than one crash, and would otherwise be recorded as a success that is
            // never retried. Anything less than a full copy stays retryable.
            const outOfRetries = attemptNumber >= Constants.MAX_AUTO_ATTEMPTS;
            if (!failed.length) {
                PhStore.setItem(Constants.MIGRATION_DONE_KEY, {
                    at: Date.now(),
                    files: migratedFiles,
                    failed: 0
                });
            }
            const elapsedMs = Math.round(performance.now() - startedAt);
            Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist",
                failed.length ? "completedWithErrors" : "completed");
            Metrics.valueEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist", "migratedFiles",
                migratedFiles);
            Metrics.valueEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist", "migratedKB",
                Math.round(migratedBytes / 1024));
            Metrics.valueEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist", "durationSec",
                Math.round(elapsedMs / 1000));
            // Per file cost is the number that actually moves. It is dominated by IndexedDB, so a
            // regression here shows up long before total duration does on a small project.
            Metrics.valueEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist", "msPerFile",
                migratedFiles ? Math.round(elapsedMs / migratedFiles) : 0);
            if (failed.length) {
                Metrics.valueEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist", "failedFiles",
                    failed.length);
            }

            progress.succeed(migratedFiles);
            _showCompletion({
                files: migratedFiles,
                total: totalFiles,
                projects: migratedProjects.size,
                extensions: migratedExtensions.size,
                settings: !!scan.prefs,
                failed: failed.length,
                outOfRetries: outOfRetries
            });
            return RESULT_MIGRATED;
        } catch (err) {
            console.error("MigrateAssist: migration could not run", err);
            if (progress) {
                progress.fail();
            }
            if (transferStarted) {
                // They opted in and watched a task start, so a silent stop is not acceptable even on
                // the automatic path. Whatever landed before the break stays; a retry overwrites it.
                Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist",
                    `interrupted.attempt${attemptNumber}`);
                Metrics.valueEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist", "interruptedAfterSec",
                    Math.round((performance.now() - startedAt) / 1000));
                const outOfRetries = attemptNumber >= Constants.MAX_AUTO_ATTEMPTS;
                _errorDialog(Strings.MIGRATE_INTERRUPTED_TITLE,
                    StringUtils.format(Strings.MIGRATE_INTERRUPTED_PROGRESS,
                        migratedFiles, totalFiles, Constants.getLegacyDomainName())
                    + "<br><br>"
                    + (outOfRetries
                        // No more automatic attempts, so hand them the exact menu entry to use
                        // rather than leaving them to work out what to do next.
                        ? StringUtils.format(Strings.MIGRATE_INTERRUPTED_FINAL, _menuPath())
                        : Strings.MIGRATE_INTERRUPTED_RETRY));
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
        // One attempt and one retry. Past that the automatic path stops for good, so a setup that
        // fails every time cannot turn into an error on every boot forever.
        if ((PhStore.getItem(Constants.MIGRATION_ATTEMPTS_KEY) || 0) >= Constants.MAX_AUTO_ATTEMPTS) {
            Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist", "skipOutOfAttempts");
            return;
        }
        Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist", "autoProbe");
        run(false);
    }

    /**
     * Help menu entry point. Ignores the done flag and always says what happened.
     */
    async function runManually() {
        Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist", "manualInvoked");
        const result = await run(true);
        if (result === RESULT_INTERRUPTED) {
            return; // an interrupted run has already reported itself
        }
        if (result === RESULT_NOTHING) {
            _toast(Strings.MIGRATE_NOTHING_TITLE,
                StringUtils.format(Strings.MIGRATE_NOTHING_MESSAGE, Constants.getLegacyDomainName()),
                NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.INFO);
        } else if (result === RESULT_UNREACHABLE) {
            _errorDialog(Strings.MIGRATE_UNREACHABLE_TITLE,
                StringUtils.format(Strings.MIGRATE_UNREACHABLE_MESSAGE,
                    Constants.getLegacyDomainName(), _menuPath()));
        }
    }

    exports.runOnBoot = runOnBoot;
    exports.runManually = runManually;
});
