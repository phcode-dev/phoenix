/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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
 * This file provides the interface to user visible strings in Brackets. Code that needs
 * to display strings should should load this module by calling `var Strings = require("strings")`.
 * The i18n plugin will dynamically load the strings for the right locale and populate
 * the exports variable. See src\nls\strings.js for the master file of English strings.
 */
define(function (require, exports, module) {


    var _ = require("thirdparty/lodash");

    var strings     = require("i18n!nls/strings"),
        urls        = require("i18n!nls/urls"),
        stringsApp  = require("i18n!nls/strings-app"),
        StringUtils = require("utils/StringUtils");

    // make sure the global brackets variable is loaded
    require("utils/Global");

    // Add URLs as additional globals
    var additionalGlobals = $.extend({}, urls),
        parsedVersion = /([0-9]+)\.([0-9]+)\.([0-9]+)/.exec(brackets.metadata.version);

    additionalGlobals.APP_NAME      = brackets.metadata.name || strings.APP_NAME;
    additionalGlobals.APP_TITLE     = brackets.config.app_title || strings.APP_NAME;
    strings.APP_TITLE = additionalGlobals.APP_TITLE;
    additionalGlobals.TWITTER_NAME  = brackets.config.twitter_name;
    additionalGlobals.VERSION       = brackets.metadata.version;
    additionalGlobals.VERSION_MAJOR = parsedVersion[1];
    additionalGlobals.VERSION_MINOR = parsedVersion[2];
    additionalGlobals.VERSION_PATCH = parsedVersion[3];

    if (brackets.config.buildtype === 'production') {
        additionalGlobals.BUILD_TYPE = strings.RELEASE_BUILD;
    } else if (brackets.config.buildtype === 'staging') {
        additionalGlobals.BUILD_TYPE = strings.PRERELEASE_BUILD;
    } else {
        additionalGlobals.BUILD_TYPE = strings.DEVELOPMENT_BUILD;
    }

    // Insert application strings
    _.forEach(strings, function (value, key) {
        _.forEach(additionalGlobals, function (item, name) {
            strings[key] = strings[key].replace(new RegExp("{" + name + "}", "g"), additionalGlobals[name]);
        });
    });

    // Append or overlay additional, product-specific strings
    _.forEach(stringsApp, function (value, key) {
        _.forEach(additionalGlobals, function (item, name) {
            stringsApp[key] = stringsApp[key].replace(new RegExp("{" + name + "}", "g"), additionalGlobals[name]);
        });
        strings[key] = stringsApp[key];
    });

    module.exports = strings;

});
