/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2018 - 2021 Adobe Systems Incorporated. All rights reserved.
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
/**
 *  module for displaying in-app banner notifications
 *
 */
define(function (require, exports, module) {

    const AppInit              = require("utils/AppInit"),
        PreferencesManager   = require("preferences/PreferencesManager"),
        ExtensionUtils       = require("utils/ExtensionUtils"),
        Metrics = require("utils/Metrics"),
        semver = require("thirdparty/semver.browser"),
        NotificationBarHtml  = require("text!./htmlContent/notificationContainer.html");

    ExtensionUtils.loadStyleSheet(module, "styles/styles.css");

    let latestBannerJSON;
    let customFilterCallback;

    // duration of one day in milliseconds
    const ONE_DAY = 1000 * 60 * 60 * 24;
    const IN_APP_NOTIFICATIONS_BANNER_SHOWN_STATE = "InAppNotificationsBannerShown";
    const NOTIFICATION_ACK_CLASS = "notification_ack";

    // Init default last notification number
    PreferencesManager.stateManager.definePreference(IN_APP_NOTIFICATIONS_BANNER_SHOWN_STATE,
        "object", {});

    function _isValidForThisVersion(versionFilter) {
        return semver.satisfies(brackets.metadata.apiVersion, versionFilter);
    }

    // platformFilter is a string subset of
    // "mac,win,linux,allDesktop,firefox,chrome,safari,allBrowser,all"
    function _isValidForThisPlatform(platformFilter) {
        platformFilter = platformFilter.split(",");
        if(platformFilter.includes("all")
            || (platformFilter.includes(brackets.platform) && Phoenix.isNativeApp) // win linux and mac is only for tauri and not for browser in platform
            || (platformFilter.includes("allDesktop") && Phoenix.isNativeApp)
            || (platformFilter.includes("firefox") && Phoenix.browser.desktop.isFirefox && !Phoenix.isNativeApp)
            || (platformFilter.includes("chrome") && Phoenix.browser.desktop.isChromeBased && !Phoenix.isNativeApp)
            || (platformFilter.includes("safari") && Phoenix.browser.desktop.isSafari && !Phoenix.isNativeApp)
            || (platformFilter.includes("allBrowser") && !Phoenix.isNativeApp)){
            return true;
        }
        return false;
    }

    /**
     * Registers a custom filter callback function for notifications
     * @param {Function} cfbn - async function that filters notifications
     */
    function registerCustomFilter(cfbn) {
        customFilterCallback = cfbn;
    }

    /**
     * If there are multiple notifications, thew will be shown one after the other and not all at once.
     * A sample notifications is as follows:
     * {
     *   "SAMPLE_NOTIFICATION_NAME": {
     *     "DANGER_SHOW_ON_EVERY_BOOT" : false,
     *     "HTML_CONTENT": "<div>hello world <a class='notification_ack'>Click to acknowledge.</a></div>",
     *     "FOR_VERSIONS": "1.x || >=2.5.0 || 5.0.0 - 7.2.3",
     *     "PLATFORM" : "allDesktop"
     *   },
     *   "ANOTHER_SAMPLE_NOTIFICATION_NAME": {etc}
     * }
     *  By default, a notification is shown only once except if `DANGER_SHOW_ON_EVERY_BOOT` is set
     *  or there is an html element with class `notification_ack`.
     *
     * 1. `SAMPLE_NOTIFICATION_NAME` : This is a unique ID. It is used to check if the notification was shown to user.
     * 2. `DANGER_SHOW_ON_EVERY_BOOT` : (Default false) Setting this to true will cause the
     *    notification to be shown on every boot. This is bad ux and only be used if there is a critical security issue
     *    that we want the version not to be used.
     * 3. `HTML_CONTENT`: The actual html content to show to the user. It can have an optional `notification_ack` class.
     *     Setting this class will cause the notification to be shown once a day until the user explicitly clicks
     *     on any html element with class `notification_ack` or explicitly click the close button.
     *     If such a class is not present, then the notification is shown only once ever.
     * 4. `FOR_VERSIONS` : [Semver compatible version filter](https://www.npmjs.com/package/semver).
     *     The notification will be shown to all versions satisfying this.
     * 5. `PLATFORM`: A comma seperated list of all platforms in which the message will be shown.
     *     allowed values are: `mac,win,linux,allDesktop,firefox,chrome,safari,allBrowser,all`
     * @param notifications
     * @returns {false|*}
     * @private
     */
    async function _renderNotifications(notifications) {
        if(!notifications) {
            return; // nothing to show here
        }

        const _InAppBannerShownAndDone = PreferencesManager.getViewState(
            IN_APP_NOTIFICATIONS_BANNER_SHOWN_STATE);

        for(const notificationID of Object.keys(notifications)){
            if(!_InAppBannerShownAndDone[notificationID]) {
                const notification = notifications[notificationID];
                if(!_isValidForThisVersion(notification.FOR_VERSIONS)){
                    continue;
                }
                if(!_isValidForThisPlatform(notification.PLATFORM)){
                    continue;
                }
                if(customFilterCallback && !(await customFilterCallback(notification, notificationID))){
                    continue;
                }
                if(!notification.DANGER_SHOW_ON_EVERY_BOOT){
                    // One time notification. mark as shown and never show again
                    // all notifications are one time, we track metrics for each notification separately
                    _markAsShownAndDone(notificationID);
                }
                await showBannerAndWaitForDismiss(notification.HTML_CONTENT, notificationID);
            }
        }
    }

    function _markAsShownAndDone(notificationID) {
        const _InAppBannersShownAndDone = PreferencesManager.getViewState(IN_APP_NOTIFICATIONS_BANNER_SHOWN_STATE);
        _InAppBannersShownAndDone[notificationID] = true;
        PreferencesManager.setViewState(IN_APP_NOTIFICATIONS_BANNER_SHOWN_STATE,
            _InAppBannersShownAndDone);
    }

    function fetchJSON(url) {
        return fetch(url)
            .then(response => {
                if (!response.ok) {
                    return null;
                }
                return response.json();
            })
            .then(json => {
                if (json !== null) {
                    latestBannerJSON = json;
                }
                return json;
            });
    }

    let inProgress = false;
    function _fetchAndRenderNotifications() {
        if(inProgress){
            return;
        }
        inProgress = true;
        const locale = brackets.getLocale(); // en-US default
        const fetchURL = `${brackets.config.app_notification_url}${locale}/banner.json`;
        const defaultFetchURL = `${brackets.config.app_notification_url}root/banner.json`;
        // Fetch data from fetchURL first
        fetchJSON(fetchURL)
            .then(fetchedJSON => {
                // Check if fetchedJSON is empty or undefined
                if (fetchedJSON === null) {
                    // Fetch data from defaultFetchURL if fetchURL didn't provide data
                    return fetchJSON(defaultFetchURL);
                }
                return fetchedJSON;
            })
            .then(_renderNotifications) // Call the render function with the fetched JSON data
            .catch(error => {
                console.error(`Error fetching and rendering banner.json`, error);
            })
            .finally(()=>{
                inProgress = false;
            });
    }

    /**
     * Re-renders notifications using the latest cached banner JSON
     */
    function reRenderNotifications() {
        if(latestBannerJSON) {
            _renderNotifications(latestBannerJSON);
        }
    }


    /**
     * Removes and cleans up the notification bar from DOM
     */
    function cleanNotificationBanner() {
        const $notificationBar = $('#notification-bar');
        if ($notificationBar.length > 0) {
            $notificationBar.remove();
        }
    }

    /**
     * Displays the Notification Bar UI
     *
     */
    async function showBannerAndWaitForDismiss(htmlStr, notificationID) {
        let resolved = false;
        return new Promise((resolve)=>{
            const $htmlContent = $(`<div class="banner-notif-container">${htmlStr}</div>`),
                $notificationBarElement = $(NotificationBarHtml);

            // Remove any SCRIPT tag to avoid secuirity issues
            $htmlContent.find('script').remove();

            // Remove any STYLE tag to avoid styling impact on Brackets DOM
            $htmlContent.find('style').remove();

            cleanNotificationBanner(); //Remove an already existing notification bar, if any
            $notificationBarElement.prependTo(".content");

            var $notificationBar = $('#notification-bar'),
                $notificationContent = $notificationBar.find('.content-container'),
                $closeIcon = $notificationBar.find('.close-icon');

            $notificationContent.append($htmlContent);
            Metrics.countEvent(Metrics.EVENT_TYPE.NOTIFICATIONS, "banner-shown", notificationID);

            // Click handlers on actionable elements
            if ($closeIcon.length > 0) {
                $closeIcon.click(function () {
                    cleanNotificationBanner();
                    Metrics.countEvent(Metrics.EVENT_TYPE.NOTIFICATIONS, "banner-close", notificationID);
                    !resolved && resolve($htmlContent);
                    resolved = true;
                });
            }

            $notificationBar.find(`.${NOTIFICATION_ACK_CLASS}`).click(function() {
                cleanNotificationBanner();
                Metrics.countEvent(Metrics.EVENT_TYPE.NOTIFICATIONS, "banner-ack", notificationID);
                !resolved && resolve($htmlContent);
                resolved = true;
            });
        });
    }


    AppInit.appReady(function () {
        if(Phoenix.isTestWindow) {
            return;
        }
        _fetchAndRenderNotifications();
        setInterval(_fetchAndRenderNotifications, ONE_DAY);
    });

    exports.registerCustomFilter = registerCustomFilter;
    exports.reRenderNotifications = reRenderNotifications;

    if(Phoenix.isTestWindow){
        exports.cleanNotificationBanner = cleanNotificationBanner;
        exports._renderNotifications = _renderNotifications;
        exports._setBannerCache = function(notifications) {
            latestBannerJSON = notifications;
        };
    }
});
