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

/*global define*/
define(function (require, exports, module) {
    const Metrics = brackets.getModule("utils/Metrics"),
        PreferencesManager  = brackets.getModule("preferences/PreferencesManager"),
        PerfUtils           = brackets.getModule("utils/PerfUtils"),
        themesPref          = PreferencesManager.getExtensionPrefs("themes");

    const PLATFORM = Metrics.EVENT_TYPE.PLATFORM,
        PERFORMANCE = Metrics.EVENT_TYPE.PERFORMANCE;

    // Platform metrics to be sent at startup
    function _emitDeviceTypeMetrics() {
        if(brackets.browser.isDeskTop) {
            Metrics.countEvent(PLATFORM, "device", "desktop");
        }
        if(brackets.browser.isMobile) {
            Metrics.countEvent(PLATFORM, "device", "mobile");
        }
        if(brackets.browser.isTablet) {
            Metrics.countEvent(PLATFORM, "device", "tablet");
        }
    }
    function _emitMobileMetricsIfPresent() {
        let platform = "none";
        if(brackets.browser.mobile.isIos) {
            platform = "ios";
        } else if(brackets.browser.mobile.isWindows) {
            platform = "windows";
        } else if(brackets.browser.mobile.isAndroid) {
            platform = "android";
        } else {
            return;
        }
        Metrics.countEvent(PLATFORM, "mobile", platform);
    }
    function _emitBrowserMetrics() {
        if(brackets.browser.desktop.isChrome) {
            Metrics.countEvent(PLATFORM, "browser", "chrome");
        }
        if(brackets.browser.desktop.isChromeBased) {
            Metrics.countEvent(PLATFORM, "browser", "chromeBased");
        }
        if(brackets.browser.desktop.isEdgeChromium) {
            Metrics.countEvent(PLATFORM, "browser", "EdgeChromium");
        }
        if(brackets.browser.desktop.isFirefox) {
            Metrics.countEvent(PLATFORM, "browser", "firefox");
        }
        if(brackets.browser.desktop.isOpera) {
            Metrics.countEvent(PLATFORM, "browser", "opera");
        }
        if(brackets.browser.desktop.isOperaChromium) {
            Metrics.countEvent(PLATFORM, "browser", "operaChromium");
        }
    }
    function sendPlatformMetrics() {
        Metrics.countEvent(PLATFORM, "os", brackets.platform);
        Metrics.countEvent(PLATFORM, "os.flavor", brackets.getPlatformInfo());
        Metrics.countEvent(PLATFORM, "userAgent", window.navigator.userAgent);
        Metrics.countEvent(PLATFORM, "languageOS", brackets.app.language);
        Metrics.countEvent(PLATFORM, "languageBrackets", brackets.getLocale());
        Metrics.countEvent(PLATFORM, "bracketsVersion", brackets.metadata.version);
        _emitDeviceTypeMetrics();
        _emitBrowserMetrics();
        _emitMobileMetricsIfPresent();
    }

    // Performance
    function sendStartupPerformanceMetrics() {
        const healthReport = PerfUtils.getHealthReport();
        Metrics.valueEvent(PERFORMANCE, "startup", "AppStartupTime",
            Number(healthReport["AppStartupTime"]));
        Metrics.valueEvent(PERFORMANCE, "startup", "ModuleDepsResolved",
            Number(healthReport["ModuleDepsResolved"]));
    }

    // Themes
    function _getCurrentTheme() {
        // TODO: currently phoenix only have default themes, but in future, we should ensure that only themes in the
        //  registry and user installed are logged for privacy.
        return themesPref.get("theme") || "default";
    }
    function sendThemesMetrics() {
        Metrics.countEvent(Metrics.EVENT_TYPE.THEMES, "currentTheme", _getCurrentTheme());
    }

    exports.sendPlatformMetrics = sendPlatformMetrics;
    exports.sendStartupPerformanceMetrics = sendStartupPerformanceMetrics;
    exports.sendThemesMetrics = sendThemesMetrics;
    // TODO: send extension metrics
});
