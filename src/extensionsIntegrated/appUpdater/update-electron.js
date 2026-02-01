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

/*global logger*/

// Electron-specific app updater for Linux
// Windows/Mac are not supported in Electron edge builds

define(function (require, exports, module) {
    const AppInit = require("utils/AppInit"),
        Metrics = require("utils/Metrics"),
        Commands = require("command/Commands"),
        CommandManager  = require("command/CommandManager"),
        Menus = require("command/Menus"),
        Dialogs = require("widgets/Dialogs"),
        DefaultDialogs  = require("widgets/DefaultDialogs"),
        Strings     = require("strings"),
        marked = require('thirdparty/marked.min'),
        semver = require("thirdparty/semver.browser"),
        NotificationUI = require("widgets/NotificationUI"),
        TaskManager = require("features/TaskManager"),
        NativeApp           = require("utils/NativeApp"),
        PreferencesManager  = require("preferences/PreferencesManager");

    let updateTask, updatePendingRestart, updateFailed;

    const KEY_LAST_UPDATE_CHECK_TIME = "PH_LAST_UPDATE_CHECK_TIME",
        KEY_LAST_UPDATE_DESCRIPTION = "PH_LAST_UPDATE_DESCRIPTION",
        KEY_UPDATE_AVAILABLE = "PH_UPDATE_AVAILABLE";

    const PREFS_AUTO_UPDATE = "autoUpdate";
    const MAX_LOG_LINES = 500;
    let isAutoUpdateFlow = true;
    let updateScheduled = false;
    let cachedUpdateDetails = null;

    function showOrHideUpdateIcon() {
        if(updateScheduled && !updateTask) {
            updateTask = TaskManager.addNewTask(Strings.UPDATING_APP, Strings.UPDATING_APP_MESSAGE,
                `<i class="fa-solid fa-cogs"></i>`, {
                    noSpinnerNotification: isAutoUpdateFlow,
                    onSelect: function () {
                        if(updatePendingRestart){
                            Dialogs.showInfoDialog(Strings.UPDATE_READY_RESTART_TITLE,
                                Strings.UPDATE_READY_RESTART_INSTALL_MESSAGE);
                        } else if(updateFailed){
                            Dialogs.showInfoDialog(Strings.UPDATE_FAILED_TITLE, Strings.UPDATE_FAILED_MESSAGE);
                        } else {
                            Dialogs.showInfoDialog(Strings.UPDATING_APP, Strings.UPDATING_APP_DIALOG_MESSAGE);
                        }
                    }
                });
            if(!isAutoUpdateFlow) {
                updateTask.show();
            } else {
                updateTask.flashSpinnerForAttention();
            }
        }
        let updateAvailable = PreferencesManager.getViewState(KEY_UPDATE_AVAILABLE);
        if(updateAvailable){
            $("#update-notification").removeClass("forced-hidden");
        } else {
            $("#update-notification").addClass("forced-hidden");
        }
    }

    function fetchJSON(url) {
        return fetch(url)
            .then(response => {
                if (!response.ok) {
                    return null;
                }
                return response.json();
            });
    }

    async function getUpdatePlatformKey() {
        const platformArch = await Phoenix.app.getPlatformArch();
        let os = 'windows';
        if (brackets.platform === "mac") {
            os = "darwin";
        } else if (brackets.platform === "linux") {
            os = "linux";
        }
        return `${os}-${platformArch}`;
    }

    async function getUpdateDetails() {
        const updatePlatformKey = await getUpdatePlatformKey();
        const updateDetails = {
            shouldUpdate: false,
            updatePendingRestart: false,
            downloadURL: null,
            currentVersion: Phoenix.metadata.apiVersion,
            updateVersion: null,
            releaseNotesMarkdown: null,
            updatePlatform: updatePlatformKey
        };
        try{
            const updateMetadata = await fetchJSON(brackets.config.app_update_url);
            // In Electron, binary version and loaded app version are always the same
            // since both are loaded at app start and only change after full restart
            const currentVersion = await window.electronAPI.getAppVersion();
            if(semver.gt(updateMetadata.version, currentVersion)){
                console.log("Update available: ", updateMetadata, "Detected platform: ", updatePlatformKey);
                PreferencesManager.setViewState(KEY_UPDATE_AVAILABLE, true);
                updateDetails.shouldUpdate = true;
                updateDetails.updateVersion = updateMetadata.version;
                updateDetails.releaseNotesMarkdown = updateMetadata.notes;
                if(updateMetadata.platforms && updateMetadata.platforms[updatePlatformKey]){
                    updateDetails.downloadURL = updateMetadata.platforms[updatePlatformKey].url;
                }
            } else {
                console.log("no updates available for platform: ", updateDetails.updatePlatform);
                PreferencesManager.setViewState(KEY_UPDATE_AVAILABLE, false);
            }
            showOrHideUpdateIcon();
        } catch (e) {
            console.error("Error getting update metadata", e);
            logger.reportError(e, `Error getting app update metadata`);
            updateFailed = true;
            Metrics.countEvent(Metrics.EVENT_TYPE.UPDATES, 'fail', "Unknown"+Phoenix.platform);
        }
        return updateDetails;
    }

    /**
     * Check if we're at an upgradable location.
     * For Electron on Linux, we require the AppImage to be in ~/.phoenix-code/
     */
    async function isUpgradableLocation() {
        try {
            const isPackaged = await window.electronAPI.isPackaged();
            if (!isPackaged) {
                return false;
            }
            const homeDir = await window.electronFSAPI.homeDir();
            const phoenixInstallDir = `${homeDir}.phoenix-code/`;
            const execPath = await window.electronAPI.getExecutablePath();
            return execPath.startsWith(phoenixInstallDir);
        } catch (e) {
            console.error(e);
            return false;
        }
    }

    function _getButtons(isUpgradableLoc) {
        const updateLater =
            {className: Dialogs.DIALOG_BTN_CLASS_NORMAL, id: Dialogs.DIALOG_BTN_CANCEL, text: Strings.UPDATE_LATER };
        const getItNow =
            { className: Dialogs.DIALOG_BTN_CLASS_PRIMARY, id: Dialogs.DIALOG_BTN_OK, text: Strings.GET_IT_NOW };
        const updateOnExit =
            { className: Dialogs.DIALOG_BTN_CLASS_PRIMARY, id: Dialogs.DIALOG_BTN_OK, text: Strings.UPDATE_ON_EXIT };
        if(!isUpgradableLoc) {
            return [updateLater, getItNow];
        }
        return [updateLater, updateOnExit];
    }

    async function scheduleUpdate(updateDetails) {
        updateScheduled = true;
        updatePendingRestart = true;
        cachedUpdateDetails = updateDetails;
        showOrHideUpdateIcon();
        Metrics.countEvent(Metrics.EVENT_TYPE.UPDATES, 'scheduled', Phoenix.platform);
        updateTask.setSucceded();
        updateTask.setTitle(Strings.UPDATE_DONE);
        updateTask.setMessage(Strings.UPDATE_RESTART_INSTALL);
        NotificationUI.createToastFromTemplate(Strings.UPDATE_READY_RESTART_TITLE,
            `<div>${Strings.UPDATE_READY_RESTART_INSTALL_MESSAGE}</div>`, {
                toastStyle: NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.SUCCESS,
                dismissOnClick: true
            });
        Phoenix.app.registerQuitTimeAppUpdateHandler(quitTimeAppUpdateHandler);
    }

    async function _updateWithConfirmDialog(isUpgradableLoc, updateDetails) {
        const buttons = _getButtons(isUpgradableLoc);
        let markdownHtml = marked.parse(updateDetails.releaseNotesMarkdown || "");
        Metrics.countEvent(Metrics.EVENT_TYPE.UPDATES, 'dialog', "shown"+Phoenix.platform);
        Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_INFO, Strings.UPDATE_AVAILABLE_TITLE, markdownHtml, buttons)
            .done(option=>{
                if(option === Dialogs.DIALOG_BTN_CANCEL){
                    Metrics.countEvent(Metrics.EVENT_TYPE.UPDATES, 'dialog', "cancel"+Phoenix.platform);
                    return;
                }
                if(!isUpgradableLoc) {
                    const downloadPage = brackets.config.homepage_url || "https://phcode.io";
                    NativeApp.openURLInDefaultBrowser(downloadPage);
                    Metrics.countEvent(Metrics.EVENT_TYPE.UPDATES, 'dialog', "nonUpgradable"+Phoenix.platform);
                    return;
                }
                if(option === Dialogs.DIALOG_BTN_OK && !updateScheduled){
                    Metrics.countEvent(Metrics.EVENT_TYPE.UPDATES, 'dialog', "okUpdate"+Phoenix.platform);
                    scheduleUpdate(updateDetails);
                }
            });
    }

    async function checkForUpdates(isAutoUpdate) {
        isAutoUpdateFlow = isAutoUpdate;
        showOrHideUpdateIcon();
        if(!navigator.onLine) {
            return;
        }
        if(updateTask){
            $("#status-tasks .btn-dropdown").click();
            return;
        }
        const updateDetails = await getUpdateDetails();
        if(updateFailed) {
            if(!isAutoUpdate) {
                Dialogs.showInfoDialog(Strings.UPDATE_FAILED_TITLE, Strings.UPDATE_FAILED_MESSAGE);
            }
            return;
        }
        if(updatePendingRestart || updateDetails.updatePendingRestart){
            if(!isAutoUpdate){
                Dialogs.showInfoDialog(Strings.UPDATE_READY_RESTART_TITLE,
                    Strings.UPDATE_READY_RESTART_INSTALL_MESSAGE);
            }
            return;
        }
        if(!updateDetails.shouldUpdate){
            (!isAutoUpdate) && Dialogs.showInfoDialog(Strings.UPDATE_NOT_AVAILABLE_TITLE, Strings.UPDATE_UP_TO_DATE);
            return;
        }
        const autoUpdateEnabled = PreferencesManager.get(PREFS_AUTO_UPDATE);
        if(isAutoUpdate && !autoUpdateEnabled){
            return;
        }
        const isUpgradableLoc = await isUpgradableLocation();
        if(!isUpgradableLoc || !isAutoUpdate) {
            _updateWithConfirmDialog(isUpgradableLoc, updateDetails);
        } else if(!updateScheduled) {
            Metrics.countEvent(Metrics.EVENT_TYPE.UPDATES, 'auto', "silent"+Phoenix.platform);
            PreferencesManager.setViewState(KEY_LAST_UPDATE_DESCRIPTION, {
                releaseNotesMarkdown: updateDetails.releaseNotesMarkdown,
                updateVersion: updateDetails.updateVersion
            });
            scheduleUpdate(updateDetails);
        }
    }

    /**
     * Launches the Linux updater using spawnProcess with streaming output
     * @param {function} onOutput - Callback for stdout/stderr lines
     * @returns {Promise} Resolves when update completes, rejects on error
     */
    function launchLinuxUpdater(onOutput) {
        return new Promise((resolve, reject) => {
            const stageValue = Phoenix.config.environment;
            console.log('Stage:', stageValue);
            let scriptUrl = 'https://updates.phcode.io/linux/installer.sh';
            if(stageValue === 'dev' || stageValue === 'stage'){
                scriptUrl = "https://updates.phcode.io/linux/installer-latest-experimental-build.sh";
            }

            // Use spawnProcess to run bash with the wget|bash command
            const command = '/bin/bash';
            const args = ['-c', `wget -qO- ${scriptUrl} | bash -s -- --upgrade`];

            window.electronAppAPI.spawnProcess(command, args)
                .then(instanceId => {
                    // Set up output handlers
                    window.electronAppAPI.onProcessStdout((id, line) => {
                        if (id === instanceId && onOutput) {
                            onOutput('stdout', line);
                        }
                    });
                    window.electronAppAPI.onProcessStderr((id, line) => {
                        if (id === instanceId && onOutput) {
                            onOutput('stderr', line);
                        }
                    });
                    window.electronAppAPI.onProcessClose((id, data) => {
                        if (id === instanceId) {
                            if (data.code === 0) {
                                resolve();
                            } else {
                                reject(new Error(`Update script exited with code: ${data.code}`));
                            }
                        }
                    });
                    window.electronAppAPI.onProcessError((id, err) => {
                        if (id === instanceId) {
                            reject(new Error(`Update process error: ${err}`));
                        }
                    });
                })
                .catch(reject);
        });
    }

    async function quitTimeAppUpdateHandler() {
        if(!updateScheduled){
            return;
        }
        console.log("Installing update at quit time");
        return new Promise(resolve => {
            let dialog;
            let logLines = [];

            function appendLogLine(text) {
                // Split text into lines and add each
                const lines = text.split('\n').filter(l => l.trim());
                for (const line of lines) {
                    logLines.push(line);
                    // Keep only last MAX_LOG_LINES
                    if (logLines.length > MAX_LOG_LINES) {
                        logLines.shift();
                    }
                }
                // Update the log display
                const logElement = document.getElementById('update-log-output');
                if (logElement) {
                    logElement.textContent = logLines.join('\n');
                    logElement.scrollTop = logElement.scrollHeight;
                }
            }

            function failUpdateDialogAndExit(err) {
                console.error("error updating: ", err);
                dialog && dialog.close();
                // Build full log text for copying
                const fullLogText = logLines.join('\n') + '\n\nError: ' + (err.message || err);
                // Show failure dialog with log output and hover copy icon
                const failContent = `
                    <p>${Strings.UPDATE_FAILED_VISIT_SITE_MESSAGE}</p>
                    <div id="update-fail-log-container" style="
                        position: relative;
                        margin-top: 10px;
                    ">
                        <pre id="update-fail-log" style="
                            background: #1e1e1e;
                            color: #d4d4d4;
                            padding: 10px;
                            border-radius: 4px;
                            font-family: 'Consolas', 'Monaco', monospace;
                            font-size: 11px;
                            height: 200px;
                            overflow-y: auto;
                            white-space: pre-wrap;
                            word-wrap: break-word;
                            margin: 0;
                        ">${fullLogText}</pre>
                        <i id="update-log-copy-btn" class="fa-solid fa-copy" title="${Strings.CMD_COPY}" style="
                            position: absolute;
                            top: 8px;
                            right: 8px;
                            color: #888;
                            cursor: pointer;
                            padding: 5px;
                            border-radius: 3px;
                            opacity: 0;
                            transition: opacity 0.2s;
                        "></i>
                    </div>
                `;
                const failDialog = Dialogs.showModalDialog(
                    DefaultDialogs.DIALOG_ID_ERROR,
                    Strings.UPDATE_FAILED_TITLE,
                    failContent,
                    [{ className: Dialogs.DIALOG_BTN_CLASS_PRIMARY, id: Dialogs.DIALOG_BTN_OK, text: Strings.OK }]
                );
                // Set up hover and click handlers for copy icon
                const $container = $('#update-fail-log-container');
                const $copyBtn = $('#update-log-copy-btn');
                $container.on('mouseenter', () => $copyBtn.css('opacity', '1'));
                $container.on('mouseleave', () => $copyBtn.css('opacity', '0'));
                $copyBtn.on('click', () => {
                    Phoenix.app.copyToClipboard(fullLogText);
                    $copyBtn.removeClass('fa-copy').addClass('fa-check');
                    setTimeout(() => {
                        $copyBtn.removeClass('fa-check').addClass('fa-copy');
                    }, 1500);
                });
                $copyBtn.on('mouseenter', () => $copyBtn.css({ 'background': '#333', 'color': '#fff' }));
                $copyBtn.on('mouseleave', () => $copyBtn.css({ 'background': 'transparent', 'color': '#888' }));

                failDialog.done(() => {
                    NativeApp.openURLInDefaultBrowser(Phoenix.config.update_download_page)
                        .catch(console.error)
                        .finally(resolve);
                });
            }

            // Create dialog with terminal-style log output
            const dialogContent = `
                <p>${Strings.UPDATE_INSTALLING_MESSAGE}</p>
                <pre id="update-log-output" style="
                    background: #1e1e1e;
                    color: #d4d4d4;
                    padding: 10px;
                    border-radius: 4px;
                    font-family: 'Consolas', 'Monaco', monospace;
                    font-size: 11px;
                    height: 200px;
                    overflow-y: auto;
                    white-space: pre-wrap;
                    word-wrap: break-word;
                    margin-top: 10px;
                "></pre>
            `;

            dialog = Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_INFO,
                Strings.UPDATE_INSTALLING,
                dialogContent,
                [
                    {
                        className: "forced-hidden",
                        id: Dialogs.DIALOG_BTN_OK,
                        text: Strings.OK
                    }
                ],
                false
            );

            launchLinuxUpdater((type, text) => {
                appendLogLine(text);
            })
                .then(resolve)
                .catch(failUpdateDialogAndExit);
        });
    }

    AppInit.appReady(function () {
        if(!window.__ELECTRON__ || Phoenix.isTestWindow) {
            return;
        }
        // Electron updates only supported on Linux currently
        if (brackets.platform !== "linux") {
            console.error("App updates not yet implemented on this platform in Electron builds!");
            return;
        }
        $("#update-notification").click(()=>{
            checkForUpdates();
        });
        CommandManager.register(Strings.CMD_CHECK_FOR_UPDATE, Commands.HELP_CHECK_UPDATES, ()=>{
            checkForUpdates();
        });
        CommandManager.register(Strings.CMD_AUTO_UPDATE, Commands.HELP_AUTO_UPDATE, ()=>{
            PreferencesManager.set(PREFS_AUTO_UPDATE, !PreferencesManager.get(PREFS_AUTO_UPDATE));
        });
        const helpMenu = Menus.getMenu(Menus.AppMenuBar.HELP_MENU);
        helpMenu.addMenuItem(Commands.HELP_CHECK_UPDATES, "", Menus.AFTER, Commands.HELP_GET_INVOLVED);
        PreferencesManager.definePreference(PREFS_AUTO_UPDATE, "boolean", true, {
            description: Strings.DESCRIPTION_AUTO_UPDATE
        });
        showOrHideUpdateIcon();
        const lastUpdateDetails = PreferencesManager.getViewState(KEY_LAST_UPDATE_DESCRIPTION);
        if(lastUpdateDetails && (lastUpdateDetails.updateVersion === Phoenix.metadata.apiVersion)) {
            let markdownHtml = marked.parse(lastUpdateDetails.releaseNotesMarkdown || "");
            Dialogs.showInfoDialog(Strings.UPDATE_WHATS_NEW, markdownHtml);
            PreferencesManager.setViewState(KEY_LAST_UPDATE_DESCRIPTION, null);
            PreferencesManager.setViewState(KEY_UPDATE_AVAILABLE, false);
            $("#update-notification").addClass("forced-hidden");
        }
        // check for updates at boot
        let lastUpdateCheckTime = PreferencesManager.getViewState(KEY_LAST_UPDATE_CHECK_TIME);
        const currentTime = Date.now();
        const oneDayInMilliseconds = 24 * 60 * 60 * 1000;
        if(lastUpdateCheckTime && ((currentTime - lastUpdateCheckTime) < oneDayInMilliseconds)){
            console.log("Skipping update check: last update check was within one day");
            return;
        }
        PreferencesManager.setViewState(KEY_LAST_UPDATE_CHECK_TIME, currentTime);
        checkForUpdates(true);
    });
});
