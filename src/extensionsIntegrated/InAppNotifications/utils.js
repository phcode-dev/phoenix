/*
 * Copyright (c) 2019 - present Adobe. All rights reserved.
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
    const         semver = require("thirdparty/semver.browser");
    function isValidForThisVersion(versionFilter) {
        return semver.satisfies(brackets.metadata.apiVersion, versionFilter);
    }

    // platformFilter is a string subset of
    // "mac,win,linux,allDesktop,firefox,chrome,safari,allBrowser,all"
    function isValidForThisPlatform(platformFilter) {
        platformFilter = platformFilter.split(",");
        if(platformFilter.includes("all")
            || (platformFilter.includes(brackets.platform) && Phoenix.browser.isTauri) // win linux and mac is only for tauri and not for browser in platform
            || (platformFilter.includes("allDesktop") && Phoenix.browser.isTauri)
            || (platformFilter.includes("firefox") && Phoenix.browser.desktop.isFirefox && !Phoenix.browser.isTauri)
            || (platformFilter.includes("chrome") && Phoenix.browser.desktop.isChromeBased && !Phoenix.browser.isTauri)
            || (platformFilter.includes("safari") && Phoenix.browser.desktop.isSafari && !Phoenix.browser.isTauri)
            || (platformFilter.includes("allBrowser") && !Phoenix.browser.isTauri)){
            return true;
        }
        return false;
    }

    // api
    exports.isValidForThisVersion = isValidForThisVersion;
    exports.isValidForThisPlatform = isValidForThisPlatform;
});
