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
        Menus = brackets.getModule("command/Menus"),
        StringUtils = brackets.getModule("utils/StringUtils"),
        KeyBindingManager = brackets.getModule("command/KeyBindingManager"),
        Metrics = brackets.getModule("utils/Metrics"),
        Dialogs = brackets.getModule("widgets/Dialogs"),
        Mustache = brackets.getModule("thirdparty/mustache/mustache"),
        PreferencesManager = brackets.getModule("preferences/PreferencesManager"),
        SurveyTemplate = require("text!html/survey-template.html"),
        NOTIFICATION_BACKOFF = 10000,
        GUIDED_TOUR_LOCAL_STORAGE_KEY = "guidedTourActions";

    const GITHUB_STARS_POPUP_TIME = 120000, // 2 min
        POWER_USER_SURVEY_TIME = 180000, // 3 min
        GENERAL_SURVEY_TIME = 600000, // 10 min
        TWO_WEEKS_IN_DAYS = 14,
        USAGE_COUNTS_KEY    = "healthDataUsage"; // private to phoenix, set from health data extension

    const userAlreadyDidAction = localStorage.getItem(GUIDED_TOUR_LOCAL_STORAGE_KEY)
        ? JSON.parse(localStorage.getItem(GUIDED_TOUR_LOCAL_STORAGE_KEY)) : {
            version: 1,
            clickedNewProjectIcon: false,
            beautifyCodeShown: false,
            generalSurveyShownVersion: 0
        };

    // we should only show one notification at a time
    let currentlyShowingNotification;

    function _shouldContinueCommandTracking() {
        return (!userAlreadyDidAction.clickedNewProjectIcon); // use or ||
    }

    function _startCommandTracking() {
        if(!_shouldContinueCommandTracking()){
            return;
        }
        function commandTracker(_event, commandID) {
            let write = false;
            switch(commandID) {
            case Commands.FILE_NEW_PROJECT: userAlreadyDidAction.clickedNewProjectIcon = true; write = true; break;
            }
            if(write){
                localStorage.setItem(GUIDED_TOUR_LOCAL_STORAGE_KEY, JSON.stringify(userAlreadyDidAction));
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
                let keyboardShortcut = KeyBindingManager.getKeyBindings(Commands.EDIT_BEAUTIFY_CODE);
                keyboardShortcut = (keyboardShortcut && keyboardShortcut[0]) ? keyboardShortcut[0].displayKey : "-";
                userAlreadyDidAction.beautifyCodeShown =  true;
                localStorage.setItem(GUIDED_TOUR_LOCAL_STORAGE_KEY, JSON.stringify(userAlreadyDidAction));
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
    // this will continue showing every session until user clicks on the new project icon
    function _showNewProjectNotification() {
        if(userAlreadyDidAction.clickedNewProjectIcon){
            return;
        }
        function _showNotification() {
            if(currentlyShowingNotification){
                return;
            }
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
                    Metrics.countEvent(Metrics.EVENT_TYPE.UI, "guide", "lp_popout");
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
        });
        NotificationUI.createToastFromTemplate(Strings.ENJOYING_APP, notification, {
            dismissOnClick: false
        });
    }

    function _showRequestStarsPopup() {
        let lastShownDate = userAlreadyDidAction.lastShownGithubStarsDate;
        let nextShowDate = new Date(lastShownDate);
        nextShowDate.setDate(nextShowDate.getDate() + TWO_WEEKS_IN_DAYS);
        let currentDate = new Date();
        if(!lastShownDate || currentDate >= nextShowDate){
            setTimeout(()=>{
                Metrics.countEvent(Metrics.EVENT_TYPE.USER, "notify", "star", 1);
                _openStarsPopup();
                userAlreadyDidAction.lastShownGithubStarsDate = Date.now();
                localStorage.setItem(GUIDED_TOUR_LOCAL_STORAGE_KEY, JSON.stringify(userAlreadyDidAction));
            }, GITHUB_STARS_POPUP_TIME);
        }
    }

    function _showGeneralSurvey() {
        setTimeout(()=>{
            let surveyVersion = 5; // increment this if you want to show this again
            var templateVars = {
                Strings: Strings,
                surveyURL: "https://s.surveyplanet.com/6208d1eccd51c561fc8e59ca"
            };
            if(userAlreadyDidAction.generalSurveyShownVersion !== surveyVersion){
                Metrics.countEvent(Metrics.EVENT_TYPE.USER, "survey", "generalShown", 1);
                Dialogs.showModalDialogUsingTemplate(Mustache.render(SurveyTemplate, templateVars));
                userAlreadyDidAction.generalSurveyShownVersion = surveyVersion;
                localStorage.setItem(GUIDED_TOUR_LOCAL_STORAGE_KEY, JSON.stringify(userAlreadyDidAction));
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
        dateBefore14Days.setDate(dateBefore14Days.getDate()-14);
        for(let dateKey of dateKeys){
            let date = new Date(dateKey);
            if(date >= dateBefore14Days) {
                totalUsageDays ++;
                totalUsageMinutes = totalUsageMinutes + usageData[dateKey];
            }
        }
        return totalUsageDays >= 3 || (totalUsageMinutes/60) >= 8;
    }

    function _openPowerUserSurvey() {
        Metrics.countEvent(Metrics.EVENT_TYPE.USER, "survey", "powerShown", 1);
        const templateVars = {
            Strings: Strings,
            surveyURL: "https://s.surveyplanet.com/2dgk0hbn"
        };
        Dialogs.showModalDialogUsingTemplate(Mustache.render(SurveyTemplate, templateVars));
    }

    function _showPowerUserSurvey() {
        if(_isPowerUser()) {
            Metrics.countEvent(Metrics.EVENT_TYPE.USER, "power", "user", 1);
            let lastShownDate = userAlreadyDidAction.lastShownPowerSurveyDate;
            let nextShowDate = new Date(lastShownDate);
            nextShowDate.setDate(nextShowDate.getDate() + TWO_WEEKS_IN_DAYS);
            let currentDate = new Date();
            if(currentDate < nextShowDate){
                return;
            }
            setTimeout(()=>{
                Metrics.countEvent(Metrics.EVENT_TYPE.USER, "notify", "powerSurvey", 1);
                let $content = $(Strings.POWER_USER_POPUP_TEXT);
                $content.find("a").click(_openPowerUserSurvey);
                NotificationUI.createToastFromTemplate(Strings.POWER_USER_POPUP_TITLE, $content);
                userAlreadyDidAction.lastShownPowerSurveyDate = Date.now();
                localStorage.setItem(GUIDED_TOUR_LOCAL_STORAGE_KEY, JSON.stringify(userAlreadyDidAction));
            }, POWER_USER_SURVEY_TIME);
        }
    }

    let tourStarted = false;
    exports.startTourIfNeeded = function () {
        if(tourStarted) {
            return;
        }
        tourStarted = true;
        _showLivePreviewNotification();
        _showPopoutLivePreviewNotification();
        _showNewProjectNotification();
        _startCommandTracking();
        _showBeautifyNotification();
        _showRequestStarsPopup();
        _showGeneralSurvey();
        _showPowerUserSurvey();
    };
});
