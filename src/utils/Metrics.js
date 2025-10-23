/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2015 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global gtag, analytics, logger*/

/**
 * The Metrics API can be used to send analytics data to track feature usage in accordance with users privacy settings.
 *
 *`Status: Internal - Not to be used by third party extensions.`
 *
 * ### Import
 * @example
 * ```js
 * // usage within core:
 * const Metrics = require("utils/Metrics");
 *
 * // usage within default extensions:
 * const Metrics = brackets.getModule("utils/Metrics");
 * ```
 *
 * @module utils/Metrics
 */
define(function (require, exports, module) {
    const KernalModeTrust = window.KernalModeTrust;
    if(!KernalModeTrust){
        // integrated extensions will have access to kernal mode, but not external extensions
        throw new Error("Metrics should have access to KernalModeTrust. Cannot boot without trust ring");
    }

    const MAX_AUDIT_ENTRIES = 3000,
        ONE_DAY = 24 * 60* 60 * 1000;
    let initDone = false,
        disabled = false,
        loggedDataForAudit = new Map();

    let isFirstUseDay;
    let userID, isPowerUserFn, powerUserPrefix;
    let cachedIsPowerUser = false;

    function _setUserID() {
        const userIDKey = "phoenixUserPseudoID";
        userID = window.PhStore.getItem(userIDKey);
        if(!userID){
            userID = crypto.randomUUID();
            window.PhStore.setItem(userIDKey, userID);
        }
    }
    _setUserID();

    function _setFirstDayFlag() {
        const firstUseDayKey = "healthData.firstUseDay";
        let firstBootTime = window.PhStore.getItem(firstUseDayKey);
        if(!firstBootTime){
            firstBootTime = Date.now();
            window.PhStore.setItem(firstUseDayKey, firstBootTime);
        }
        let firstUseDay= new Date(firstBootTime);
        let dayAfterFirstUse = new Date(firstUseDay);
        dayAfterFirstUse.setUTCDate(firstUseDay.getUTCDate() + 1);
        let today = new Date();
        isFirstUseDay = today < dayAfterFirstUse;
        if(!isFirstUseDay){
            setTimeout(_setFirstDayFlag, ONE_DAY);
        }
    }
    _setFirstDayFlag();

    /**
     * This section outlines the properties and methods available in this module
     * @name API
     */

    /**
     * The Type of events that can be specified as an `eventType` in the API calls.
     *
     * ### Properties
     * `PLATFORM`, `PROJECT`, `THEMES`, `EXTENSIONS`, `EXTENSIONS`, `UI`, `UI_DIALOG`, `UI_BOTTOM_PANEL`,
     * `UI_SIDE_PANEL`, `LIVE_PREVIEW`, `CODE_HINTS`, `EDITOR`, `SEARCH`, `SHARING`, `PERFORMANCE`, `NEW_PROJECT`
     * `ERROR`, `USER`, `NODEJS`, `LINT`, `GIT`
     *
     * @typedef EVENT_TYPE
     * @type {Object}
     */
    const EVENT_TYPE = {
        PLATFORM: "platform",
        PROJECT: "project",
        THEMES: "themes",
        EXTENSIONS: "extensions",
        NOTIFICATIONS: "notifications",
        UI: "UI",
        UI_MENU: "UIMenu",
        UI_DIALOG: "ui-dialog",
        UI_BOTTOM_PANEL: "ui-bottomPanel",
        UI_SIDE_PANEL: "ui-sidePanel",
        UPDATES: "update",
        LIVE_PREVIEW: "live-preview",
        KEYBOARD: "keyboard",
        CODE_HINTS: "code-hints",
        EDITOR: "editor",
        QUICK_VIEW: "quickView",
        SEARCH: "search",
        SHARING: "sharing",
        PERFORMANCE: "performance",
        STORAGE: "storage",
        NEW_PROJECT: "new-project",
        ERROR: "error",
        USER: "user",
        NODEJS: "node",
        LINT: "lint",
        GIT: "git",
        AUTH: "auth",
        PRO: "pro"
    };

    /**
     * This is so that phoenix can starting as soon as the shims are inited. The events logged before init() will be
     * placed into a holding queue by ga and core analytics. When the lib is loaded and inited,
     * the events will be processed without any loss.
     * @private
     */
    function _createAnalyticsShims() {
        // for core analytics
        if(!window.analytics){ window.analytics = {
            _initData: [], loadStartTime: new Date().getTime(),
            event: function (){window.analytics._initData.push(arguments);}
        };}
        // for google analytics
        if(!Phoenix.isNativeApp) {
            // ga is not inpage in tauri builds. see below explanation in _initGoogleAnalytics
            window.dataLayer = window.dataLayer || [];
            window.gtag = function(){
                window.dataLayer.push(arguments);
                if(window.dataLayer.length > 500){
                    window.dataLayer.splice(0, 250); // remove half the elements(offline queue guard)
                }
            };
        }
    }

    _createAnalyticsShims();

    const MINUTES_10 = 10*1000;
    let tauriGaErrorCountSent = 0, sendOnceMore = false, noFurtherReporting = false;
    function _sendTauriGAEvent(analyticsID, customUserID, events=[]) {
        window.__TAURI__.event.emit("health", {
            analyticsID: analyticsID,
            customUserID: customUserID,
            events
        }).catch(err=>{
            if(window.debugMode){
                console.error(err);
            }
            if(noFurtherReporting){
                return;
            }
            // we only report 1 error once to prevent too many Bugsnag reports. We seen in bugsnag that like 2-3
            // users triggers thousands of this error in bugsnag report per day as they send continuous error reports
            // every minute due to this error. We throttle to send only 2 errors to bugsnag any minute at app level,
            // so this will starve other genuine errors as well if not captured here.
            tauriGaErrorCountSent ++;
            if(sendOnceMore){
                // we send the crash stack once and then another report 10 minutes later. After that, this is likeley
                // to fail always.
                noFurtherReporting = true;
                logger.reportError(err,
                    `${tauriGaErrorCountSent} _sendTauriGAEvent failures in ${MINUTES_10/1000} minutes`);
            }
            if(tauriGaErrorCountSent !== 1){
                return;
            }
            logger.reportError(err);
            setTimeout(()=>{
                sendOnceMore = true;
            }, MINUTES_10);
        });
    }

    let tauriGAEvents = new Map();

    function _sendGaEvent(eventAct, category, label, count) {
        if(Phoenix.isNativeApp) {
            const key = `${eventAct}:${category}:${label}}`;
            const existingEvent = tauriGAEvents.get(key);
            if(existingEvent) {
                existingEvent.count = (existingEvent.count||0) + count;
                return;
            }
            tauriGAEvents.set(key, {eventAct, category, label, count});
            return;
        }
        gtag('event', eventAct, {
            'event_category': category,
            'event_label': label,
            'value': count
        });
    }

    const TAURI_GA_EVENT_QUEUE_INTERVAL = 3000;
    function _sendQueuedTauriGAEvents() {
        _sendTauriGAEvent(brackets.config.googleAnalyticsIDDesktop, userID, Array.from(tauriGAEvents.values()));
        tauriGAEvents.clear();
    }

    function _initGoogleAnalytics() {
        // Load google analytics scripts
        if(Phoenix.isNativeApp) {
            // in tauri google analytics is in a hidden window instead of current page as ga only supports http and
            // https urls and not the tauri custom protocol urls. So we have a hidden window that loads ga from a
            // http(s) page which is usually `https://phcode.dev/desktop-metrics.html` or
            // "http://localhost:8000/src/metrics.html" for live dev builds in tauri.
            _sendTauriGAEvent(brackets.config.googleAnalyticsIDDesktop, userID);
            setInterval(_sendQueuedTauriGAEvents, TAURI_GA_EVENT_QUEUE_INTERVAL);
            return;
        }
        let script = document.createElement('script');
        script.type = 'text/javascript';
        script.async = true;
        script.onload = function(){
            gtag('js', new Date());

            // TODO use googleAnalyticsIDDesktop for desktop analytics
            gtag('config', brackets.config.googleAnalyticsID, {
                'page_title': 'Phoenix editor',
                'page_path': '/index.html',
                'page_location': window.location.origin
            });
        };
        script.src = 'https://www.googletagmanager.com/gtag/js?' + brackets.config.googleAnalyticsID;
        document.getElementsByTagName('head')[0].appendChild(script);
    }

    function _initCoreAnalytics() {
        // Load core analytics scripts
        let script = document.createElement('script');
        script.type = 'text/javascript';
        script.async = true;
        window.analytics.debugMode = window.debugMode;
        script.onload = function(){
            // replace `your_analytics_account_ID` and `appName` below with your values
            const appName = Phoenix.isNativeApp ?
                brackets.config.coreAnalyticsAppNameDesktop:
                brackets.config.coreAnalyticsAppName;
            window.initAnalyticsSession( brackets.config.coreAnalyticsID, appName);
            window.analytics.event("core-analytics", "client-lib", "loadTime", 1,
                (new Date().getTime())- window.analytics.loadStartTime);
        };
        script.src = 'https://unpkg.com/@aicore/core-analytics-client-lib/dist/analytics.min.js';
        document.getElementsByTagName('head')[0].appendChild(script);
    }

    async function _setPowerUserPrefix() {
        powerUserPrefix = null;
        const EntitlementsManager = KernalModeTrust.EntitlementsManager;
        if(cachedIsPowerUser){
            // A power user is someone who used Phoenix at least 3 days/8 hours in the last two weeks
            powerUserPrefix = "P";
        } else if(!isFirstUseDay){
            // A repeat user is a user who has used phoenix at least one other day before
            powerUserPrefix = "R";
        }
        if(EntitlementsManager.isLoggedIn()){
            if(await EntitlementsManager.isPaidSubscriber()){
                powerUserPrefix = "S"; // subscriber
                return;
            }
            powerUserPrefix = "L"; // logged in user
        }
    }

    /**
     * We are transitioning to our own analytics instead of google as we breached the free user threshold of google
     * and paid plans for GA starts at 100,000 USD.
     * @private
     */
    function init(initOptions = {}){
        if(initDone || window.testEnvironment){
            return;
        }
        _initGoogleAnalytics();
        _initCoreAnalytics();
        initDone = true;
        if (initOptions.isPowerUserFn) {
            isPowerUserFn = initOptions.isPowerUserFn;
            cachedIsPowerUser = isPowerUserFn();  // only call once to avoid heavy computations repeatedly
            _setPowerUserPrefix();
            setInterval(()=>{
                cachedIsPowerUser = isPowerUserFn();
                _setPowerUserPrefix();
            }, ONE_DAY);
        }
        KernalModeTrust.EntitlementsManager.on(KernalModeTrust.EntitlementsManager.EVENT_ENTITLEMENTS_CHANGED,
            _setPowerUserPrefix);
    }

    // some events generate too many ga events that ga can't handle. ignore them.
    const ignoredGAEvents = ['instantSearch'];
    function _sendToGoogleAnalytics(category, action, label, count) {
        // https://developers.google.com/analytics/devguides/collection/analyticsjs/events
        // TODO, see if we are sending too many events to ga, unlike core analytics, GA has a limit of
        //  1 Million events per month for free plan.
        if(disabled || window.testEnvironment){
            return;
        }
        category = category || "category";
        action = action || "action";
        if(!label){
            label = action;
        }
        if(!count){
            count = 1;
        }
        let eventAct = `${category}.${action}.${label}`;
        if(ignoredGAEvents.includes(action)){
            return;
        }
        _sendGaEvent(eventAct, category, label, count);
    }

    function _sendToCoreAnalytics(category, action, label, count, value) {
        // https://developers.google.com/analytics/devguides/collection/analyticsjs/events
        if(disabled || window.testEnvironment){
            return;
        }
        category = category || "category";
        action = action || "action";
        if(!label){
            label = action;
        }
        if(!value){
            value = 1;
        }
        analytics.event(category, action, label, count, value);
    }

    const AUDIT_TYPE_COUNT = "count",
        AUDIT_TYPE_VALUE = "val";
    function _logEventForAudit(eventType, eventCategory, eventSubCategory, val, type) {
        let defaultVal = {
            eventType: type,
            sum: 0,
            count: 0
        };
        let key = `${eventType}.${eventCategory}.${eventSubCategory}`;
        let newVal = loggedDataForAudit.get(key) || defaultVal;
        newVal.count = newVal.count + 1;
        newVal.sum = newVal.sum + val;
        loggedDataForAudit.set(key, newVal);
        if(loggedDataForAudit.size >= MAX_AUDIT_ENTRIES){
            const NUM_ENTRIES_TO_DELETE = 1000;
            let keys = Array.from(loggedDataForAudit.keys()).slice(0, NUM_ENTRIES_TO_DELETE);
            keys.forEach(k => loggedDataForAudit.delete(k));
        }
    }

    function _countEvent(eventType, eventCategory, eventSubCategory, count= 1) {
        _logEventForAudit(eventType, eventCategory, eventSubCategory, count, AUDIT_TYPE_COUNT);
        _sendToGoogleAnalytics(eventType, eventCategory, eventSubCategory, count);
        _sendToCoreAnalytics(eventType, eventCategory, eventSubCategory, count);
    }

    /**
     * log a numeric count >=0
     * To log that user clicked searchButton 5 times:
     * Metrics.countEvent(Metrics.EVENT_TYPE.UI, "searchButton", "click");
     * Metrics.countEvent(Metrics.EVENT_TYPE.UI, "searchButton", "click", 5);
     *
     * @param {EVENT_TYPE|string} eventType The kind of Event Type that needs to be logged- should be a js var compatible string.
     * Some standard event types are available as `EVENT_TYPE`.
     * @param {string} eventCategory The kind of Event Category that
     * needs to be logged- should be a js var compatible string
     * @param {string} eventSubCategory The kind of Event Sub Category that
     * needs to be logged- should be a js var compatible string
     * @param {number} [count=1] >=0 , optional, if not set defaults to 1
     * @type {function}
     */
    function countEvent(eventType, eventCategory, eventSubCategory, count= 1) {
        if(powerUserPrefix){
            // emit power user metrics too
            _countEvent(`${powerUserPrefix}-${eventType}`, eventCategory, eventSubCategory, count);
        }
        _countEvent(eventType, eventCategory, eventSubCategory, count);
    }

    function _valueEvent(eventType, eventCategory, eventSubCategory, value) {
        _logEventForAudit(eventType, eventCategory, eventSubCategory, value, AUDIT_TYPE_VALUE);
        _sendToGoogleAnalytics(eventType, eventCategory, eventSubCategory, value);
        _sendToCoreAnalytics(eventType, eventCategory, eventSubCategory, 1, value);
    }

    /**
     * log a numeric value (number).
     * To log that startup time is 200ms:
     * Metrics.valueEvent(Metrics.EVENT_TYPE.PERFORMANCE, "startupTime", "ms", 200);
     *
     * @param {EVENT_TYPE|string} eventType The kind of Event Type that needs to be logged- should be a js var compatible string.
     * some standard event types are available as `EVENT_TYPE`.
     * @param {string} eventCategory The kind of Event Category that
     * needs to be logged- should be a js var compatible string
     * @param {string} eventSubCategory The kind of Event Sub Category that
     * needs to be logged- should be a js var compatible string
     * @param {number} value
     * @type {function}
     */
    function valueEvent(eventType, eventCategory, eventSubCategory, value) {
        if(powerUserPrefix){
            // emit power user metrics too
            _valueEvent(`${powerUserPrefix}-${eventType}`, eventCategory, eventSubCategory, value);
        }
        _valueEvent(eventType, eventCategory, eventSubCategory, value);
    }

    function setDisabled(shouldDisable) {
        Phoenix._setHealthTrackingDisabled(shouldDisable);
        disabled = shouldDisable;
    }

    function isDisabled() {
        return disabled;
    }

    function getLoggedDataForAudit() {
        return loggedDataForAudit;
    }

    function clearAuditData() {
        loggedDataForAudit.clear();
    }

    /**
     * Send all pending metrics, useful before app quit.
     * Will never throw Error.
     */
    async function flushMetrics() {
        try{
            if(Phoenix.isNativeApp) {
                _sendQueuedTauriGAEvents();
            }
        } catch (e) {
            console.error("Error while flushMetrics: ", e);
        }
    }

    /**
     * Logs the performance time taken for a specific action.
     *
     * @param {string} action - The key representing the action being measured (e.g., 'startupTime').
     * @param {number} durationMs - The duration of the action in milliseconds.
     */
    function logPerformanceTime(action, durationMs) {
        valueEvent(EVENT_TYPE.PERFORMANCE, "ms", action, Number(durationMs));
    }

    /**
     * Get the range name for a given number.
     *
     * The function returns the first range that the number fits into, based on predefined ranges:
     * 0, 10, 25, 50, 100, 250, 500, 1000, 5000, 10000, and "10000+" for numbers exceeding 10000.
     *
     * @param {number} number - The number to determine the range for.
     * @returns {string} The range name that the number belongs to.
     */
    function getRangeName(number) {
        // Define the ranges
        const ranges = [0, 5, 10, 25, 50, 100, 250, 500, 1000, 5000, 10000];

        // Iterate through the ranges and return the first range that is greater than or equal to the number
        // small array, linear scan is most efficient than binary search in most cases comparing the overheads and
        // maintainability
        for (let i = 0; i < ranges.length; i++) {
            if (number <= ranges[i]) {
                return ""+ranges[i];
            }
        }

        // If the number exceeds the largest range, return "10000+"
        return "10000+";
    }

    /**
     * A power user is someone who has used Phoenix at least 3 days or 8 hours in the last two weeks
     * @returns {boolean}
     */
    function isPowerUser() {
        if(!isPowerUserFn) {
            throw new Error("PowerUser fn is not initialized in Metrics.");
        }
        return isPowerUserFn();
    }

    // Define public API
    exports.init               = init;
    exports.setDisabled        = setDisabled;
    exports.isDisabled         = isDisabled;
    exports.getLoggedDataForAudit      = getLoggedDataForAudit;
    exports.clearAuditData     = clearAuditData;
    exports.countEvent         = countEvent;
    exports.valueEvent         = valueEvent;
    exports.logPerformanceTime = logPerformanceTime;
    exports.flushMetrics       = flushMetrics;
    exports.getRangeName       = getRangeName;
    exports.isPowerUser        = isPowerUser;
    exports.EVENT_TYPE = EVENT_TYPE;
    exports.AUDIT_TYPE_COUNT = AUDIT_TYPE_COUNT;
    exports.AUDIT_TYPE_VALUE = AUDIT_TYPE_VALUE;
});
