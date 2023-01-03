/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*globals Bugsnag*/

import AppConfig from "./loggerConfig.js";

// logger setup
function swallowLogs() {
    // Do nothing
}
const savedLoggingFn = console.log;
const savedInfoFn = console.info;

window.setupLogging = function () {
    const urlParams = new URLSearchParams(window.location.search || "");
    const logToConsoleOverride = urlParams.get('logToConsole');
    const logToConsolePref = localStorage.getItem("logToConsole");
    window.testEnvironment = (urlParams.get('testEnvironment') === 'true');
    if((logToConsoleOverride && logToConsoleOverride.toLowerCase() === 'true')
        || (logToConsolePref && logToConsolePref.toLowerCase() === 'true' && !logToConsoleOverride)){
        console.log= savedLoggingFn;
        console.info= savedInfoFn;
        window.logToConsolePref = 'true';
        window.debugMode = true;
        return true;
    } else {
        console.info = console.log = swallowLogs;
        window.logToConsolePref = 'false';
        window.debugMode = false;
        return false;
    }
};
window.setupLogging();

window.isLoggingEnabled = function (key) {
    let loggingEnabled = localStorage.getItem(key) || "false";
    return loggingEnabled.toLowerCase() === 'true';
};

window.toggleLoggingKey = function(key) {
    if(window.isLoggingEnabled(key)){
        localStorage.setItem(key, 'false');
    } else {
        localStorage.setItem(key, 'true');
    }
};

window.loggingOptions = {
    LOCAL_STORAGE_KEYS: {
        LOG_LIVE_PREVIEW: "logLivePreview"
    },
    livePreview: {
        log: function (...args) {
            if(window.loggingOptions.logLivePreview){
                console.log(...args);
            }
        }
    },
    healthDataDisabled: false,
    /**
     * By default all uncaught exceptions and promise rejections are sent to logger utility. But in some cases
     * you may want to sent handled errors too if it is critical. use this function to report those
     * @param error
     */
    reportError: function (error) {
        Bugsnag.notify(error);
    }
};
window.loggingOptions.logLivePreview = window.isLoggingEnabled(
    window.loggingOptions.LOCAL_STORAGE_KEYS.LOG_LIVE_PREVIEW);

function onError(event) {
    // for mroe info https://docs.bugsnag.com/platforms/javascript/customizing-error-reports
    // change health logger popup string before changing the below line to anything other than "Caught Critical error"
    let reportedStatus = window.loggingOptions.healthDataDisabled? "Not Reported as health data disabled." : "Reported";

    console.error(`Caught Critical error, ${reportedStatus}: `, event);
    if(window.Metrics) {
        window.Metrics.countEvent(window.Metrics.EVENT_TYPE.ERROR, "uncaught", "logger");
    }
    if(window.loggingOptions.healthDataDisabled){
        // don't log anything as user disabled health tracking
        return false;
    }
}

let isLocalHost = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

if(!window.testEnvironment && !isLocalHost) {
    Bugsnag.start({
        apiKey: 'a899c29d251bfdf30c3222016a2a7ea7',
        appType: window.__TAURI__ ? "tauri" : "browser",
        collectUserIp: false,
        appVersion: AppConfig.version,
        enabledReleaseStages: [ 'development', 'production', 'staging',
            'tauri-development', 'tauri-production', 'tauri-staging'],
        releaseStage: window.__TAURI__ ? "tauri-" + AppConfig.config.bugsnagEnv : AppConfig.config.bugsnagEnv,
        // https://docs.bugsnag.com/platforms/javascript/#logging-breadcrumbs
        // breadcrumbs is disabled as it seems a bit intrusive in Pheonix even-though it might help with debugging.
        enabledBreadcrumbTypes: [],
        // https://docs.bugsnag.com/platforms/javascript/configuration-options/#maxevents
        maxEvents: 10,
        onError
    });
} else {
    console.warn("Logging to Bugsnag is disabled as current environment is localhost.");
}
