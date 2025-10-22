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
    const NotificationUI = require("widgets/NotificationUI"),
        Commands = require("command/Commands"),
        Strings = require("strings"),
        Menus = require("command/Menus"),
        StringUtils = require("utils/StringUtils"),
        KeyBindingManager = require("command/KeyBindingManager"),
        Metrics = require("utils/Metrics"),
        Dialogs = require("widgets/Dialogs"),
        Mustache = require("thirdparty/mustache/mustache"),
        SurveyTemplate = require("text!./html/survey-template.html"),
        NOTIFICATION_BACKOFF = 10000,
        GUIDED_TOUR_LOCAL_STORAGE_KEY = "guidedTourActions";

    const surveyLinksURL = "https://updates.phcode.io/surveys.json";

    // All popup notifications will show immediately on boot, we don't want to interrupt user amidst his work
    // by showing it at a later point in time.
    const GENERAL_SURVEY_TIME = 1200000, // 20 min
        SURVEY_PRELOAD_DELAY = 10000, // 10 seconds to allow the survey to preload, but not
        // enough time to break user workflow
        POWER_USER_SURVEY_INTERVAL_DAYS = 35;

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
    *  4. After about 3 minutes, the health popup will show up.
    *  5. power user survey shows up if the user has used brackets for 3 days or 8 hours in the last two weeks after 3
    *     minutes. This will not coincide with health popup due to the power user check.
    *  6. After about 10 minutes, survey shows up.
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
                currentlyShowingNotification = NotificationUI.createFromTemplate( Strings.CMD_BEAUTIFY_CODE,
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
        currentlyShowingNotification = NotificationUI.createFromTemplate(
            Strings.START_PROJECT, Strings.NEW_PROJECT_NOTIFICATION,
            "newProject", {
                allowedPlacements: ['top', 'bottom'],
                autoCloseTimeS: 15,
                dismissOnClick: true}
        );
        currentlyShowingNotification.done(()=>{
            currentlyShowingNotification = null;
        });
    }

    function _showFirstUseSurvey(surveyURL, delayOverride, title,  useDialog) {
        let surveyVersion = 6; // increment this if you want to show this again
        if(userAlreadyDidAction.generalSurveyShownVersion === surveyVersion) {
            return;
        }
        let $surveyFrame;
        if(useDialog){
            $surveyFrame = addSurveyIframe(surveyURL);
        }
        setTimeout(()=>{
            if(useDialog){
                Metrics.countEvent(Metrics.EVENT_TYPE.USER, "survey", "firstDialog", 1);
                _showDialogSurvey($surveyFrame);
            } else {
                Metrics.countEvent(Metrics.EVENT_TYPE.USER, "survey", "firstNotification", 1);
                _showSurveyNotification(surveyURL, title);
            }
            userAlreadyDidAction.generalSurveyShownVersion = surveyVersion;
            PhStore.setItem(GUIDED_TOUR_LOCAL_STORAGE_KEY, JSON.stringify(userAlreadyDidAction));
        }, delayOverride || GENERAL_SURVEY_TIME);
    }

    function addSurveyIframe(surveyURL) {
        const $surveyFrame = $('<iframe>', {
            src: surveyURL,
            class: 'forced-hidden',
            css: {
                border: '0',
                position: 'absolute',
                top: 0,
                "z-index": 10000
            }
        });
        $('#alwaysHiddenElements').append($surveyFrame); // preload the survey to increase user responses.
        return $surveyFrame;
    }

    function repositionIframe($surveyFrame, $destContainer) {
        const container = $destContainer.offset();
        const height = $destContainer.outerHeight();
        const width = $destContainer.outerWidth();
        $surveyFrame.css({
            top: container.top + 'px',
            left: container.left + 'px',
            width: width + 'px',
            height: height + 'px',
            display: 'block'
        });
        $surveyFrame.removeClass("forced-hidden");
    }

    function observerPositionChanges($surveyFrame, $destContainer) {
        const resizeObserver = new ResizeObserver(function() {
            repositionIframe($surveyFrame, $destContainer);
        });
        resizeObserver.observe(document.body);
        return resizeObserver;
    }

    function _showDialogSurvey($surveyFrame) {
        const templateVars = {
            Strings: Strings
        };
        let positionObserver;
        Dialogs.showModalDialogUsingTemplate(Mustache.render(SurveyTemplate, templateVars))
            .done(()=>{
                positionObserver && positionObserver.disconnect();
                $surveyFrame.remove();
            });
        const $surveyFrameContainer = $('#surveyFrameContainer');
        setTimeout(()=>{
            repositionIframe($surveyFrame, $surveyFrameContainer);
            positionObserver = observerPositionChanges($surveyFrame, $surveyFrameContainer);
        }, 200);
    }

    function _showSurveyNotification(surveyUrl, title) {
        NotificationUI.createToastFromTemplate(
            title || Strings.SURVEY_TITLE_VOTE_FOR_FEATURES_YOU_WANT,
            `<div class="survey-notification-popup">
                    <iframe src="${surveyUrl}" style="width: 500px; height: 645px;" frameborder="0"></iframe></div>`, {
                toastStyle: `${NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.INFO} survey-notification-big forced-hidden`,
                dismissOnClick: false
            });
        setTimeout(()=>{
            $('.survey-notification-big').removeClass('forced-hidden');
        }, SURVEY_PRELOAD_DELAY);
    }

    function _showRepeatUserSurvey(surveyURL, intervalOverride, title, useDialog) {
        let nextPowerSurveyShowDate = userAlreadyDidAction.nextPowerSurveyShowDate;
        if(!nextPowerSurveyShowDate){
            // first boot, we schedule the power user survey to happen in two weeks
            let nextShowDate = new Date();
            nextShowDate.setUTCDate(nextShowDate.getUTCDate() + 14); // the first time repeat survey always shows up
            // always after 2 weeks.
            userAlreadyDidAction.nextPowerSurveyShowDate = nextShowDate.getTime();
            PhStore.setItem(GUIDED_TOUR_LOCAL_STORAGE_KEY, JSON.stringify(userAlreadyDidAction));
            return;
        }
        const intervalDays = intervalOverride || POWER_USER_SURVEY_INTERVAL_DAYS;
        let nextShowDate = new Date(nextPowerSurveyShowDate);
        let currentDate = new Date();
        if(currentDate < nextShowDate){
            return;
        }
        if(useDialog){
            const $surveyFrame = addSurveyIframe(surveyURL);
            setTimeout(()=>{
                Metrics.countEvent(Metrics.EVENT_TYPE.USER, "survey", "powerDialog", 1);
                _showDialogSurvey($surveyFrame);
            }, SURVEY_PRELOAD_DELAY);
        } else {
            Metrics.countEvent(Metrics.EVENT_TYPE.USER, "survey", "powerNotification", 1);
            _showSurveyNotification(surveyURL, title);
        }
        nextShowDate.setUTCDate(nextShowDate.getUTCDate() + intervalDays);
        userAlreadyDidAction.nextPowerSurveyShowDate = nextShowDate.getTime();
        PhStore.setItem(GUIDED_TOUR_LOCAL_STORAGE_KEY, JSON.stringify(userAlreadyDidAction));
    }

    async function _showSurveys() {
        try {
            if(!navigator.onLine){
                return;
            }
            let surveyJSON = await fetch(surveyLinksURL);
            surveyJSON = await surveyJSON.json();
            if(!Phoenix.isNativeApp && surveyJSON.browser) {
                surveyJSON = {
                    newUser: surveyJSON.browser.newUser || surveyJSON.newUser,
                    newUserTitle: surveyJSON.browser.newUserTitle || surveyJSON.newUserTitle,
                    newUserShowDelayMS: surveyJSON.browser.newUserShowDelayMS || surveyJSON.newUserShowDelayMS,
                    newUserUseDialog: surveyJSON.browser.newUserUseDialog || surveyJSON.newUserUseDialog,
                    powerUser: surveyJSON.browser.powerUser || surveyJSON.powerUser,
                    powerUserTitle: surveyJSON.browser.powerUserTitle || surveyJSON.powerUserTitle,
                    powerUserShowIntervalDays: surveyJSON.browser.powerUserShowIntervalDays
                        || surveyJSON.powerUserShowIntervalDays,
                    powerUserUseDialog: surveyJSON.browser.powerUserUseDialog || surveyJSON.powerUserUseDialog
                };
            }
            surveyJSON.newUser && _showFirstUseSurvey(surveyJSON.newUser, surveyJSON.newUserShowDelayMS,
                surveyJSON.newUserTitle, surveyJSON.newUserUseDialog);
            surveyJSON.powerUser && _showRepeatUserSurvey(surveyJSON.powerUser, surveyJSON.powerUserShowIntervalDays,
                surveyJSON.powerUserTitle, surveyJSON.powerUserUseDialog);
        } catch (e) {
            console.error("Error fetching survey link", surveyLinksURL, e);
            Metrics.countEvent(Metrics.EVENT_TYPE.USER, "survey", "fetchError", 1);
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
        _showSurveys();
    };
});
