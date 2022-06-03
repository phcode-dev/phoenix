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

/**
 *  Utilities functions related to Health Data logging
 */
/*global gtag, analytics*/
define(function (require, exports, module) {
    const MAX_AUDIT_ENTRIES = 3000;
    let initDone = false,
        disabled = false,
        loggedDataForAudit = new Map();

    function _initGoogleAnalytics() {
        // Load google analytics scripts
        let script = document.createElement('script');
        script.type = 'text/javascript';
        script.async = true;
        script.onload = function(){
            window.dataLayer = window.dataLayer || [];
            window.gtag = function(){window.dataLayer.push(arguments);};
            gtag('js', new Date());

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
        if(!window.analytics){ window.analytics = {
            _initData: [], loadStartTime: new Date().getTime(),
            event: function (){window.analytics._initData.push(arguments);}
        };}
        let script = document.createElement('script');
        script.type = 'text/javascript';
        script.async = true;
        window.analytics.debugMode = window.debugModeLogs;
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
        if(initDone){
            return;
        }
        _initGoogleAnalytics();
        _initCoreAnalytics();
        initDone = true;
    }

    function _sendToGoogleAnalytics(category, action, label, value) {
        // https://developers.google.com/analytics/devguides/collection/analyticsjs/events
        if(disabled){
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
        let eventAct = `${action}.${category}.${label}`;
        gtag('event', eventAct, {
            'event_category': category,
            'event_label': label,
            'value': value
        });
    }

    function _sendToCoreAnalytics(category, action, label, count, value) {
        // https://developers.google.com/analytics/devguides/collection/analyticsjs/events
        if(disabled){
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

    function _logEventForAudit(eventType, eventCategory, eventSubCategory, val) {
        let key = `${eventType}.${eventCategory}.${eventSubCategory}`;
        let newVal = (loggedDataForAudit.get(key) || 0) + val;
        loggedDataForAudit.set(key, newVal);
        if(loggedDataForAudit.size >= MAX_AUDIT_ENTRIES){
            const NUM_ENTRIES_TO_DELETE = 1000;
            let keys = Array.from(loggedDataForAudit.keys()).slice(0, NUM_ENTRIES_TO_DELETE);
            keys.forEach(k => loggedDataForAudit.delete(k));
        }
    }

    /**
     * log a numeric count >=0
     * @param {string} eventType The kind of Event Type that needs to be logged- should be a js var compatible string
     * @param {string} eventCategory The kind of Event Category that
     * needs to be logged- should be a js var compatible string
     * @param {string} eventSubCategory The kind of Event Sub Category that
     * needs to be logged- should be a js var compatible string
     * @param {number} count >=0
     */
    function countEvent(eventType, eventCategory, eventSubCategory, count) {
        _logEventForAudit(eventType, eventCategory, eventSubCategory, count);
        _sendToGoogleAnalytics(eventType, eventCategory, eventSubCategory, count);
        _sendToCoreAnalytics(eventType, eventCategory, eventSubCategory, count);
    }

    /**
     * log a numeric count >=0
     * @param {string} eventType The kind of Event Type that needs to be logged- should be a js var compatible string
     * @param {string} eventCategory The kind of Event Category that
     * needs to be logged- should be a js var compatible string
     * @param {string} eventSubCategory The kind of Event Sub Category that
     * needs to be logged- should be a js var compatible string
     * @param {number} value
     */
    function valueEvent(eventType, eventCategory, eventSubCategory, value) {
        _logEventForAudit(eventType, eventCategory, eventSubCategory, value);
        _sendToGoogleAnalytics(eventType, eventCategory, eventSubCategory, value);
        _sendToCoreAnalytics(eventType, eventCategory, eventSubCategory, 1, value);
    }

    function setDisabled(shouldDisable) {
        disabled = shouldDisable;
    }

    function getLoggedDataForAudit() {
        return loggedDataForAudit;
    }

    // Define public API
    exports.init               = init;
    exports.setDisabled        = setDisabled;
    exports.getLoggedDataForAudit      = getLoggedDataForAudit;
    exports.countEvent         = countEvent;
    exports.valueEvent         = valueEvent;
});
