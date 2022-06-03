/*
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*global define, gtag, analytics*/
define(function (require, exports, module) {
    const CATEGORY_PROJECT = "PROJECT";

    function _sendToGoogleAnalytics(category, action, label, value) {
        // https://developers.google.com/analytics/devguides/collection/analyticsjs/events
        category = category || "category";
        action = action || "action";
        if(!label){
            label = action;
        }
        if(!value){
            value = 1;
        }
        gtag('event', action, {
            'event_category': category,
            'event_label': label,
            'value': value
        });
    }

    function _sendToCoreAnalytics(category, action, label, value) {
        // https://developers.google.com/analytics/devguides/collection/analyticsjs/events
        category = category || "category";
        action = action || "action";
        if(!label){
            label = action;
        }
        if(!value){
            value = 1;
        }
        analytics.event(category, action, label, value);
    }

    /**
     * send to google analytics
     * @param category string mandatory
     * @param action string mandatory
     * @param label string can be null
     * @param value int can be null
     * @private
     */
    function sendEvent(category, action, label, value) {
        _sendToGoogleAnalytics(category, action, label, value);
        _sendToCoreAnalytics(category, action, label, value);
    }

    function _sendMapValues(category, action, mapObject) {
        for(let key in mapObject) {
            sendEvent(category, action, key, mapObject[key]);
        }
    }

    function _sendPlatformMetrics(data) {
        let CATEGORY_PLATFORM = "PLATFORM";
        sendEvent(CATEGORY_PLATFORM, "os", data["os"]);
        sendEvent(CATEGORY_PLATFORM, "osLanguage", data["osLanguage"]);
        sendEvent(CATEGORY_PLATFORM, "bracketsLanguage", data["bracketsLanguage"]);
        sendEvent(CATEGORY_PLATFORM, "bracketsVersion", data["bracketsVersion"]);
        sendEvent(CATEGORY_PLATFORM, "AppStartupTime", null, data["AppStartupTime"]);
        sendEvent(CATEGORY_PLATFORM, "ModuleDepsResolved", null, data["ModuleDepsResolved"]);
    }

    function _sendProjectLoadTimeMetrics(data) {
        let ACTION_PROJECT_LOAD_TIME = "projectLoadTimes";
        let projectLoadTimeStr = data[ACTION_PROJECT_LOAD_TIME] || ""; //  string with : seperated load times":32:21"
        let loadTimes = projectLoadTimeStr.substring(1).split(":");
        for(let loadTime of loadTimes){
            sendEvent(CATEGORY_PROJECT, "ACTION_PROJECT_LOAD_TIME", null, loadTime);
        }
    }

    function _sendFileMetrics(data) {
        let CATEGORY_FILE = "FILE_STATS",
            ACTION_OPENED_FILES_EXT = "openedFileExt",
            ACTION_WORKINGSET_FILES_EXT = "workingSetFileExt",
            ACTION_OPENED_FILE_ENCODING = "openedFileEncoding",
            fileStats = data["fileStats"] || {};
        if(fileStats[ACTION_OPENED_FILES_EXT]){
            _sendMapValues(CATEGORY_FILE, ACTION_OPENED_FILES_EXT, fileStats[ACTION_OPENED_FILES_EXT]);
        }
        if(fileStats[ACTION_WORKINGSET_FILES_EXT]){
            _sendMapValues(CATEGORY_FILE, ACTION_WORKINGSET_FILES_EXT, fileStats[ACTION_WORKINGSET_FILES_EXT]);
        }
        if(fileStats[ACTION_OPENED_FILE_ENCODING]){
            _sendMapValues(CATEGORY_FILE, ACTION_OPENED_FILE_ENCODING, fileStats[ACTION_OPENED_FILE_ENCODING]);
        }
    }

    function _sendThemesMetrics(data) {
        let CATEGORY_THEMES = "THEMES",
            ACTION_CURRENT_THEME = "bracketsTheme";
        sendEvent(CATEGORY_THEMES, ACTION_CURRENT_THEME, data[ACTION_CURRENT_THEME]);
    }

    function _sendExtensionMetrics(data) {
        let CATEGORY_EXTENSIONS = "EXTENSIONS",
            CATEGORY_INSTALLED_EXTENSIONS = "installedExtensions",
            NUM_EXTENSIONS_INSTALLED = "numExtensions",
            ATTR_NAME = "name",
            ATTR_VERSION = "version",
            extensionStats = data["installedExtensions"] || [];
        for (const item of extensionStats) {
            let extension = item,
                name = extension[ATTR_NAME] || "-",
                version = extension[ATTR_VERSION] || "-";
            sendEvent(CATEGORY_INSTALLED_EXTENSIONS, name, version);
        }
        sendEvent(CATEGORY_EXTENSIONS, NUM_EXTENSIONS_INSTALLED, null, extensionStats.length);
    }

    function sendHealthDataToGA(healthData) {
        _sendPlatformMetrics(healthData);
        _sendFileMetrics(healthData);
        _sendThemesMetrics(healthData);
        _sendExtensionMetrics(healthData);
    }

    exports.sendHealthDataToGA = sendHealthDataToGA;
    exports.sendEvent = sendEvent;
});
