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
        Strings = brackets.getModule("strings");

    /* Order of things in first boot now:
    *  1. First we show the popup in new project window to select default project - see the html in asets folder
    *  2. Then after user opens default project, we show "edit code for live preview popup"
    *  3. We then wait for 30 seconds after above popup is dismissed and show "click here to open new project window"
    *  4. After about 3 minutes, the health popup will show up.
    *  5. When user clicks on live preview, we show "click here to popout live preview"
    * */

    function _showNewProjectNotification() {
        NotificationUI.createFromTemplate(Strings.NEW_PROJECT_NOTIFICATION,
            "newProject", {
                allowedPlacements: ['top', 'bottom'],
                autoCloseTimeS: 15,
                dismissOnClick: true}
        );
    }

    function _showLivePreviewTour() {
        NotificationUI.createFromTemplate(Strings.GUIDED_LIVE_PREVIEW,
            "main-toolbar", {
                allowedPlacements: ['left'],
                autoCloseTimeS: 15,
                dismissOnClick: true}
        ).done(()=>{
            setTimeout(_showNewProjectNotification, 30000);
        });
    }

    // When user clicks on live preview, we show "click here to popout live preview"
    function _showPopoutLivePreviewNotification() {
        ExtensionInterface.waitAndGetExtensionInterface(
            ExtensionInterface._DEFAULT_EXTENSIONS_INTERFACE_NAMES.PHOENIX_LIVE_PREVIEW).then((livePreviewExtension)=>{
            function _showNotification() {
                let notificationKey = 'livePreviewPopoutShown', version = "v1";
                let popoutMessageShown = localStorage.getItem(notificationKey);
                if(popoutMessageShown !== version
                    && WorkspaceManager.isPanelVisible(livePreviewExtension.LIVE_PREVIEW_PANEL_ID)){
                    NotificationUI.createFromTemplate(Strings.GUIDED_LIVE_PREVIEW_POPOUT,
                        "livePreviewPopoutButton", {
                            allowedPlacements: ['bottom'],
                            autoCloseTimeS: 15,
                            dismissOnClick: true}
                    );
                    localStorage.setItem(notificationKey, version);
                }
                LiveDevelopment.off(LiveDevelopment.EVENT_LIVE_PREVIEW_CLICKED, _showNotification);
            }
            LiveDevelopment.on(LiveDevelopment.EVENT_LIVE_PREVIEW_CLICKED, _showNotification);
        });
    }

    exports.startTourIfNeeded = function () {
        _showPopoutLivePreviewNotification();

        let newProjectNotificationShown = localStorage.getItem("newProjectNotificationShown");
        if(newProjectNotificationShown){
            return;
        }
        _showLivePreviewTour();
        localStorage.setItem("newProjectNotificationShown", "true");
    };
});
