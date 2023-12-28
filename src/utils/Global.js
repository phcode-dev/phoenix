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
 * Initializes the global "brackets" variable and it's properties.
 * Modules should not access the global.brackets object until either
 * (a) the module requires this module, i.e. require("utils/Global") or
 * (b) the module receives a "appReady" callback from the utils/AppReady module.
 */
define(function (require, exports, module) {


    var configJSON  = require("text!config.json"),
        UrlParams   = require("utils/UrlParams").UrlParams;

    // Define core brackets namespace if it isn't already defined
    //
    // We can't simply do 'brackets = {}' to define it in the global namespace because
    // we're in "use strict" mode. Most likely, 'window' will always point to the global
    // object when this code is running. However, in case it isn't (e.g. if we're running
    // inside Node for CI testing) we use this trick to get the global object.
    var Fn = Function, global = (new Fn("return this"))();
    if (!global.brackets) {

        // Earlier brackets object was initialized at
        // https://github.com/adobe/brackets-shell/blob/908ed1503995c1b5ae013473c4b181a9aa64fd22/appshell/appshell_extensions.js#L945.
        // With the newer versions of CEF, the initialization was crashing the render process, citing
        // JS eval error. So moved the brackets object initialization from appshell_extensions.js to here.
        if (global.appshell) {
            global.brackets = global.appshell;
        } else {
            global.brackets = {};
        }
    }

    // Parse URL params
    var params = new UrlParams();
    params.parse();

    // Parse src/config.json
    try {
        global.brackets.metadata = JSON.parse(configJSON);
        global.brackets.config = global.brackets.metadata.config;
    } catch (err) {
        console.log(err);
    }

    global.brackets.nativeMenus = false;

    // Locale-related APIs
    global.brackets.isLocaleDefault = function () {
        return !global.PhStore.getItem("locale");
    };

    global.brackets.getLocale = function () {
        // By default use the locale that was determined in brackets.js
        return params.get("testEnvironment") ? "en" : (global.PhStore.getItem("locale") || global.require.s.contexts._.config.locale);
    };

    global.brackets.setLocale = function (locale) {
        if (locale) {
            global.PhStore.setItem("locale", locale);
        } else {
            global.PhStore.removeItem("locale");
        }
    };

    // Create empty app namespace if running in-browser
    if (!global.brackets.app) {
        global.brackets.app = global.Phoenix.app;
    }

    // Loading extensions requires creating new require.js contexts, which
    // requires access to the global 'require' object that always gets hidden
    // by the 'require' in the AMD wrapper. We store this in the brackets
    // object here so that the ExtensionLoader doesn't have to have access to
    // the global object.
    global.brackets.libRequire = global.require;

    // Also store our current require.js context (the one that loads brackets
    // core modules) so that extensions can use it.
    // Note: we change the name to "getModule" because this won't do exactly
    // the same thing as 'require' in AMD-wrapped modules. The extension will
    // only be able to load modules that have already been loaded once.
    global.brackets.getModule = require;

    /* API for retrieving the global RequireJS config
     * For internal use only
     */
    global.brackets._getGlobalRequireJSConfig = function () {
        return global.require.s.contexts._.config;
    };

    exports.global = global;
});
