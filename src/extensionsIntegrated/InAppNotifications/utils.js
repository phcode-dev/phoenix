/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2018 - 2021 Adobe Systems Incorporated. All rights reserved.
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
