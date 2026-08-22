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
        Mustache = require("thirdparty/mustache/mustache"),
        Strings = require("strings"),
        StringUtils = require("utils/StringUtils"),
        Metrics = require("utils/Metrics"),
        ZipUtils = require("utils/ZipUtils"),
        PreferencesManager = require("preferences/PreferencesManager"),
        CommandManager = require("command/CommandManager"),
        Commands = require("command/Commands"),
        Constants = require("./constants"),
        progressTemplate = require("text!./html/migrate-progress.html");

    const HANDSHAKE_TIMEOUT_MS = 15000,
        BUNDLE_TIMEOUT_MS = 120000,
        IFRAME_ID = "migrate-assist-frame";

    const RESULT_MIGRATED = "migrated",
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
            bundleHandler = null,
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
            } else if (bundleHandler) {
                bundleHandler(data);
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
         * Requests one bundle and reassembles its chunks into a single ArrayBuffer.
         */
        function fetchBundle(id) {
            return new Promise((resolve, reject) => {
                const chunks = [];
                let expected = -1,
                    received = 0;
                const timer = setTimeout(() => {
                    bundleHandler = null;
                    reject(new Error("timed out receiving " + id));
                }, BUNDLE_TIMEOUT_MS);

                bundleHandler = function (data) {
                    if (data.id !== id) {
                        return;
                    }
                    if (data.type === "MIGRATE_ERROR") {
                        clearTimeout(timer);
                        bundleHandler = null;
                        reject(new Error(data.message));
                    } else if (data.type === "MIGRATE_BUNDLE_META") {
                        expected = data.chunkCount;
                    } else if (data.type === "MIGRATE_CHUNK") {
                        chunks[data.index] = data.chunk;
                        received = received + 1;
                        if (data.last || (expected > 0 && received === expected)) {
                            clearTimeout(timer);
                            bundleHandler = null;
                            const total = chunks.reduce((sum, c) => sum + c.byteLength, 0);
                            const merged = new Uint8Array(total);
                            let offset = 0;
                            for (const chunk of chunks) {
                                merged.set(new Uint8Array(chunk), offset);
                                offset = offset + chunk.byteLength;
                            }
                            resolve(merged.buffer);
                        }
                    }
                };
                iframe.contentWindow.postMessage({ type: "MIGRATE_BUNDLE", id: id }, legacyOrigin);
            });
        }

        return { scan, fetchBundle, destroy };
    }

    function _showProgressDialog(bundleCount) {
        const dialog = Dialogs.showModalDialogUsingTemplate(
            Mustache.render(progressTemplate, {
                Strings: Strings,
                introMessage: StringUtils.format(Strings.MIGRATE_PROGRESS_INTRO,
                    Constants.LEGACY_DOMAIN_NAME)
            }),
            false // no auto dismiss, the transfer must not be interrupted half way
        );
        const $dlg = dialog.getElement();
        let bundlesDone = 0;

        return {
            dialog: dialog,
            setWaiting: function (index, name) {
                // The remote side is zipping. Nothing to count yet, so pulse rather than sit at 0%.
                $dlg.find(".migrate-assist-bar").addClass("migrate-assist-bar-indeterminate");
                $dlg.find(".migrate-assist-status")
                    .text(StringUtils.format(Strings.MIGRATE_PROGRESS_PREPARING, name, index + 1, bundleCount));
            },
            setBundleProgress: function (index, name, doneFiles, totalFiles) {
                $dlg.find(".migrate-assist-bar").removeClass("migrate-assist-bar-indeterminate");
                bundlesDone = index;
                const withinBundle = totalFiles ? (doneFiles / totalFiles) : 0;
                const overall = Math.min(100, Math.round(((bundlesDone + withinBundle) / bundleCount) * 100));
                $dlg.find(".migrate-assist-bar").css("width", `${overall}%`);
                $dlg.find(".migrate-assist-status")
                    .text(StringUtils.format(Strings.MIGRATE_PROGRESS_STATUS, name, index + 1, bundleCount));
            },
            finish: function (summary) {
                $dlg.find(".migrate-assist-bar")
                    .removeClass("migrate-assist-bar-indeterminate")
                    .css("width", "100%");
                $dlg.find(".migrate-assist-intro").text(Strings.MIGRATE_DONE_TITLE);
                $dlg.find(".migrate-assist-status").text(summary.message);
                if (summary.detail) {
                    $dlg.find(".migrate-assist-detail").removeClass("forced-hidden").text(summary.detail);
                }
                $dlg.find(".migrate-assist-reload").removeClass("forced-hidden").on("click", function () {
                    CommandManager.execute(Commands.APP_RELOAD);
                });
                $dlg.find(".migrate-assist-close").removeClass("forced-hidden").on("click", function () {
                    dialog.close();
                });
            }
        };
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
        try {
            const scan = await bridge.scan();
            if (!scan.hasData || !scan.bundles.length) {
                Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist",
                    manual ? "manualNothing" : "autoNothing");
                return RESULT_NOTHING;
            }

            Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist",
                manual ? "manualStart" : "autoStart");
            progress = _showProgressDialog(scan.bundles.length);

            const failed = [];
            let migratedFiles = 0;
            for (let i = 0; i < scan.bundles.length; i++) {
                const bundle = scan.bundles[i];
                const name = bundle.dest.substring(bundle.dest.lastIndexOf("/") + 1);
                progress.setWaiting(i, name);
                try {
                    const buffer = await bridge.fetchBundle(bundle.id);
                    await ZipUtils.unzipBinDataToLocation(buffer, bundle.dest, false,
                        function (doneCount, totalCount) {
                            progress.setBundleProgress(i, name, doneCount, totalCount);
                            return true; // must be explicit, see unzipBinDataToLocation
                        });
                    migratedFiles = migratedFiles + bundle.fileCount;
                } catch (err) {
                    // One bad folder should not cost the user everything else.
                    console.error("MigrateAssist: bundle failed", bundle.id, err);
                    failed.push(name);
                }
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

            progress.finish({
                message: StringUtils.format(Strings.MIGRATE_DONE_MESSAGE, migratedFiles),
                detail: failed.length
                    ? StringUtils.format(Strings.MIGRATE_DONE_PARTIAL, failed.join(", "))
                    : null
            });
            return RESULT_MIGRATED;
        } catch (err) {
            console.error("MigrateAssist: migration could not run", err);
            Metrics.countEvent(Metrics.EVENT_TYPE.PLATFORM, "migrateAssist",
                manual ? "manualUnreachable" : "autoUnreachable");
            if (progress) {
                progress.dialog.close();
            }
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
        if (result === RESULT_NOTHING) {
            Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_INFO,
                Strings.MIGRATE_NOTHING_TITLE,
                StringUtils.format(Strings.MIGRATE_NOTHING_MESSAGE, Constants.LEGACY_DOMAIN_NAME));
        } else if (result === RESULT_UNREACHABLE) {
            Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_ERROR,
                Strings.MIGRATE_UNREACHABLE_TITLE,
                StringUtils.format(Strings.MIGRATE_UNREACHABLE_MESSAGE, Constants.LEGACY_DOMAIN_NAME));
        }
    }

    exports.runOnBoot = runOnBoot;
    exports.runManually = runManually;
});
