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

// this file uses tauri APIs directly and is probably the only place where tauri apis are used outside of the
// shell.js file. This is app updates are pretty core level even though we do it as an extension here.

define(function (require, exports, module) {
    const AppInit = require("utils/AppInit"),
        Metrics = require("utils/Metrics"),
        Commands = require("command/Commands"),
        CommandManager  = require("command/CommandManager"),
        Menus = require("command/Menus"),
        Dialogs = require("widgets/Dialogs"),
        NodeUtils = require("utils/NodeUtils"),
        DefaultDialogs  = require("widgets/DefaultDialogs"),
        Strings     = require("strings"),
        marked = require('thirdparty/marked.min'),
        semver = require("thirdparty/semver.browser"),
        TaskManager = require("features/TaskManager"),
        NativeApp           = require("utils/NativeApp"),
        PreferencesManager  = require("preferences/PreferencesManager");
    let updaterWindow, updateTask, updatePendingRestart, updateFailed;

    const TAURI_UPDATER_WINDOW_LABEL = "updater",
        KEY_LAST_UPDATE_CHECK_TIME = "PH_LAST_UPDATE_CHECK_TIME",
        KEY_UPDATE_AVAILABLE = "PH_UPDATE_AVAILABLE";

    function showOrHideUpdateIcon() {
        if(!updaterWindow){
            updaterWindow = window.__TAURI__.window.WebviewWindow.getByLabel(TAURI_UPDATER_WINDOW_LABEL);
        }
        if(updaterWindow && !updateTask) {
            updateTask = TaskManager.addNewTask(Strings.UPDATING_APP, Strings.UPDATING_APP_MESSAGE,
                `<i class="fa-solid fa-cogs"></i>`, {
                    onSelect: function () {
                        if(updatePendingRestart){
                            Dialogs.showInfoDialog(Strings.UPDATE_READY_RESTART_TITLE, Strings.UPDATE_READY_RESTART_MESSAGE);
                        } else if(updateFailed){
                            Dialogs.showInfoDialog(Strings.UPDATE_FAILED_TITLE, Strings.UPDATE_FAILED_MESSAGE);
                        }else {
                            Dialogs.showInfoDialog(Strings.UPDATING_APP, Strings.UPDATING_APP_DIALOG_MESSAGE);
                        }
                    }
                });
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

    function createTauriUpdateWindow() {
        if(updaterWindow){
            return;
        }
        Metrics.countEvent(Metrics.EVENT_TYPE.UPDATES, 'window', "create"+Phoenix.platform);
        // as we are a single instance app, and there can be multiple phoenix windows that comes in and goes out,
        // the updater lives in its own independent hidden window.
        updaterWindow = new window.__TAURI__.window.WebviewWindow(TAURI_UPDATER_WINDOW_LABEL, {
            url: "tauri-updater.html?stage=" + Phoenix.config.environment,
            title: "Desktop App Updater",
            fullscreen: false,
            resizable: false,
            height: 320,
            minHeight: 320,
            width: 240,
            minWidth: 240,
            acceptFirstMouse: false,
            visible: false
        });
        if(window.__TAURI__.window.WebviewWindow.getByLabel(TAURI_UPDATER_WINDOW_LABEL)){
            Metrics.countEvent(Metrics.EVENT_TYPE.UPDATES, 'window', "okCreate"+Phoenix.platform);
        }
    }

    async function doUpdate() {
        createTauriUpdateWindow();
        showOrHideUpdateIcon();
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
            const phoenixBinaryVersion = await NodeUtils.getPhoenixBinaryVersion();
            const phoenixLoadedAppVersion = Phoenix.metadata.apiVersion;
            if(semver.gt(updateMetadata.version, phoenixBinaryVersion)){
                console.log("Update available: ", updateMetadata, "Detected platform: ", updatePlatformKey);
                PreferencesManager.setViewState(KEY_UPDATE_AVAILABLE, true);
                updateDetails.shouldUpdate = true;
                updateDetails.updateVersion = updateMetadata.version;
                updateDetails.releaseNotesMarkdown = updateMetadata.notes;
                if(updateMetadata.platforms && updateMetadata.platforms[updatePlatformKey]){
                    updateDetails.downloadURL = updateMetadata.platforms[updatePlatformKey].url;
                }
            } else if(semver.eq(updateMetadata.version, phoenixBinaryVersion) &&
                !semver.eq(phoenixLoadedAppVersion, phoenixBinaryVersion)){
                console.log("Updates applied, waiting for app restart: ", phoenixBinaryVersion, phoenixLoadedAppVersion);
                updateDetails.updatePendingRestart = true;
                PreferencesManager.setViewState(KEY_UPDATE_AVAILABLE, true);
            } else {
                console.log("no updates available for platform: ", updateDetails.updatePlatform);
                PreferencesManager.setViewState(KEY_UPDATE_AVAILABLE, false);
            }
            showOrHideUpdateIcon();
        } catch (e) {
            console.error("Error getting update metadata", e);
            updateFailed = true;
            Metrics.countEvent(Metrics.EVENT_TYPE.UPDATES, 'fail', "Unknown"+Phoenix.platform);
        }
        return updateDetails;
    }

    /**
     * We should only upgrade if the current binary is at an installed location.
     */
    async function isUpgradableLocation() {
        try {
            if (brackets.platform === "linux") {
                let homeDir = await window.__TAURI__.path.homeDir(); // Eg. "/home/home/"
                if(!homeDir.endsWith("/")){
                   homeDir = homeDir + "/";
                }
                const phoenixInstallDir = `${homeDir}.phoenix-code/`;
                const cliArgs = await window.__TAURI__.invoke('_get_commandline_args');
                const phoenixBinLoadedPath = cliArgs[0];
                // we only upgrade if the install location is created by the installer
                return phoenixBinLoadedPath.startsWith(phoenixInstallDir);
            }
        } catch (e) {
            logger.reportError(e);
            console.error(e);
            return false;
        }
        // for mac, this is handled by tauri APIs, so we always say yes.
        // for win, this is handled by windows installer nsis exe, so we always say yes.
        return true;
    }

    async function checkForUpdates(isAutoUpdate) {
        showOrHideUpdateIcon();
        if(updateTask){
            $("#status-tasks .btn-dropdown").click();
            return;
        }
        const updateDetails = await getUpdateDetails();
        if(updateFailed) {
            Dialogs.showInfoDialog(Strings.UPDATE_FAILED_TITLE, Strings.UPDATE_FAILED_MESSAGE);
            return;
        }
        if(updatePendingRestart || updateDetails.updatePendingRestart){
            Dialogs.showInfoDialog(Strings.UPDATE_READY_RESTART_TITLE, Strings.UPDATE_READY_RESTART_MESSAGE);
            return;
        }
        if(!updateDetails.shouldUpdate){
            (!isAutoUpdate) && Dialogs.showInfoDialog(Strings.UPDATE_NOT_AVAILABLE_TITLE, Strings.UPDATE_UP_TO_DATE);
            return;
        }
        const buttons = [
            { className: Dialogs .DIALOG_BTN_CLASS_NORMAL, id: Dialogs .DIALOG_BTN_CANCEL, text: Strings.UPDATE_LATER },
            { className: Dialogs .DIALOG_BTN_CLASS_PRIMARY, id: Dialogs .DIALOG_BTN_OK, text: Strings.GET_IT_NOW }
        ];
        let markdownHtml = marked.parse(updateDetails.releaseNotesMarkdown || "");
        Metrics.countEvent(Metrics.EVENT_TYPE.UPDATES, 'dialog', "shown"+Phoenix.platform);
        Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_INFO, Strings.UPDATE_AVAILABLE_TITLE, markdownHtml, buttons)
            .done(option=>{
                isUpgradableLocation().then(isUpgradableLoc=>{
                    if(!isUpgradableLoc) {
                        // user installed linux as binary without installer, we just open phcode.io
                        const downloadPage = brackets.config.homepage_url || "https://phcode.io";
                        NativeApp.openURLInDefaultBrowser(downloadPage);
                        return;
                    }
                    if(option === Dialogs.DIALOG_BTN_OK && !updaterWindow){
                        doUpdate();
                        return;
                    }
                    Metrics.countEvent(Metrics.EVENT_TYPE.UPDATES, 'dialog', "cancel"+Phoenix.platform);
                });
            });
    }

    const UPDATE_COMMANDS = {
        GET_STATUS: "GET_STATUS"
    };
    const UPDATE_EVENT = {
        STATUS: "STATUS",
        LOG_ERROR: "LOG_ERROR"
    };
    const UPDATE_STATUS = {
        STARTED: "STARTED",
        FAILED: "FAILED",
        FAILED_UNKNOWN_OS: "FAILED_UNKNOWN_OS",
        INSTALLED: "INSTALLED"
    };

    function _sendUpdateCommand(command, data) {
        window.__TAURI__.event.emit('updateCommands', {command, data});
    }

    function _refreshUpdateStatus() {
        _sendUpdateCommand(UPDATE_COMMANDS.GET_STATUS);
    }

    let updateInstalledDialogShown = false, updateFailedDialogShown = false;
    AppInit.appReady(function () {
        if(!Phoenix.browser.isTauri || Phoenix.isTestWindow) {
            // app updates are only for desktop builds
            return;
        }
        updaterWindow = window.__TAURI__.window.WebviewWindow.getByLabel(TAURI_UPDATER_WINDOW_LABEL);
        window.__TAURI__.event.listen("updater-event", (receivedEvent)=> {
            console.log("received Event updater-event", receivedEvent);
            const {eventName, data} = receivedEvent.payload;
            if(eventName === UPDATE_EVENT.STATUS) {
                if(data === UPDATE_STATUS.FAILED_UNKNOWN_OS && !updateFailedDialogShown){
                    updateFailedDialogShown = true;
                    Metrics.countEvent(Metrics.EVENT_TYPE.UPDATES, 'fail', "Unknown"+Phoenix.platform);
                    updateFailed = true;
                    updateTask.setFailed();
                    updateTask.setMessage(Strings.UPDATE_FAILED_TITLE);
                } else if(data === UPDATE_STATUS.FAILED && !updateFailedDialogShown){
                    updateFailedDialogShown = true;
                    Metrics.countEvent(Metrics.EVENT_TYPE.UPDATES, 'fail', Phoenix.platform);
                    updateFailed = true;
                    updateTask.setFailed();
                    updateTask.setMessage(Strings.UPDATE_FAILED_TITLE);
                    Dialogs.showInfoDialog(Strings.UPDATE_FAILED_TITLE, Strings.UPDATE_FAILED_MESSAGE);
                } else if(data === UPDATE_STATUS.INSTALLED && !updateInstalledDialogShown){
                    updateInstalledDialogShown = true;
                    Metrics.countEvent(Metrics.EVENT_TYPE.UPDATES, 'done', Phoenix.platform);
                    updatePendingRestart = true;
                    updateTask.setSucceded();
                    updateTask.setTitle(Strings.UPDATE_DONE);
                    updateTask.setMessage(Strings.UPDATE_RESTART);
                    Dialogs.showInfoDialog(Strings.UPDATE_READY_RESTART_TITLE, Strings.UPDATE_READY_RESTART_MESSAGE);
                }
                showOrHideUpdateIcon();
            } if(eventName === UPDATE_EVENT.LOG_ERROR) {
                logger.reportErrorMessage(data);
            }
        });
        $("#update-notification").click(()=>{
            checkForUpdates();
        });
        const commandID = Commands.HELP_CHECK_UPDATES;
        CommandManager.register(Strings.CMD_CHECK_FOR_UPDATE, commandID, ()=>{
            checkForUpdates();
        });
        const helpMenu = Menus.getMenu(Menus.AppMenuBar.HELP_MENU);
        helpMenu.addMenuItem(commandID, "", Menus.AFTER, Commands.HELP_GET_INVOLVED);
        showOrHideUpdateIcon();
        _refreshUpdateStatus();
        // check for updates at boot
        let lastUpdateCheckTime = PreferencesManager.getViewState(KEY_LAST_UPDATE_CHECK_TIME);
        if(!lastUpdateCheckTime){
            lastUpdateCheckTime = Date.now();
            PreferencesManager.setViewState(KEY_LAST_UPDATE_CHECK_TIME, lastUpdateCheckTime);
        }
        const currentTime = Date.now();
        const oneDayInMilliseconds = 24 * 60 * 60 * 1000; // 24 hours * 60 minutes * 60 seconds * 1000 milliseconds
        if ((currentTime - lastUpdateCheckTime) < oneDayInMilliseconds) {
            console.log("Skipping update check: last update check was within one day");
            return;
        }
        PreferencesManager.setViewState(KEY_LAST_UPDATE_CHECK_TIME, currentTime);
        checkForUpdates(true);
    });
});
