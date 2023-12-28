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

/*global gtag, analytics, mixpanel*/

// @INCLUDE_IN_API_DOCS
/**
 * The Metrics API can be used to send analytics data to track feature usage in accordance with users privacy settings.
 *
 *`Status: Internal - Not to be used by third party extensions.`
 *
 * ### Import
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
    const MAX_AUDIT_ENTRIES = 3000,
        ONE_DAY = 24 * 60* 60 * 1000;
    let initDone = false,
        disabled = false,
        loggedDataForAudit = new Map();

    let isFirstUseDay;
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
    }
    _setFirstDayFlag();
    setInterval(_setFirstDayFlag, ONE_DAY);

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
     *
     * @typedef EVENT_TYPE
     * @type {Object}
     */
    const EVENT_TYPE = {
        PLATFORM: "phoenix.platform",
        PROJECT: "project",
        THEMES: "themes",
        EXTENSIONS: "extensions",
        NOTIFICATIONS: "notifications",
        UI: "phoenix.UI",
        UI_MENU: "phoenix.UIMenu",
        UI_DIALOG: "ui-dialog",
        UI_BOTTOM_PANEL: "ui-bottomPanel",
        UI_SIDE_PANEL: "ui-sidePanel",
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
        USER: "user"
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
        window.dataLayer = window.dataLayer || [];
        window.gtag = function(){window.dataLayer.push(arguments);};
    }

    _createAnalyticsShims();

    function _initGoogleAnalytics() {
        // Load google analytics scripts
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
            window.initAnalyticsSession( brackets.config.coreAnalyticsID,
                brackets.config.coreAnalyticsAppName);
            window.analytics.event("core-analytics", "client-lib", "loadTime", 1,
                (new Date().getTime())- window.analytics.loadStartTime);
        };
        script.src = 'https://unpkg.com/@aicore/core-analytics-client-lib/dist/analytics.min.js';
        document.getElementsByTagName('head')[0].appendChild(script);
    }

    /**
     * We are transitioning to our own analytics instead of google as we breached the free user threshold of google
     * and paid plans for GA starts at 100,000 USD.
     * @private
     */
    function init(){
        if(initDone || window.testEnvironment){
            return;
        }
        _initGoogleAnalytics();
        _initCoreAnalytics();
        initDone = true;
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
        gtag('event', eventAct, {
            'event_category': category,
            'event_label': label,
            'value': count
        });
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
     * @example <caption>To log that user clicked searchButton 5 times:</caption>
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
        if(!isFirstUseDay){
            // emit repeat user metrics too
            _countEvent(`R-${eventType}`, eventCategory, eventSubCategory, count);
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
     * @example <caption>To log that startup time is 200ms:</caption>
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
        if(!isFirstUseDay){
            // emit repeat user metrics too
            _valueEvent(`R-${eventType}`, eventCategory, eventSubCategory, value);
        }
        _valueEvent(eventType, eventCategory, eventSubCategory, value);
    }

    function setDisabled(shouldDisable) {
        disabled = shouldDisable;
    }

    function getLoggedDataForAudit() {
        return loggedDataForAudit;
    }

    function clearAuditData() {
        loggedDataForAudit.clear();
    }

    // Define public API
    exports.init               = init;
    exports.setDisabled        = setDisabled;
    exports.getLoggedDataForAudit      = getLoggedDataForAudit;
    exports.clearAuditData     = clearAuditData;
    exports.countEvent         = countEvent;
    exports.valueEvent         = valueEvent;
    exports.EVENT_TYPE = EVENT_TYPE;
    exports.AUDIT_TYPE_COUNT = AUDIT_TYPE_COUNT;
    exports.AUDIT_TYPE_VALUE = AUDIT_TYPE_VALUE;
});
