/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2015 - 2021 Adobe Systems Incorporated. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

/*global define, $, brackets, console, appshell , gtag, window, document, localStorage, Map, setTimeout*/
define(function (require, exports, module) {
    var AppInit             = brackets.getModule("utils/AppInit"),
        CommandManager      = brackets.getModule("command/CommandManager"),
        HealthLogger        = brackets.getModule("utils/HealthLogger"),
        PreferencesManager  = brackets.getModule("preferences/PreferencesManager"),
        UrlParams           = brackets.getModule("utils/UrlParams").UrlParams,
        Strings             = brackets.getModule("strings"),
        HealthDataUtils     = require("HealthDataUtils"),
        SendToAnalytics     = require("SendToAnalytics"),
        prefs               = PreferencesManager.getExtensionPrefs("healthData"),
        params              = new UrlParams(),
        ONE_SECOND          = 1000,
        ONE_MINUTE          = 60 * ONE_SECOND,
        FIVE_MINUTES        = 5 * ONE_MINUTE,
        ONE_HOUR            = 60 * ONE_MINUTE,
        FIRST_LAUNCH_SEND_DELAY = FIVE_MINUTES,
        timeoutVar,
        STATUS_UNINITIALIZED = 1,
        STATUS_INITIALIZED = 2,
        STATUS_LOADING = 3,
        gaInitStatus = STATUS_UNINITIALIZED,
        sentAnalyticsDataMap = new Map();

    prefs.definePreference("healthDataTracking", "boolean", true, {
        description: Strings.DESCRIPTION_HEALTH_DATA_TRACKING
    });

    function _initGoogleAnalytics() {
        if(gaInitStatus === STATUS_INITIALIZED || gaInitStatus === STATUS_LOADING){
            return;
        }

        gaInitStatus = STATUS_LOADING;

        // Load google analytics scripts
        let script = document.createElement('script');
        script.type = 'text/javascript';
        script.async = true;
        script.onerror = function() {
            gaInitStatus = STATUS_UNINITIALIZED;
        };
        script.onload = function(){
            window.dataLayer = window.dataLayer || [];
            window.gtag = function(){ window.dataLayer.push(arguments); };
            gtag('js', new Date());

            gtag('config', brackets.config.googleAnalyticsID, {
                'page_title': 'Phoenix editor',
                'page_path': '/index.html',
                'page_location': window.location.origin
            });

            gaInitStatus = STATUS_INITIALIZED;
        };
        script.src = 'https://www.googletagmanager.com/gtag/js?' + brackets.config.googleAnalyticsID;
        document.getElementsByTagName('head')[0].appendChild(script);
    }

    // Dont load google analytics at startup to unblock require sync load.
    window.setTimeout(_initGoogleAnalytics, ONE_SECOND);

    params.parse();

    /**
     * Get the Health Data which will be sent to the server. Initially it is only one time data.
     */
    function getHealthData() {
        var result = new $.Deferred(),
            oneTimeHealthData = {};

        oneTimeHealthData.snapshotTime = Date.now();
        oneTimeHealthData.os = brackets.platform;
        oneTimeHealthData.userAgent = window.navigator.userAgent;
        oneTimeHealthData.osLanguage = brackets.app.language;
        oneTimeHealthData.bracketsLanguage = brackets.getLocale();
        oneTimeHealthData.bracketsVersion = brackets.metadata.version;
        $.extend(oneTimeHealthData, HealthLogger.getAggregatedHealthData());
        HealthDataUtils.getUserInstalledExtensions()
            .done(function (userInstalledExtensions) {
                oneTimeHealthData.installedExtensions = userInstalledExtensions;
            })
            .always(function () {
                HealthDataUtils.getUserInstalledTheme()
                    .done(function (bracketsTheme) {
                        oneTimeHealthData.bracketsTheme = bracketsTheme;
                    })
                    .always(function () {
                        return result.resolve(oneTimeHealthData);
                    });

            });
        return result.promise();
    }

    /**
     * will return complete Analyics Data in Json Format
     */
    function getAnalyticsData() {
        return Array.from(sentAnalyticsDataMap.values());
    }

    /**
     * Send data to the server
     */
    function sendHealthDataToServer() {
        var result = new $.Deferred();

        getHealthData().done(function (healthData) {
            if(!window.gtag){
                return result.reject();
            }
            SendToAnalytics.sendHealthDataToGA(healthData);
            result.resolve();
        })
            .fail(function () {
                result.reject();
            });

        return result.promise();
    }

    /**
     * Send to google analytics
     * @param{Object} event Object containing Data to be sent to Server
     * {eventName, eventCategory, eventSubCategory, eventType, eventSubType}
     * @returns {*}
     */
    function sendAnalyticsDataToServer(event) {
        var result = new $.Deferred();
        if(!window.gtag){
            return result.reject();
        }

        sentAnalyticsDataMap.set(event.eventName, event);
        SendToAnalytics.sendEvent(event.eventCategory, event.eventSubCategory,
            (event.eventType || "default") + (event.eventSubType||""));
        return result.resolve();
    }

    /*
     * Check if the Health Data is to be sent to the server. If the user has enabled tracking, Health Data will be sent once every 24 hours.
     * Send Health Data to the server if the period is more than 24 hours.
     * We are sending the data as soon as the user launches brackets. The data will be sent to the server only after the notification dialog
     * for opt-out/in is closed.
     @param forceSend Flag for sending analytics data for testing purpose
     */
    function checkHealthDataSend(forceSend) {
        var result         = new $.Deferred(),
            isHDTracking   = prefs.get("healthDataTracking"),
            nextTimeToSend,
            currentTime;

        HealthLogger.setHealthLogsEnabled(isHDTracking);
        window.clearTimeout(timeoutVar);
        if (isHDTracking) {
            nextTimeToSend = PreferencesManager.getViewState("nextHealthDataSendTime");
            currentTime    = Date.now();

            // Never send data before FIRST_LAUNCH_SEND_DELAY has ellapsed on a fresh install. This gives the user time to read the notification
            // popup, learn more, and opt out if desired
            if (!nextTimeToSend) {
                nextTimeToSend = currentTime + FIRST_LAUNCH_SEND_DELAY;
                PreferencesManager.setViewState("nextHealthDataSendTime", nextTimeToSend);
                // don't return yet though - still want to set the timeout below
            }

            if (currentTime >= nextTimeToSend || forceSend) {
                // Bump up nextHealthDataSendTime at the begining of chaining to avoid any chance of sending data again before 24 hours, // e.g. if the server request fails or the code below crashes
                PreferencesManager.setViewState("nextHealthDataSendTime", currentTime + ONE_HOUR);
                sendHealthDataToServer().always(function() {
                    // We have already sent the health data, so can clear all health data
                    // Logged till now
                    HealthLogger.clearHealthData();
                    result.resolve();
                    timeoutVar = setTimeout(checkHealthDataSend, ONE_HOUR);
                });
            } else {
                timeoutVar = setTimeout(checkHealthDataSend, nextTimeToSend - currentTime);
                result.reject();
            }
        } else {
            result.reject();
        }

        return result.promise();
    }

    /**
     * Check if the Analytic Data is to be sent to the server.
     * If the user has enabled tracking, Analytic Data will be sent once per session
     * Send Analytic Data to the server if the Data associated with the given Event is not yet sent in this session.
     * We are sending the data as soon as the user triggers the event.
     * The data will be sent to the server only after the notification dialog
     * for opt-out/in is closed.
     * @param{Object} event event object
     * @param{Object} Eventparams Object containing Data to be sent to Server
     * {eventName, eventCategory, eventSubCategory, eventType, eventSubType}
     * @param{boolean} forceSend Flag for sending analytics data for testing purpose
     **/
    function checkAnalyticsDataSend(event, Eventparams, forceSend) {
        var result         = new $.Deferred(),
            isHDTracking   = prefs.get("healthDataTracking"),
            isEventDataAlreadySent;

        if (isHDTracking) {
            isEventDataAlreadySent = HealthLogger.analyticsEventMap.get(Eventparams.eventName);
            HealthLogger.analyticsEventMap.set(Eventparams.eventName, true);
            if (!isEventDataAlreadySent || forceSend) {
                sendAnalyticsDataToServer(Eventparams)
                    .done(function () {
                        HealthLogger.analyticsEventMap.set(Eventparams.eventName, true);
                        result.resolve();
                    }).fail(function () {
                        HealthLogger.analyticsEventMap.set(Eventparams.eventName, false);
                        result.reject();
                    });
            } else {
                result.reject();
            }
        } else {
            result.reject();
        }

        return result.promise();
    }

    /**
     * Map is used to make sure that we send an analytics event only once per 5 minutes
     **/

    function emptyAnalyticsMap() {
        HealthLogger.analyticsEventMap.clear();
        setTimeout(emptyAnalyticsMap, FIVE_MINUTES);
    }
    setTimeout(emptyAnalyticsMap, FIVE_MINUTES);

    // Expose a command to test data sending capability, but limit it to dev environment only
    CommandManager.register("Sends health data and Analytics data for testing purpose", "sendHealthData", function() {
        if (brackets.config.environment === "stage") {
            return checkHealthDataSend(true);
        }
        return $.Deferred().reject().promise();

    });

    prefs.on("change", "healthDataTracking", function () {
        checkHealthDataSend();
    });

    HealthLogger.on("SendAnalyticsData", checkAnalyticsDataSend);

    window.addEventListener("online", function () {
        checkHealthDataSend();
    });

    window.addEventListener("offline", function () {
        window.clearTimeout(timeoutVar);
    });

    AppInit.appReady(function () {
        checkHealthDataSend();
    });

    exports.getHealthData = getHealthData;
    exports.getAnalyticsData = getAnalyticsData;
    exports.checkHealthDataSend = checkHealthDataSend;
});
