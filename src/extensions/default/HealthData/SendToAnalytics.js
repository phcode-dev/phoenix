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

/*global Phoenix*/
define(function (require, exports, module) {
    const Metrics = brackets.getModule("utils/Metrics"),
        PreferencesManager  = brackets.getModule("preferences/PreferencesManager"),
        PerfUtils           = brackets.getModule("utils/PerfUtils"),
        themesPref          = PreferencesManager.getExtensionPrefs("themes");

    const PLATFORM = Metrics.EVENT_TYPE.PLATFORM,
        PERFORMANCE = Metrics.EVENT_TYPE.PERFORMANCE,
        STORAGE = Metrics.EVENT_TYPE.STORAGE;

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

    // web storage
    async function _sendStorageMetrics() {
        if (navigator.storage && navigator.storage.estimate) {
            const quota = await navigator.storage.estimate();
            // quota.usage -> Number of bytes used.
            // quota.quota -> Maximum number of bytes available.
            const percentageUsed = Math.round((quota.usage / quota.quota) * 100);
            const usedMB = Math.round(quota.usage / 1024 / 1024);
            console.log(`Web Storage quota used: ${percentageUsed}%, ${usedMB}MB`);
            Metrics.valueEvent(STORAGE, "browserQuota", "percentUsed", percentageUsed);
            Metrics.valueEvent(STORAGE, "browserQuota", "usedMB", usedMB);
        }
    }

    function _getPlatformInfo() {
        let OS = "";
        if (/Windows|Win32|WOW64|Win64/.test(window.navigator.userAgent)) {
            OS = "WIN";
        } else if (/Mac/.test(window.navigator.userAgent)) {
            OS = "OSX";
        } else if (/Linux|X11/.test(window.navigator.userAgent)) {
            OS = "LINUX32";
            if (/x86_64/.test(window.navigator.appVersion + window.navigator.userAgent)) {
                OS = "LINUX64";
            }
        }

        return OS;
    }

    function sendPlatformMetrics() {
        Metrics.countEvent(PLATFORM, "os", brackets.platform);
        Metrics.countEvent(PLATFORM, "os.flavor", _getPlatformInfo());
        Metrics.countEvent(PLATFORM, "userAgent", window.navigator.userAgent);
        Metrics.countEvent(PLATFORM, "languageOS", brackets.app.language);
        Metrics.countEvent(PLATFORM, "languageBrackets", brackets.getLocale());
        Metrics.countEvent(PLATFORM, "bracketsVersion", brackets.metadata.version);
        _emitDeviceTypeMetrics();
        _emitBrowserMetrics();
        _emitMobileMetricsIfPresent();
        _sendStorageMetrics();
    }

    // Performance
    function sendStartupPerformanceMetrics() {
        const healthReport = PerfUtils.getHealthReport();
        let labelAppStart = "AppStartupTime";
        if(Phoenix.firstBoot){
            labelAppStart = "FirstBootTime";
        }
        Metrics.valueEvent(PERFORMANCE, "startup", labelAppStart,
            Number(healthReport["AppStartupTime"]));
        Metrics.valueEvent(PERFORMANCE, "startup", "ModuleDepsResolved",
            Number(healthReport["ModuleDepsResolved"]));
        Metrics.valueEvent(PERFORMANCE, "startup", "PhStore", PhStore._storageBootstrapTime);
        if(Phoenix.browser.isTauri) {
            Metrics.valueEvent(PERFORMANCE, "startup", "tauriBoot", window._tauriBootVars.bootstrapTime);
        }
        if(window.nodeSetupDonePromise) {
            window.nodeSetupDonePromise
                .then(()=>{
                    window.PhNodeEngine && window.PhNodeEngine._nodeLoadTime
                    && Metrics.valueEvent(PERFORMANCE, "startup", "nodeBoot", window.PhNodeEngine._nodeLoadTime);
                    Metrics.countEvent(PERFORMANCE, "nodeBoot", "success", 1);
                })
                .catch(_err=>{
                    Metrics.countEvent(PERFORMANCE, "nodeBoot", "fail", 1);
                });
        }
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
