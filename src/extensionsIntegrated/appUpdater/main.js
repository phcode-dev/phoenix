define(function (require, exports, module) {
    const AppInit = require("utils/AppInit"),
        Commands = require("command/Commands"),
        CommandManager  = require("command/CommandManager"),
        Menus = require("command/Menus"),
        Dialogs = require("widgets/Dialogs"),
        DefaultDialogs  = require("widgets/DefaultDialogs"),
        Strings     = require("strings"),
        marked = require('thirdparty/marked.min'),
        semver = require("thirdparty/semver.browser"),
        PreferencesManager  = require("preferences/PreferencesManager");

    const KEY_LAST_UPDATE_CHECK_TIME = "PH_LAST_UPDATE_CHECK_TIME",
        KEY_UPDATE_AVAILABLE = "PH_UPDATE_AVAILABLE";

    function showOrHideUpdateIcon() {
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

    async function doUpdate() {
        const windowCount = await Phoenix.app.getPhoenixInstanceCount();
        if(windowCount !== 1){
            PreferencesManager.setViewState(KEY_UPDATE_AVAILABLE, true);
            Dialogs.showInfoDialog(Strings.UPDATE_CLOSE_TO_UPDATE_TITLE, Strings.UPDATE_CLOSE_TO_UPDATE);
            return;
        }
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
            downloadURL: null,
            currentVersion: Phoenix.metadata.apiVersion,
            updateVersion: null,
            releaseNotesMarkdown: null,
            updatePlatform: updatePlatformKey
        };
        try{
            const updateMetadata = await fetchJSON(brackets.config.app_update_url);
            if(semver.gt(updateMetadata.version, Phoenix.metadata.apiVersion)){
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
            console.error("Error getting update metadata");
        }
        return updateDetails;
    }

    async function checkForUpdates(isAutoUpdate) {
        showOrHideUpdateIcon();
        const updateDetails = await getUpdateDetails();
        if(!updateDetails.shouldUpdate){
            (!isAutoUpdate) && Dialogs.showInfoDialog(Strings.UPDATE_NOT_AVAILABLE_TITLE, Strings.UPDATE_UP_TO_DATE);
            return;
        }
        const buttons = [
            { className: Dialogs .DIALOG_BTN_CLASS_NORMAL, id: Dialogs .DIALOG_BTN_CANCEL, text: Strings.UPDATE_LATER },
            { className: Dialogs .DIALOG_BTN_CLASS_PRIMARY, id: Dialogs .DIALOG_BTN_OK, text: Strings.GET_IT_NOW }
        ];
        let markdownHtml = marked.parse(updateDetails.releaseNotesMarkdown);
        Dialogs.showModalDialog(DefaultDialogs.DIALOG_ID_INFO, Strings.UPDATE_AVAILABLE_TITLE, markdownHtml, buttons)
            .done(option=>{
                if(option === Dialogs.DIALOG_BTN_OK){
                    doUpdate();
                }
            });
    }

    AppInit.appReady(function () {
        if(!Phoenix.browser.isTauri || Phoenix.isTestWindow) {
            // app updates are only for desktop builds
            return;
        }
        $("#update-notification").click(()=>{
            checkForUpdates();
        });
        const commandID = Commands.HELP_CHECK_UPDATES || "help.checkUpdates";// todo remove this line after dev
        CommandManager.register(Strings.CMD_CHECK_FOR_UPDATE, commandID, ()=>{
            checkForUpdates();
        });
        const helpMenu = Menus.getMenu(Menus.AppMenuBar.HELP_MENU);
        helpMenu.addMenuItem(commandID, "", Menus.AFTER, Commands.HELP_GET_INVOLVED);
        showOrHideUpdateIcon();
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
        checkForUpdates(true);
    });
});
