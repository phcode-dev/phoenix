/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*global logger*/
define(function (require, exports, module) {
    var AppInit             = brackets.getModule("utils/AppInit"),
        PreferencesManager  = brackets.getModule("preferences/PreferencesManager"),
        Strings             = brackets.getModule("strings"),
        Metrics             = brackets.getModule("utils/Metrics"),
        SendToAnalytics     = require("SendToAnalytics"),
        prefs               = PreferencesManager.getExtensionPrefs("healthData"),
        ONE_SECOND          = 1000,
        TEN_SECOND          = 10 * ONE_SECOND,
        ONE_MINUTE          = 60000,
        MAX_DAYS_TO_KEEP_COUNTS = 60,
        USAGE_COUNTS_KEY    = "healthDataUsage";

    /**
     * A power user is someone who has used Phoenix at least 3 days or 8 hours in the last two weeks
     * @returns {boolean}
     */
    function isPowerUser() {
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

    let healthDataDisabled;

    prefs.definePreference("healthDataTracking", "boolean", true, {
        description: Strings.DESCRIPTION_HEALTH_DATA_TRACKING
    });

    prefs.on("change", "healthDataTracking", function () {
        healthDataDisabled = !prefs.get("healthDataTracking");
        Metrics.setDisabled(healthDataDisabled);
        logger.loggingOptions.healthDataDisabled = healthDataDisabled;
    });

    // we delete all usage counts greater than MAX_DAYS_TO_KEEP_COUNTS days
    function _pruneUsageData() {
        let usageData = PreferencesManager.getViewState(USAGE_COUNTS_KEY) || {},
            dateKeys = Object.keys(usageData),
            dateBefore60Days = new Date();
        dateBefore60Days.setDate(dateBefore60Days.getDate() - MAX_DAYS_TO_KEEP_COUNTS);
        if(dateKeys.length > MAX_DAYS_TO_KEEP_COUNTS) {
            for(let dateKey of dateKeys){
                let date = new Date(dateKey);
                if(date < dateBefore60Days) {
                    delete usageData[dateKey];
                }
            }
        }
        // low priority, we do not want to save this right now
        PreferencesManager.setViewState(USAGE_COUNTS_KEY, usageData);
    }

    function _trackUsageInfo() {
        _pruneUsageData();
        setInterval(()=>{
            if(healthDataDisabled){
                return;
            }
            let usageData = PreferencesManager.getViewState(USAGE_COUNTS_KEY) || {};
            let dateNow = new Date();
            let today = dateNow.toISOString().split('T')[0]; // yyyy-mm-dd format
            usageData[today] = (usageData[today] || 0) + 1;
            // low priority, we do not want to save this right now
            PreferencesManager.setViewState(USAGE_COUNTS_KEY, usageData);
        }, ONE_MINUTE);
    }

    AppInit.appReady(function () {
        Metrics.init({
            isPowerUserFn: isPowerUser
        });
        healthDataDisabled = !prefs.get("healthDataTracking");
        if (healthDataDisabled && !Phoenix.healthTrackingDisabled) {
            // Phoenix.healthTrackingDisabled is initialized at boot using localStorage.
            // However, there's a theoretical edge case where the browser may have cleared
            // localStorage, causing a mismatch between the boot-time flag and the actual
            // persisted user preference.
            //
            // This means we might unintentionally log some metrics during the short window
            // before the real preference is loaded and applied.
            //
            // To track this discrepancy, we emit a one-time metric just before disabling tracking,
            // so we’re aware of this inconsistency and can address it if needed.
            Metrics.countEvent(Metrics.PLATFORM, "metricBoot", "disableErr");
        }
        Metrics.setDisabled(healthDataDisabled);
        SendToAnalytics.sendPlatformMetrics();
        SendToAnalytics.sendThemesMetrics();
        _trackUsageInfo();
        setTimeout(SendToAnalytics.sendStartupPerformanceMetrics, TEN_SECOND);
    });
});
