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

/*globals Bugsnag, AppConfig, Phoenix*/
// window.AppConfig comes from appConfig.js built by gulp scripts at build time

(function(){
    const isLocalHost = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const urlParams = new URLSearchParams(window.location.search || "");
    const isBugsnagEnabled = (!window.testEnvironment && !isLocalHost);
    const MAX_ERR_SENT_RESET_INTERVAL = 60000,
        MAX_ERR_SENT_FIRST_MINUTE = 10,
        MAX_ERR_ALLOWED_IN_MINUTE = 2;
    let firstMinuteElapsed = false, errorsSentThisMinute = 0;

    class CustomBugSnagError extends Error {
        constructor(message, err){
            super(message + ((err && err.message) || ""));
            this.name = (err && err.constructor && err.constructor.name) || this.constructor.name;
            this.stack= message +" : "+ (err && err.stack) || "stack not available";
        }
    }

    const logger = {
        error: console.error,
        warn: console.warn,
        /**
         * By default all uncaught exceptions and promise rejections are sent to logger utility. But in some cases
         * you may want to sent handled errors too if it is critical. use this function to report those
         * @param {Error} error
         * @param {string} [message] optional message
         */
        reportError: function (error, message) {
            if(isBugsnagEnabled) {
                Bugsnag.notify(message?
                    new CustomBugSnagError(message, error)
                    :error);
            }
        },
        /**
         * By default all uncaught exceptions and promise rejections are sent to logger utility. But in some cases
         * you may want to sent handled errors too if it is critical. use this function to report those
         * @param {Error} error
         * @param {string} [message] optional message
         */
        reportErrorMessage: function (message) {
            if(isBugsnagEnabled) {
                Bugsnag.notify(new CustomBugSnagError(message));
            }
        },

        /**
         * This will help to provide additional context to error reporting. The trail will serve as a series of
         * events that happened before an error and will help to backtrack the error.
         * @param {string} message
         */
        leaveTrail: function (message) {
            console.log("[Trail] : ", message);
            if(isBugsnagEnabled) {
                Bugsnag.leaveBreadcrumb(message);
            }
        },

        loggingOptions: {
            LOCAL_STORAGE_KEYS: {
                // change these keys in devEnable.html too
                LOG_TO_CONSOLE_KEY: "logToConsole",
                LOG_LIVE_PREVIEW: "logLivePreview"
            },
            healthDataDisabled: false,
            logLivePreview: false // logLivePreview will be setup below
        },
        livePreview: {
            log: function (...args) {
                if(logger.loggingOptions.logLivePreview){
                    logger.log(...args);
                }
            }
        }
        // other API setup below
    };
    window.logger = logger;

    // logger setup
    function swallowLogs() {
        // Do nothing
    }
    const savedLoggingFn = console.log;
    const savedInfoFn = console.info;

    /**
     * interceptors for console.log and info
     * @returns {boolean}
     */
    window.setupLogging = function () {
        const logToConsoleOverride = urlParams.get(logger.loggingOptions.LOCAL_STORAGE_KEYS.LOG_TO_CONSOLE_KEY);
        const logToConsolePref = localStorage.getItem(logger.loggingOptions.LOCAL_STORAGE_KEYS.LOG_TO_CONSOLE_KEY);
        if((logToConsoleOverride && logToConsoleOverride.toLowerCase() === 'true')
            || (logToConsolePref && logToConsolePref.toLowerCase() === 'true' && !logToConsoleOverride)){
            console.log= savedLoggingFn;
            console.info= savedInfoFn;
            logger.log = console.log;
            logger.info = console.info;
            logger.logToConsolePref = 'true';
            window.debugMode = true;
            return true;
        } else {
            console.info = console.log = swallowLogs;
            logger.info = logger.log = swallowLogs;
            logger.logToConsolePref = 'false';
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


    logger.loggingOptions.logLivePreview = window.isLoggingEnabled(
        logger.loggingOptions.LOCAL_STORAGE_KEYS.LOG_LIVE_PREVIEW);

    function _shouldDiscardError(errors = []) {
        if(!window.Phoenix || !window.Phoenix.VFS){
            return false;
        }
        let fileURL, extensionName, userFsURLFound = false,
            userExtensionsFolderURL = window.Phoenix.VFS.getVirtualServingURLForPath(window.Phoenix.VFS.getUserExtensionDir()+"/");

        // errors with stacks originating from any folder or files from the user file system are not logged for privacy
        for(let error of errors){
            if(error.stacktrace && error.stacktrace[0]) {
                for(let stack of error.stacktrace){
                    fileURL = stack.file || "";
                    if(fileURL.startsWith(userExtensionsFolderURL)) {
                        // an extension installed from extension store has error. we dont log, but raise metric
                        extensionName = fileURL.replace(userExtensionsFolderURL, "");
                        extensionName = extensionName.split("/")[0];
                        let supportStatus = "Y";
                        if(!Phoenix.isSupportedBrowser){
                            supportStatus = "N";
                        }
                        window.Metrics.countEvent(window.Metrics.EVENT_TYPE.ERROR,
                            `extn-${supportStatus}-${extensionName}`, error.type);
                        window.Metrics.countEvent(window.Metrics.EVENT_TYPE.ERROR,
                            `extn-${supportStatus}-${extensionName}`, error.errorClass);
                        logger.leaveTrail(
                            `Extension Error for ${extensionName} of type ${error.type} class ${error.errorClass}`);
                        return true;
                    }
                    if(window.Phoenix.VFS.getPathForVirtualServingURL(fileURL)) {
                        userFsURLFound = true;
                    }
                }
            }
        }
        if(userFsURLFound) {
            return true;
        }
        return false;
    }

    function onError(event) {
        // for more info https://docs.bugsnag.com/platforms/javascript/customizing-error-reports
        try{
            let reportedStatus =  "Reported";
            let shouldReport = true;
            if(logger.loggingOptions.healthDataDisabled
                || (firstMinuteElapsed && errorsSentThisMinute > MAX_ERR_ALLOWED_IN_MINUTE)){
                // after the first minute which allows up to 10 error reports,
                // we restrict error reports to 2 per minute after that.
                reportedStatus = "Not Reported as health data disabled or max reports per minute breached.";
                shouldReport = false;
            } else if(_shouldDiscardError(event.errors)){
                reportedStatus = "Not Reported error from user extension or fs.";
                shouldReport = false;
            }

            // change health logger popup string before changing the below to anything other than "Caught Critical error"
            console.error(`Caught Critical error, ${reportedStatus}: `, event);
            if(window.Metrics) {
                let supportStatus = "supportedBrowser";
                if(!Phoenix.isSupportedBrowser){
                    supportStatus = "unsupportedBrowser";
                }
                window.Metrics.countEvent(window.Metrics.EVENT_TYPE.ERROR, "uncaught", supportStatus);
            }

            if(shouldReport){
                errorsSentThisMinute++;
            }
            return shouldReport;
        } catch (e) {
            console.error("exception occurred while reposting error: ", e);
            event.addMetadata('onError', 'exception', e.message);
        }
    }

    let context = 'desktop';
    if(Phoenix.browser.isTablet) {
        context = 'tablet';
    } else if(Phoenix.browser.isMobile) {
        context = 'mobile';
    }
    if(Phoenix.browser.isTauri) {
        context = `tauri-${context}`;
    }
    if(Phoenix.browser.isMobile || Phoenix.browser.isTablet) {
        let device = 'unknownDevice';
        if(Phoenix.browser.mobile.isAndroid){
            device = 'android';
        } else if(Phoenix.browser.mobile.isIos){
            device = 'ios';
        } else if(Phoenix.browser.mobile.isWindows){
            device = 'windows';
        }
        context = `${context}-${device}`;
    }
    if(Phoenix.browser.isDeskTop) {
        let browser = 'unknownBrowser';
        if(Phoenix.browser.desktop.isOperaChromium){
            browser = 'operaChrome';
        } else if(Phoenix.browser.desktop.isEdgeChromium){
            browser = 'edgeChrome';
        } else if(Phoenix.browser.desktop.isChrome){
            browser = 'googleChrome';
        } else if(Phoenix.browser.desktop.isChromeBased){
            browser = 'chromeLike';
        } else if(Phoenix.browser.desktop.isFirefox){
            browser = 'firefox';
        } else if(Phoenix.browser.desktop.isOpera){
            browser = 'operaLegacy';
        } else if(Phoenix.browser.desktop.isSafari){
            browser = 'safari';
        } else if(Phoenix.browser.desktop.isWebKit){
            browser = 'webkit';
        }
        context = `${context}-${Phoenix.platform}-${browser}`;
    }
    context = Phoenix.isSupportedBrowser ? `supported-${context}` : `unsupported-${context}`;
    Phoenix.supportContextName = context;
    console.log("BugSnag context is - ", context);

    if(isBugsnagEnabled) {
        Bugsnag.start({
            apiKey: '94ef94f4daf871ca0f2fc912c6d4764d',
            context: context,
            appType: Phoenix.browser && Phoenix.browser.isTauri ? "tauri" : "browser",
            collectUserIp: false,
            appVersion: AppConfig.version,
            enabledReleaseStages: [ 'development', 'production', 'staging',
                'tauri-development', 'tauri-production', 'tauri-staging'],
            releaseStage: window.__TAURI__ ? "tauri-" + AppConfig.config.bugsnagEnv : AppConfig.config.bugsnagEnv,
            // https://docs.bugsnag.com/platforms/javascript/#logging-breadcrumbs
            // breadcrumbs is disabled as it seems a bit intrusive in Pheonix even-though it might help with debugging.
            // only manual explicit privacy ready breadcrumbs are allowed
            enabledBreadcrumbTypes: ['manual'],
            // https://docs.bugsnag.com/platforms/javascript/configuration-options/#maxevents
            maxEvents: MAX_ERR_SENT_FIRST_MINUTE,
            maxBreadcrumbs: 50,
            onError
        });
        setInterval(()=>{
            Bugsnag.resetEventCount();
            firstMinuteElapsed = true;
            errorsSentThisMinute = 0;
        }, MAX_ERR_SENT_RESET_INTERVAL);
        if(window.cacheClearError){
            logger.reportError(window.cacheClearError);
        }
    } else {
        console.warn("Logging to Bugsnag is disabled as current environment is localhost.");
    }
}());
