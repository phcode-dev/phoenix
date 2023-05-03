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

/*global Phoenix*/
/*eslint no-console: 0*/
/*eslint strict: ["error", "global"]*/
/* jshint ignore:start */

define(function (require, exports, module) {
    const serverSync   = require("serverSync"),
        newProject   = require("new-project"),
        defaultProjects   = require("default-projects"),
        newFeature   = require("newly-added-features"),
        AppInit      = brackets.getModule("utils/AppInit"),
        Strings      = brackets.getModule("strings"),
        Dialogs      = brackets.getModule("widgets/Dialogs"),
        NotificationUI  = brackets.getModule("widgets/NotificationUI"),
        DefaultDialogs = brackets.getModule("widgets/DefaultDialogs");

    const PERSIST_STORAGE_DIALOG_DELAY_SECS = 60000;
    let $icon;

    function _addToolbarIcon() {
        const helpButtonID = "help-button";
        $icon = $("<a>")
            .attr({
                id: helpButtonID,
                href: "#",
                class: "help",
                title: Strings.CMD_SUPPORT
            })
            .appendTo($("#main-toolbar .bottom-buttons"));
        $icon.on('click', ()=>{
            window.open(brackets.config.support_url);
        });
    }
    function _showUnSupportedBrowserDialogue() {
        if(Phoenix.browser.isMobile || Phoenix.browser.isTablet){
            Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_ERROR,
                Strings.UNSUPPORTED_BROWSER_MOBILE_TITLE,
                Strings.UNSUPPORTED_BROWSER_MOBILE
            );
            return;
        }
        Dialogs.showModalDialog(
            DefaultDialogs.DIALOG_ID_ERROR,
            Strings.UNSUPPORTED_BROWSER_TITLE,
            Strings.UNSUPPORTED_BROWSER_MESSAGE
        );
        if (!("serviceWorker" in navigator)) {
            // service worker is required for phcode to work
            throw new Error("Service worker is not supported by the browser. Phcode cannot continue.");
        }
    }

    function _detectUnSupportedBrowser() {
        if(Phoenix.isTestWindow) {
            return;
        }
        if(!Phoenix.isSupportedBrowser){
            _showUnSupportedBrowserDialogue();
        }
        if(Phoenix.browser.desktop.isSafari || Phoenix.browser.mobile.isIos) {
            NotificationUI.createToastFromTemplate( Strings.ATTENTION_SAFARI_USERS,
                Strings.ATTENTION_SAFARI_USERS_MESSAGE, {
                    dismissOnClick: false,
                    toastStyle: NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.DANGER
                });
        }
    }

    async function _persistBrowserStorage() {
        if(navigator.storage && navigator.storage.persist){
            let isPersisted = await navigator.storage.persisted();
            console.log(`Browser Persisted storage granted?: ${isPersisted}`);
            setTimeout(async ()=>{
                if(!isPersisted){
                    console.log(`Browser Persisted storage requesting`);
                    isPersisted = await navigator.storage.persist();
                    console.log(`Browser Persisted storage granted?: ${isPersisted}`);
                }
            }, PERSIST_STORAGE_DIALOG_DELAY_SECS);
        } else {
            console.error("Browser does not support storage persistence APIs");
            _showUnSupportedBrowserDialogue();
        }
    }

    AppInit.appReady(function () {
        _addToolbarIcon();
        serverSync.init();
        defaultProjects.init();
        newProject.init();
        newFeature.init();
        _detectUnSupportedBrowser();
        _persistBrowserStorage();
    });
});
