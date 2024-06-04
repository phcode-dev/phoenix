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

/*global logger, path*/

// this file uses tauri APIs directly and is probably the only place where tauri apis are used outside of the
// shell.js file. This is app updates are pretty core level even though we do it as an extension here.

define(function (require, exports, module) {
    const AppInit = require("utils/AppInit"),
        Metrics = require("utils/Metrics"),
        FileSystem    = require("filesystem/FileSystem"),
        FileUtils   = require("file/FileUtils"),
        Commands = require("command/Commands"),
        CommandManager  = require("command/CommandManager"),
        Menus = require("command/Menus"),
        Dialogs = require("widgets/Dialogs"),
        NodeUtils = require("utils/NodeUtils"),
        DefaultDialogs  = require("widgets/DefaultDialogs"),
        Strings     = require("strings"),
        marked = require('thirdparty/marked.min'),
        semver = require("thirdparty/semver.browser"),
        NotificationUI = require("widgets/NotificationUI"),
        TaskManager = require("features/TaskManager"),
        StringUtils         = require("utils/StringUtils"),
        NativeApp           = require("utils/NativeApp"),
        PreferencesManager  = require("preferences/PreferencesManager");
    let updaterWindow, updateTask, updatePendingRestart, updateFailed;

    const TAURI_UPDATER_WINDOW_LABEL = "updater",
        KEY_LAST_UPDATE_CHECK_TIME = "PH_LAST_UPDATE_CHECK_TIME",
        KEY_LAST_UPDATE_DESCRIPTION = "PH_LAST_UPDATE_DESCRIPTION",
        KEY_UPDATE_AVAILABLE = "PH_UPDATE_AVAILABLE";

    const PREFS_AUTO_UPDATE = "autoUpdate";
    let isAutoUpdateFlow = true;

    function showOrHideUpdateIcon() {
        if(!updaterWindow){
            updaterWindow = window.__TAURI__.window.WebviewWindow.getByLabel(TAURI_UPDATER_WINDOW_LABEL);
        }
        if(updaterWindow && !updateTask) {
            updateTask = TaskManager.addNewTask(Strings.UPDATING_APP, Strings.UPDATING_APP_MESSAGE,
                `<i class="fa-solid fa-cogs"></i>`, {
                    noSpinnerNotification: isAutoUpdateFlow, // for auto updates, don't get user attention with spinner
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

    function createTauriUpdateWindow(downloadURL) {
        if(updaterWindow){
            return;
        }
        Metrics.countEvent(Metrics.EVENT_TYPE.UPDATES, 'window', "create"+Phoenix.platform);
        // as we are a single instance app, and there can be multiple phoenix windows that comes in and goes out,
        // the updater lives in its own independent hidden window.
        const url = downloadURL ?
            `tauri-updater.html?stage=${Phoenix.config.environment}&downloadURL=${encodeURIComponent(downloadURL)}` :
            `tauri-updater.html?stage=${Phoenix.config.environment}`;
        updaterWindow = new window.__TAURI__.window.WebviewWindow(TAURI_UPDATER_WINDOW_LABEL, {
            url: url,
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

    async function doUpdate(downloadURL) {
        createTauriUpdateWindow(downloadURL);
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
            if(!updaterWindow){
                updaterWindow = window.__TAURI__.window.WebviewWindow.getByLabel(TAURI_UPDATER_WINDOW_LABEL);
            }
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
                !semver.eq(phoenixLoadedAppVersion, phoenixBinaryVersion) && updaterWindow){
                // the updaterWindow check is here so that it only makes sense to show restart dialog if the update
                // was actually done. We have a version number mismatch of 0.0.1 between phoenix-desktop and phoenix
                // repo, and that means that this can get triggered on statup on development builds. Wont happen in
                // actual pipeline generated build tho.
                console.log("Updates applied, waiting for app restart:", phoenixBinaryVersion, phoenixLoadedAppVersion);
                updateDetails.updatePendingRestart = true;
                PreferencesManager.setViewState(KEY_UPDATE_AVAILABLE, true);
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

    function _getButtons(isUpgradableLoc) {
        const updateLater =
            {className: Dialogs .DIALOG_BTN_CLASS_NORMAL, id: Dialogs .DIALOG_BTN_CANCEL, text: Strings.UPDATE_LATER };
        const getItNow =
            { className: Dialogs .DIALOG_BTN_CLASS_PRIMARY, id: Dialogs .DIALOG_BTN_OK, text: Strings.GET_IT_NOW };
        const updateOnExit =
            { className: Dialogs .DIALOG_BTN_CLASS_PRIMARY, id: Dialogs .DIALOG_BTN_OK, text: Strings.UPDATE_ON_EXIT };
        if(!isUpgradableLoc) {
            return [updateLater, getItNow];
        }
        return [updateLater, updateOnExit];
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
                    // user installed linux as binary without installer, we just open phcode.io
                    const downloadPage = brackets.config.homepage_url || "https://phcode.io";
                    NativeApp.openURLInDefaultBrowser(downloadPage);
                    Metrics.countEvent(Metrics.EVENT_TYPE.UPDATES, 'dialog', "nonUpgradable"+Phoenix.platform);
                    return;
                }
                if(option === Dialogs.DIALOG_BTN_OK && !updaterWindow){
                    Metrics.countEvent(Metrics.EVENT_TYPE.UPDATES, 'dialog', "okUpdate"+Phoenix.platform);
                    doUpdate(updateDetails.downloadURL);
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
        const updateDetails = await getUpdateDetails(); // this will also show update icon if update present
        if(updateFailed) {
            if(!isAutoUpdate) {
                // we dont show auto update errors to user
                Dialogs.showInfoDialog(Strings.UPDATE_FAILED_TITLE, Strings.UPDATE_FAILED_MESSAGE);
            }
            return;
        }
        if(updatePendingRestart || updateDetails.updatePendingRestart){
            if(!isAutoUpdate){
                Dialogs.showInfoDialog(Strings.UPDATE_READY_RESTART_TITLE,
                    Strings.UPDATE_READY_RESTART_INSTALL_MESSAGE);
                // the dialog will only be shown in explicit check for updates, else its annoying that this comes
                // up at every new window create from app.
            }
            return;
        }
        if(!updateDetails.shouldUpdate){
            (!isAutoUpdate) && Dialogs.showInfoDialog(Strings.UPDATE_NOT_AVAILABLE_TITLE, Strings.UPDATE_UP_TO_DATE);
            return;
        }
        const autoUpdateEnabled = PreferencesManager.get(PREFS_AUTO_UPDATE);
        if(isAutoUpdate && !autoUpdateEnabled){
            // the update icon is lit at this time for the user to hint that an update is available
            // but, we don't show the dialog if auto update is off.
            return;
        }
        const isUpgradableLoc = await isUpgradableLocation();
        if(!isUpgradableLoc || !isAutoUpdate) {
            _updateWithConfirmDialog(isUpgradableLoc, updateDetails);
        } else if(!updaterWindow) {
            Metrics.countEvent(Metrics.EVENT_TYPE.UPDATES, 'auto', "silent"+Phoenix.platform);
            PreferencesManager.setViewState(KEY_LAST_UPDATE_DESCRIPTION, {
                releaseNotesMarkdown: updateDetails.releaseNotesMarkdown,
                updateVersion: updateDetails.updateVersion
            });
            doUpdate(updateDetails.downloadURL);
        }
    }

    const UPDATE_COMMANDS = {
        GET_STATUS: "GET_STATUS",
        GET_DOWNLOAD_PROGRESS: "GET_DOWNLOAD_PROGRESS",
        GET_INSTALLER_LOCATION: "GET_INSTALLER_LOCATION"
    };
    const UPDATE_EVENT = {
        STATUS: "STATUS",
        LOG_ERROR: "LOG_ERROR",
        DOWNLOAD_PROGRESS: "DOWNLOAD_PROGRESS",
        INSTALLER_LOCATION: "INSTALLER_LOCATION"
    };
    const UPDATE_STATUS = {
        STARTED: "STARTED",
        DOWNLOADING: "DOWNLOADING",
        INSTALLER_DOWNLOADED: "INSTALLER_DOWNLOADED",
        FAILED: "FAILED",
        FAILED_UNKNOWN_OS: "FAILED_UNKNOWN_OS"
    };

    function _sendUpdateCommand(command, data) {
        window.__TAURI__.event.emit('updateCommands', {command, data});
    }

    function _refreshUpdateStatus() {
        _sendUpdateCommand(UPDATE_COMMANDS.GET_STATUS);
    }

    async function launchWindowsInstaller() {
        return new Promise((resolve, reject)=>{
            const appdataDir = window._tauriBootVars.appLocalDir;
            window.__TAURI__.path.resolveResource("src-node/installer/launch-windows-installer.js")
                .then(async nodeSrcPath=>{
                    // this is not supposed to work in linux.
                    const argsArray = [nodeSrcPath, appdataDir];
                    const command = window.__TAURI__.shell.Command.sidecar('phnode', argsArray);
                    command.on('close', data => {
                        console.log(`PhNode: command finished with code ${data.code} and signal ${data.signal}`);
                        if(data.code !== 0) {
                            console.error("Install failed");
                            reject();
                            return;
                        }
                        resolve();
                    });
                    command.on('error', error => {
                        console.error(`PhNode: command error: "${error}"`);
                        reject();
                    });
                    command.stdout.on('data', line => {
                        console.log(`PhNode: ${line}`);
                    });
                    command.stderr.on('data', line => console.error(`PhNode: ${line}`));
                    command.spawn();
                });
        });
    }

    async function launchLinuxUpdater() {
        const stageValue = Phoenix.config.environment;
        console.log('Stage:', stageValue);
        let execCommand = 'wget -qO- https://updates.phcode.io/linux/installer.sh | bash -s -- --upgrade';
        let runCommand = 'run-update-linux-command';
        if(stageValue === 'dev' || stageValue === 'stage'){
            runCommand = 'run-update-linux-command-dev';
            execCommand = "wget -qO- https://updates.phcode.io/linux/installer-latest-experimental-build.sh | bash -s -- --upgrade";
        }
        const command = new window.__TAURI__.shell
            .Command(runCommand, ['-e', execCommand]);
        const result = await command.execute();
        if(result.code !== 0){
            throw new Error("Update script exit with non-0 exit code: " + result.code);
        }
    }

    async function getCurrentMacAppPath() {
        const cliArgs = await window.__TAURI__.invoke('_get_commandline_args');
        let fullPath = cliArgs[0]; // something like /Applications/editor.app/contents/.../Phoenix code
        const normalizedPath = path.normalize(fullPath);
        const parts = normalizedPath.split(path.sep);
        const appIndex = parts.findIndex(part => part.endsWith('.app'));

        // Reconstruct the path up to the .app part
        if (appIndex !== -1) {
            const appPathParts = parts.slice(0, appIndex + 1);
            return appPathParts.join(path.sep); // returns /Applications/editor.app
        }
        // .app part is found
        return null;
    }

    async function _extractMacInstaller() {
        const appdataDir = window._tauriBootVars.appLocalDir;
        let extractPlatformPath = path.join(appdataDir, 'installer', "extracted");
        // extract the .app file
        const extractCommand = new window.__TAURI__.shell
            .Command(`tar-unix`, ['-xzf', installerLocation, "-C", extractPlatformPath]);
        let result = await extractCommand.execute();
        if(result.code !== 0){
            console.error("Could not extract installer at", installerLocation, "to", extractPlatformPath);
            throw new Error("Could not extract installer at " + installerLocation + " to " + extractPlatformPath);
        }
        // remove the quarantine flag
        const removeAttrCommand = new window.__TAURI__.shell
            .Command(`mac-remove-quarantine`, ["-rd", "com.apple.quarantine", extractPlatformPath]);
        result = await removeAttrCommand.execute();
        if(result.code !== 0){
            console.error("Could not remove quarantine attribute for", extractPlatformPath, "ignoring...");
            // we can ignore this failure as the user will be asked for permission by os on clicking anyway.
        }
        // now get the .app path from extracted path
        const extractedVirtualPath = window.fs.getTauriVirtualPath(extractPlatformPath);
        let directory = FileSystem.getDirectoryForPath(extractedVirtualPath);
        const {entries} = await directory.getContentsAsync();
        if(entries.length !== 1 || !entries[0].fullPath.includes(".app")){
            throw new Error("Could not resolve .app to update from extracted folder" + extractedVirtualPath);
        }
        installerLocation = FileUtils.stripTrailingSlash(
            window.fs.getTauriPlatformPath(entries[0].fullPath));
    }

    function _cleanExtractedFolderSilent() {
        return new Promise(resolve=>{
            const appdataDir = window._tauriBootVars.appLocalDir;
            let extractPlatformPath = path.join(appdataDir, 'installer', "extracted");
            const extractedVirtualPath = window.fs.getTauriVirtualPath(extractPlatformPath);
            let directory = FileSystem.getDirectoryForPath(extractedVirtualPath);
            directory.unlinkAsync()
                .catch(console.error)
                .finally(resolve);
        });
    }

    async function doMacUpdate() {
        await _extractMacInstaller();
        const currentAppPath = await getCurrentMacAppPath();
        if(!currentAppPath || !installerLocation || !currentAppPath.endsWith(".app") ||
            !installerLocation.endsWith(".app")){
            throw new Error("Cannot resolve .app location to copy.");
        }
        let removeCommand = new window.__TAURI__.shell
            .Command(`recursive-rm-unix`, ['-r', currentAppPath]);
        let result = await removeCommand.execute();
        if(result.code !== 0){
            console.error("Could not remove old app: ", currentAppPath);
            throw new Error("Could not remove old app: " + currentAppPath);
        }
        const copyCommand = new window.__TAURI__.shell
            .Command(`recursive-copy-unix`, ['-r', installerLocation, currentAppPath]);
        result = await copyCommand.execute();
        if(result.code !== 0){
            throw new Error("Update script exit with non-0 exit code: " + result.code);
        }
        // now remove the original .app
        await _cleanExtractedFolderSilent();
    }

    let installerLocation;
    async function quitTimeAppUpdateHandler() {
        if(!installerLocation){
            return;
        }
        // at this time, the node process have exited and we need to force use tauri apis. This would
        // normally happen as node responds as terminated, but for updates, this is at quit time and we
        // cant wait any longer.
        window.fs.forceUseNodeWSEndpoint(false);
        console.log("Installing update from: ", installerLocation);
        return new Promise(resolve=>{
            // this should never reject as it happens in app quit. rejecting wont affect quit, but its unnecessary.
            let dialog;
            function failUpdateDialogAndExit(err) {
                console.error("error updating: ", err);
                dialog && dialog.close();
                Dialogs.showInfoDialog(Strings.UPDATE_FAILED_TITLE, Strings.UPDATE_FAILED_VISIT_SITE_MESSAGE)
                    .done(()=>{
                        NativeApp.openURLInDefaultBrowser(Phoenix.config.update_download_page)
                            .catch(console.error)
                            .finally(resolve);
                    });
            }
            if (brackets.platform === "win") {
                launchWindowsInstaller()
                    .then(resolve)
                    .catch(failUpdateDialogAndExit);
                return;
            }
            dialog = Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_INFO,
                Strings.UPDATE_INSTALLING,
                Strings.UPDATE_INSTALLING_MESSAGE,
                [
                    {
                        className: "forced-hidden",
                        id: Dialogs.DIALOG_BTN_OK,
                        text: Strings.OK
                    }
                ],
                false
            );
            if (brackets.platform === "linux") {
                launchLinuxUpdater()
                    .then(resolve)
                    .catch(failUpdateDialogAndExit);
            } else if (brackets.platform === "mac") {
                doMacUpdate()
                    .then(resolve)
                    .catch(failUpdateDialogAndExit);
            } else {
                resolve();
            }
        });
    }

    let updateInstalledDialogShown = false, updateFailedDialogShown = false;
    AppInit.appReady(function () {
        if(!Phoenix.isNativeApp || Phoenix.isTestWindow) {
            // app updates are only for desktop builds
            return;
        }
        if (brackets.platform === "mac") {
            // in mac, the `update.app.tar.gz` is downloaded, and only extracted on app quit.
            // we do this only in mac as the `.app` file is extracted only at app quit and deleted
            // and if we see the `extracted file` at app boot, it means the update was broken,and we clear
            // the updated folder. if not, the extracted app may be corrupt, or mac will show that app
            // too in the finder `open with` section.
            // in windows, the `setup.exe.zip` is downloaded and extracted to `setup.exe`. The exe is executed
            // only on app quit. so if we do this in windows, the extracted installer.exe will be
            // deleted on new widow create and the final update will fail if other windows were opened
            // after the installer was downloaded and extracted.
            // in Linux, it is an online installer, nothing is downloaded.
            _cleanExtractedFolderSilent();
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
                } else if(data === UPDATE_STATUS.INSTALLER_DOWNLOADED){
                    Metrics.countEvent(Metrics.EVENT_TYPE.UPDATES, 'downloaded', Phoenix.platform);
                    updatePendingRestart = true;
                    updateTask.setSucceded();
                    updateTask.setTitle(Strings.UPDATE_DONE);
                    updateTask.setMessage(Strings.UPDATE_RESTART_INSTALL);
                    if(!updateInstalledDialogShown){
                        NotificationUI.createToastFromTemplate(Strings.UPDATE_READY_RESTART_TITLE,
                            `<div>${Strings.UPDATE_READY_RESTART_INSTALL_MESSAGE}</div>`, {
                                toastStyle: NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.SUCCESS,
                                dismissOnClick: true
                            });
                        updateInstalledDialogShown = true;
                    }
                    _sendUpdateCommand(UPDATE_COMMANDS.GET_INSTALLER_LOCATION);
                } else if(data === UPDATE_STATUS.DOWNLOADING){
                    updateTask.setMessage(Strings.UPDATE_DOWNLOADING);
                    _sendUpdateCommand(UPDATE_COMMANDS.GET_DOWNLOAD_PROGRESS);
                }
                showOrHideUpdateIcon();
            } else if(eventName === UPDATE_EVENT.DOWNLOAD_PROGRESS) {
                const {progressPercent, fileSize} = data;
                updateTask.setProgressPercent(progressPercent);
                updateTask.setMessage(StringUtils.format(Strings.UPDATE_DOWNLOAD_PROGRESS,
                    Math.floor(fileSize*progressPercent/100),
                    fileSize));
            } else if(eventName === UPDATE_EVENT.INSTALLER_LOCATION) {
                installerLocation = data;
                Phoenix.app.registerQuitTimeAppUpdateHandler(quitTimeAppUpdateHandler);
            } else if(eventName === UPDATE_EVENT.LOG_ERROR) {
                logger.reportErrorMessage(data);
            }
        });
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
        // auto update is not added to help menu toggle as it will lead to install base version
        // fragmentation, and we don't want an android version fragment situation. By default, all platforms
        // are supported at latest version. User still has option to edit preferences manually to disable the auto
        // update option.
        PreferencesManager.definePreference(PREFS_AUTO_UPDATE, "boolean", true, {
            description: Strings.DESCRIPTION_AUTO_UPDATE
        });
        showOrHideUpdateIcon();
        _refreshUpdateStatus();
        const lastUpdateDetails = PreferencesManager.getViewState(KEY_LAST_UPDATE_DESCRIPTION);
        if(lastUpdateDetails && (lastUpdateDetails.updateVersion === Phoenix.metadata.apiVersion)) {
            let markdownHtml = marked.parse(lastUpdateDetails.releaseNotesMarkdown || "");
            Dialogs.showInfoDialog(Strings.UPDATE_WHATS_NEW, markdownHtml);
            PreferencesManager.setViewState(KEY_LAST_UPDATE_DESCRIPTION, null);
            PreferencesManager.setViewState(KEY_UPDATE_AVAILABLE, false);
            // hide the update available icon as we are showing what's new dialog. In edge cases, there can be an update
            // at this time if the user opened phcode after an update, but a new update was just published or the user
            // didn't open phcode after last update, which a new update was published.
            $("#update-notification").addClass("forced-hidden");
        }
        // check for updates at boot
        let lastUpdateCheckTime = PreferencesManager.getViewState(KEY_LAST_UPDATE_CHECK_TIME);
        const currentTime = Date.now();
        const oneDayInMilliseconds = 24 * 60 * 60 * 1000; // 24 hours * 60 minutes * 60 seconds * 1000 milliseconds
        if(lastUpdateCheckTime && ((currentTime - lastUpdateCheckTime) < oneDayInMilliseconds)){
            console.log("Skipping update check: last update check was within one day");
            return;
        }
        PreferencesManager.setViewState(KEY_LAST_UPDATE_CHECK_TIME, currentTime);
        checkForUpdates(true);
    });
});
