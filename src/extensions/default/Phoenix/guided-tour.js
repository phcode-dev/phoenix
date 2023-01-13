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

define(function (require, exports, module) {
    const NotificationUI = brackets.getModule("widgets/NotificationUI"),
        LiveDevelopment  = brackets.getModule("LiveDevelopment/main"),
        ExtensionInterface = brackets.getModule("utils/ExtensionInterface"),
        WorkspaceManager = brackets.getModule("view/WorkspaceManager"),
        MainViewManager  = brackets.getModule("view/MainViewManager"),
        CommandManager = brackets.getModule("command/CommandManager"),
        Commands = brackets.getModule("command/Commands"),
        Strings = brackets.getModule("strings"),
        NOTIFICATION_BACKOFF = 10000,
        GUIDED_TOUR_LOCAL_STORAGE_KEY = "guidedTourActions";

    const userAlreadyDidAction = localStorage.getItem(GUIDED_TOUR_LOCAL_STORAGE_KEY)
        ? JSON.parse(localStorage.getItem(GUIDED_TOUR_LOCAL_STORAGE_KEY)) : {
            version: 1,
            clickedNewProjectIcon: false
        };

    // we should only show one notification at a time
    let currentlyShowingNotification;

    function _shouldContinueCommandTracking() {
        return (!userAlreadyDidAction.clickedNewProjectIcon); // use or ||
    }

    function _startCommandTracking() {
        if(!_shouldContinueCommandTracking){
            return;
        }
        function commandTracker(_event, commandID) {
            switch(commandID) {
            case Commands.FILE_NEW_PROJECT: userAlreadyDidAction.clickedNewProjectIcon = true;
                localStorage.setItem(GUIDED_TOUR_LOCAL_STORAGE_KEY, JSON.stringify(userAlreadyDidAction)); break;
            }
            if(!_shouldContinueCommandTracking()){
                CommandManager.off(CommandManager.EVENT_BEFORE_EXECUTE_COMMAND, commandTracker);
            }
        }
        CommandManager.on(CommandManager.EVENT_BEFORE_EXECUTE_COMMAND, commandTracker);
    }

    /* Order of things in first boot now:
    *  1. First we show the popup in new project window to select default project - see the html in assets folder
    *  2. Then after user opens default project, we show "edit code for live preview popup"
    *  3. When user changes file by clicking on files panel, we show "click here to open new project window"
    *     this will continue showing every session until user clicks on the new project icon
    *  4. After about 3 minutes, the health popup will show up.
    *  5. When user clicks on live preview, we show "click here to popout live preview"
    * */

    // 3. When user changes file by clicking on files panel, we show "click here to open new project window"
    // this will continue showing every session until user clicks on the new project icon
    function _showNewProjectNotification() {
        if(userAlreadyDidAction.clickedNewProjectIcon){
            return;
        }
        function _showNotification() {
            if(currentlyShowingNotification){
                return;
            }
            currentlyShowingNotification = NotificationUI.createFromTemplate(Strings.NEW_PROJECT_NOTIFICATION,
                "newProject", {
                    allowedPlacements: ['top', 'bottom'],
                    autoCloseTimeS: 15,
                    dismissOnClick: true}
            );
            currentlyShowingNotification.done(()=>{
                currentlyShowingNotification = null;
            });
            MainViewManager.off(MainViewManager.EVENT_CURRENT_FILE_CHANGE, _showNotification);
        }
        MainViewManager.on(MainViewManager.EVENT_CURRENT_FILE_CHANGE, _showNotification);
    }

    // 1. When user clicks on live preview, we show "click here to popout live preview". only shown once.
    function _showPopoutLivePreviewNotification() {
        ExtensionInterface.waitAndGetExtensionInterface(
            ExtensionInterface._DEFAULT_EXTENSIONS_INTERFACE_NAMES.PHOENIX_LIVE_PREVIEW).then((livePreviewExtension)=>{
            function _showNotification() {
                // legacy key. cant change without triggering the user base
                let notificationKey = 'livePreviewPopoutShown', version = "v1";
                let popoutMessageShown = localStorage.getItem(notificationKey);
                if(popoutMessageShown === version){
                    // already shown
                    LiveDevelopment.off(LiveDevelopment.EVENT_LIVE_PREVIEW_CLICKED, _showNotification);
                    return;
                }
                if(currentlyShowingNotification){
                    return;
                }
                if(WorkspaceManager.isPanelVisible(livePreviewExtension.LIVE_PREVIEW_PANEL_ID)){
                    currentlyShowingNotification = NotificationUI.createFromTemplate(Strings.GUIDED_LIVE_PREVIEW_POPOUT,
                        "livePreviewPopoutButton", {
                            allowedPlacements: ['bottom'],
                            autoCloseTimeS: 15,
                            dismissOnClick: true}
                    );
                    currentlyShowingNotification.done(()=>{
                        currentlyShowingNotification = null;
                    });
                    localStorage.setItem(notificationKey, version);
                }
                LiveDevelopment.off(LiveDevelopment.EVENT_LIVE_PREVIEW_CLICKED, _showNotification);
            }
            LiveDevelopment.on(LiveDevelopment.EVENT_LIVE_PREVIEW_CLICKED, _showNotification);
        });
    }

    // only shown once on first boot
    // order: 2. Then after user opens default project, we show "edit code for live preview popup"
    function _showLivePreviewNotification() {
        // legacy reasons live preview notification is called new project notification.
        const livePreviewNotificationKey = "newProjectNotificationShown";
        const livePreviewNotificationShown = localStorage.getItem(livePreviewNotificationKey);
        if(livePreviewNotificationShown){
            return;
        }
        if(currentlyShowingNotification){
            setTimeout(_showLivePreviewNotification, NOTIFICATION_BACKOFF);
            return;
        }
        currentlyShowingNotification = NotificationUI.createFromTemplate(Strings.GUIDED_LIVE_PREVIEW,
            "main-toolbar", {
                allowedPlacements: ['left'],
                autoCloseTimeS: 15,
                dismissOnClick: true}
        );
        localStorage.setItem(livePreviewNotificationKey, "true");
        currentlyShowingNotification.done(()=>{
            currentlyShowingNotification = null;
        });
    }

    exports.startTourIfNeeded = function () {
        _showLivePreviewNotification();
        _showPopoutLivePreviewNotification();
        _showNewProjectNotification();
        _startCommandTracking();
    };
});
