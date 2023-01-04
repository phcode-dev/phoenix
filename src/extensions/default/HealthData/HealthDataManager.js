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
        UrlParams           = brackets.getModule("utils/UrlParams").UrlParams,
        Strings             = brackets.getModule("strings"),
        Metrics             = brackets.getModule("utils/Metrics"),
        SendToAnalytics     = require("SendToAnalytics"),
        prefs               = PreferencesManager.getExtensionPrefs("healthData"),
        params              = new UrlParams(),
        ONE_SECOND          = 1000,
        TEN_SECOND          = 10 * ONE_SECOND;

    prefs.definePreference("healthDataTracking", "boolean", true, {
        description: Strings.DESCRIPTION_HEALTH_DATA_TRACKING
    });
    params.parse();

    prefs.on("change", "healthDataTracking", function () {
        let healthDataDisabled = !prefs.get("healthDataTracking");
        Metrics.setDisabled(healthDataDisabled);
        logger.loggingOptions.healthDataDisabled = healthDataDisabled;
    });

    AppInit.appReady(function () {
        Metrics.init();
        let healthDataDisabled = !prefs.get("healthDataTracking");
        Metrics.setDisabled(healthDataDisabled);
        SendToAnalytics.sendPlatformMetrics();
        SendToAnalytics.sendThemesMetrics();
        setTimeout(SendToAnalytics.sendStartupPerformanceMetrics, TEN_SECOND);
    });
});
