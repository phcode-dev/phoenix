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

define(function (require, exports, module) {
    const NotificationUI = require("widgets/NotificationUI"),
        Commands = require("command/Commands"),
        Strings = require("strings"),
        Menus = require("command/Menus"),
        StringUtils = require("utils/StringUtils"),
        KeyBindingManager = require("command/KeyBindingManager"),
        Metrics = require("utils/Metrics"),
        Dialogs = require("widgets/Dialogs"),
        Mustache = require("thirdparty/mustache/mustache"),
        PreferencesManager = require("preferences/PreferencesManager"),
        SurveyTemplate = require("text!./html/survey-template.html"),
        NOTIFICATION_BACKOFF = 10000,
        GUIDED_TOUR_LOCAL_STORAGE_KEY = "guidedTourActions";

    // All popup notifications will show immediately on boot, we don't want to interrupt user amidst his work
    // by showing it at a later point in time.
    const BOOT_DIALOG_DELAY = 2000,
        GENERAL_SURVEY_TIME = 600000, // 10 min
        ONE_MONTH_IN_DAYS = 30,
        POWER_USER_SURVEY_INTERVAL_DAYS = 35,
        USAGE_COUNTS_KEY    = "healthDataUsage"; // private to phoenix, set from health data extension

    const userAlreadyDidAction = PhStore.getItem(GUIDED_TOUR_LOCAL_STORAGE_KEY)
        ? JSON.parse(PhStore.getItem(GUIDED_TOUR_LOCAL_STORAGE_KEY)) : {
            version: 1,
            newProjectShown: false,
            beautifyCodeShown: false,
            generalSurveyShownVersion: 0
        };

    // we should only show one notification at a time
    let currentlyShowingNotification;

    /* Order of things in first boot now:
    *  1. First we show the popup in new project window to select default project - see the html in assets folder
    *  2. Then after user opens default project, we show "edit code for live preview popup"
    *  3. When user changes file by clicking on files panel, we show "click here to open new project window"
    *     this will continue showing every session until user clicks on the new project icon
    *  4. After about 2 minutes, the GitHub stars popup will show, if not shown in the past two weeks. Repeats 2 weeks.
    *  5. After about 3 minutes, the health popup will show up.
    *  6. power user survey shows up if the user has used brackets for 3 days or 8 hours in the last two weeks after 3
    *     minutes. This will not coincide with health popup due to the power user check.
    *  7. After about 10 minutes, survey shows up.
    *  // the rest are by user actions
    *  a. When user clicks on live preview, we show "click here to popout live preview"
    *  b. Beautification notification when user opened the editor context menu and have not done any beautification yet.
    * */

    // 3. Beautification notification when user opened the editor context menu for the first time
    function _showBeautifyNotification() {
        if(userAlreadyDidAction.beautifyCodeShown){
            return;
        }
        let editorContextMenu = Menus.getContextMenu(Menus.ContextMenuIds.EDITOR_MENU);
        function _showNotification() {
            if(currentlyShowingNotification){
                return;
            }
            setTimeout(()=>{
                let keyboardShortcut = KeyBindingManager.getKeyBindingsDisplay(Commands.EDIT_BEAUTIFY_CODE);
                keyboardShortcut = keyboardShortcut || "";
                userAlreadyDidAction.beautifyCodeShown =  true;
                PhStore.setItem(GUIDED_TOUR_LOCAL_STORAGE_KEY, JSON.stringify(userAlreadyDidAction));
                Metrics.countEvent(Metrics.EVENT_TYPE.UI, "guide", "beautify");
                currentlyShowingNotification = NotificationUI.createFromTemplate(
                    StringUtils.format(Strings.BEAUTIFY_CODE_NOTIFICATION, keyboardShortcut),
                    "editor-context-menu-edit.beautifyCode", {
                        allowedPlacements: ['left', 'right'],
                        autoCloseTimeS: 15,
                        dismissOnClick: true}
                );
                currentlyShowingNotification.done(()=>{
                    currentlyShowingNotification = null;
                });
                editorContextMenu.off(Menus.EVENT_BEFORE_CONTEXT_MENU_OPEN, _showNotification);
            }, 500);
        }
        editorContextMenu.on(Menus.EVENT_BEFORE_CONTEXT_MENU_OPEN, _showNotification);
    }

    // 3. When user changes file by clicking on files panel, we show "click here to open new project window"
    // Only shown once.
    function _showNewProjectNotification() {
        if(userAlreadyDidAction.newProjectShown){
            return;
        }
        if(currentlyShowingNotification){
            setTimeout(_showNewProjectNotification, NOTIFICATION_BACKOFF);
            return;
        }
        userAlreadyDidAction.newProjectShown =  true;
        PhStore.setItem(GUIDED_TOUR_LOCAL_STORAGE_KEY, JSON.stringify(userAlreadyDidAction));
        Metrics.countEvent(Metrics.EVENT_TYPE.UI, "guide", "newProj");
        currentlyShowingNotification = NotificationUI.createFromTemplate(Strings.NEW_PROJECT_NOTIFICATION,
            "newProject", {
                allowedPlacements: ['top', 'bottom'],
                autoCloseTimeS: 15,
                dismissOnClick: true}
        );
        currentlyShowingNotification.done(()=>{
            currentlyShowingNotification = null;
        });
    }

    function _loadTwitterScripts() {
        // https://developer.twitter.com/en/docs/twitter-for-websites/javascript-api/guides/javascript-api
        // we maily do this to metric the users who clicked on the tweet button
        if(window.twttr){
            return;
        }
        const twitterScript = document.createElement( 'script' );
        twitterScript.setAttribute( 'src', "https://platform.twitter.com/widgets.js" );
        document.body.appendChild( twitterScript );
        twitterScript.addEventListener("load", ()=>{
            if(!window.twttr){
                console.error("twitter scripts not loaded");
                return;
            }
            window.twttr.events.bind('click', function (ev) {
                Metrics.countEvent(Metrics.EVENT_TYPE.USER, "notify", "twit.click", 1);
                if(Phoenix.browser.isTauri) {
                    // hyperlinks wont work in tauri, so we have to use tauri apis
                    Phoenix.app.openURLInDefaultBrowser(
                        'https://twitter.com/intent/tweet?screen_name=phcodedev&ref_src=twsrc%5Etfw');
                }
            });
        });
    }

    function _openStarsPopup() {
        _loadTwitterScripts();
        let notification = $(`${Strings.GITHUB_STARS_POPUP}
                        <div class="gtstarph" style="display: flex;justify-content: space-around;margin-top: 6px;">
                            <a class="github-button"
                             href="https://github.com/phcode-dev/phoenix"
                             data-color-scheme="no-preference: dark; light: dark; dark: dark;"
                             data-icon="octicon-star"
                             data-size="large"
                             data-show-count="true"
                             title="Star phcode.dev on GitHub"
                             aria-label="Star phcode-dev/phoenix on GitHub">Star</a>
                           <script async defer src="https://buttons.github.io/buttons.js"></script>
                        </div>
                       ${Strings.GITHUB_STARS_POPUP_TWITTER}
                       <div class="twbnpop" style="display: flex;justify-content: space-around;margin-top: 6px;">
                            <a href="https://twitter.com/intent/tweet?screen_name=phcodedev&ref_src=twsrc%5Etfw"
                             class="twitter-mention-button"
                             data-size="large"
                             data-related="BracketsCont,brackets"
                             data-show-count="false">Tweet to @phcodedev</a>
                       </div>
                    </div>`);
        notification.find(".gtstarph").click(()=>{
            Metrics.countEvent(Metrics.EVENT_TYPE.USER, "notify", "star.click", 1);
            if(Phoenix.browser.isTauri) {
                // hyperlinks wont work in tauri, so we have to use tauri apis
                Phoenix.app.openURLInDefaultBrowser(
                    'https://github.com/phcode-dev/phoenix');
            }
        });
        NotificationUI.createToastFromTemplate(Strings.ENJOYING_APP, notification, {
            dismissOnClick: false
        });
    }

    function _showRequestStarsPopup() {
        if(Phoenix.firstBoot){
            // on first boot we don't show the `enjoying phoenix?` popup as user needs more time to evaluate.
            // GitHub stars/tweet situation isn't improving either. So we show this at the second launch so that we
            // the users like the product to revisit and then, every 30 days.
            return;
        }
        let lastShownDate = userAlreadyDidAction.lastShownGithubStarsDate;
        let nextShowDate = new Date(lastShownDate);
        nextShowDate.setUTCDate(nextShowDate.getUTCDate() + ONE_MONTH_IN_DAYS);
        let currentDate = new Date();
        if(!lastShownDate || currentDate >= nextShowDate){
            Metrics.countEvent(Metrics.EVENT_TYPE.USER, "notify", "star", 1);
            _openStarsPopup();
            userAlreadyDidAction.lastShownGithubStarsDate = Date.now();
            PhStore.setItem(GUIDED_TOUR_LOCAL_STORAGE_KEY, JSON.stringify(userAlreadyDidAction));
        }
    }

    function _showGeneralSurvey() {
        setTimeout(()=>{
            let surveyVersion = 6; // increment this if you want to show this again
            var templateVars = {
                Strings: Strings,
                surveyURL: "https://s.surveyplanet.com/g837j5k9"
            };
            if(userAlreadyDidAction.generalSurveyShownVersion !== surveyVersion){
                Metrics.countEvent(Metrics.EVENT_TYPE.USER, "survey", "generalShown", 1);
                Dialogs.showModalDialogUsingTemplate(Mustache.render(SurveyTemplate, templateVars));
                userAlreadyDidAction.generalSurveyShownVersion = surveyVersion;
                PhStore.setItem(GUIDED_TOUR_LOCAL_STORAGE_KEY, JSON.stringify(userAlreadyDidAction));
            }
        }, GENERAL_SURVEY_TIME);
    }

    // a power user is someone who has used Phoenix at least 3 days or 8 hours in the last two weeks
    function _isPowerUser() {
        let usageData = PreferencesManager.getViewState(USAGE_COUNTS_KEY) || {},
            dateKeys = Object.keys(usageData),
            dateBefore14Days = new Date(),
            totalUsageMinutes = 0,
            totalUsageDays = 0;
        dateBefore14Days.setUTCDate(dateBefore14Days.getUTCDate()-14);
        for(let dateKey of dateKeys){
            let date = new Date(dateKey);
            if(date >= dateBefore14Days) {
                totalUsageDays ++;
                totalUsageMinutes = totalUsageMinutes + usageData[dateKey];
            }
        }
        return totalUsageDays >= 3 || (totalUsageMinutes/60) >= 8;
    }

    function _showPowerUserSurvey() {
        if(_isPowerUser()) {
            Metrics.countEvent(Metrics.EVENT_TYPE.USER, "power", "user", 1);
            let lastShownDate = userAlreadyDidAction.lastShownPowerSurveyDate;
            let nextShowDate = new Date(lastShownDate);
            nextShowDate.setUTCDate(nextShowDate.getUTCDate() + POWER_USER_SURVEY_INTERVAL_DAYS);
            let currentDate = new Date();
            if(currentDate < nextShowDate){
                return;
            }
            setTimeout(()=>{
                Metrics.countEvent(Metrics.EVENT_TYPE.USER, "survey", "powerShown", 1);
                const templateVars = {
                    Strings: Strings,
                    surveyURL: "https://s.surveyplanet.com/2dgk0hbn"
                };
                Dialogs.showModalDialogUsingTemplate(Mustache.render(SurveyTemplate, templateVars));
                userAlreadyDidAction.lastShownPowerSurveyDate = Date.now();
                PhStore.setItem(GUIDED_TOUR_LOCAL_STORAGE_KEY, JSON.stringify(userAlreadyDidAction));
            }, BOOT_DIALOG_DELAY);
        }
    }

    let tourStarted = false;
    exports.startTourIfNeeded = function () {
        if(tourStarted) {
            return;
        }
        tourStarted = true;
        _showNewProjectNotification();
        _showBeautifyNotification();
        _showRequestStarsPopup();
        _showGeneralSurvey();
        _showPowerUserSurvey();
    };
});
