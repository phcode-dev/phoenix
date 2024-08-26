/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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
 * global util to convert jquery/js promise to a js promise. This can be used as an adapter when you do not know if the
 * promise in hand is a js or jquery deferred promise. This function will always return a normal js promise.
 * @param jqueryOrJSPromise
 * @returns {{finally}|{then}|{catch}|*}
 */
window.jsPromise = function (jqueryOrJSPromise) {
    if(jqueryOrJSPromise && jqueryOrJSPromise.catch && jqueryOrJSPromise.then && jqueryOrJSPromise.finally){
        // this should be a normal js promise return as is
        return  jqueryOrJSPromise;
    }
    if(!jqueryOrJSPromise ||
        (jqueryOrJSPromise && !jqueryOrJSPromise.fail) || (jqueryOrJSPromise && !jqueryOrJSPromise.done)){
        console.error("this function expects a jquery promise with done and fail handlers");
        throw new Error("this function expects a jquery promise with done and fail handlers");
    }
    return new Promise((resolve, reject)=>{
        jqueryOrJSPromise
            .done(resolve)
            .fail(reject);
    });
};
window.deferredToPromise = window.jsPromise;

/**
 * A safe way to return null on promise fail. This will never reject or throw.
 * @param promise
 * @param {string} logError - If a string is passed in, will log the error to console.
 * @return {*}
 */
window.catchToNull = function (promise, logError) {
    return new Promise(resolve=>{
        promise.then(resolve)
            .catch((err)=>{
                logError && console.error(logError, err);
                resolve(null);
            });
    });
};

// splash screen updates for initial install which could take time, or slow networks.
let trackedScriptCount = 0;
function _setSplashScreenStatusUpdate(message1, message2) {
    let splashScreenFrame = document.getElementById("splash-screen-frame");
    if(!splashScreenFrame){
        if(!window.debugMode){
            // If not in debug mode & splash screen isn't there, we don't need to observe dom script update status
            // to improve performance.
            window.scriptObserver && window.scriptObserver.disconnect();
            console.log('startup Watcher: Disconnected script load watcher.');
        }
        return false;
    }
    let displayBtn1 = splashScreenFrame.contentDocument.getElementById("load-status-display-btn");
    let displayText2 = splashScreenFrame.contentDocument.getElementById("load-status-display-text");
    displayBtn1.textContent = message1;
    displayText2.textContent = message2;
    return true;
}

// Callback function to execute when mutations are observed
const callback = function(mutationsList) {
    try{
        // we have to guard here with try catch as this callback is executed on script load and any error
        // here will break load
        for(const mutation of mutationsList) {
            if (mutation.type === 'childList' && mutation.addedNodes.length >0 && mutation.addedNodes[0].src) {
                trackedScriptCount++;
                let scriptAddedSplit = mutation.addedNodes[0].src.split("/");
                if(scriptAddedSplit.length > 0){
                    let message = `Loading (${trackedScriptCount})`;
                    if(window.Phoenix && window.Phoenix.firstBoot) {
                        message = `Installing (${trackedScriptCount})`;
                    }
                    _setSplashScreenStatusUpdate(message, `${scriptAddedSplit[scriptAddedSplit.length-1]}`);
                }
            }
        }
    } catch (e) {
        console.error("Error in script mutation observer!", e);
    }
};
const mainScripts = document.getElementById('main-scripts-head');
const config = { childList: true};

if(!Phoenix.isNativeApp) {
    // in tauri, there is no splash screen, so we dont do this.
    // Create an observer instance linked to the callback function
    window.scriptObserver = new MutationObserver(callback);

    // Start observing the target node for configured mutations
    window.scriptObserver.observe(mainScripts, config);
}

/**
 * The bootstrapping module for brackets. This module sets up the require
 * configuration and loads the brackets module.
 */
require.config({
    paths: {
        "text": "thirdparty/text/text",
        "i18n": "thirdparty/i18n/i18n",

        // The file system implementation. Change this value to use different
        // implementations (e.g. cloud-based storage).
        "fileSystemImpl": "filesystem/impls/appshell/AppshellFileSystem",
        "preact-compat": "thirdparty/preact-compat/preact-compat.min",
        "preact": "thirdparty/preact/preact"
    },
    map: {
        "*": {
            "thirdparty/CodeMirror2": "thirdparty/CodeMirror",
            "thirdparty/preact": "preact-compat",
            "view/PanelManager": "view/WorkspaceManager"  // For extension compatibility
        }
    },
    waitSeconds: 60
});

if (window.location.search.indexOf("testEnvironment") > -1) {
    require.config({
        paths: {
            "preferences/PreferencesImpl": "../test/TestPreferencesImpl"
        },
        locale: "en" // force English (US)
    });
} else {
    /**
     * hack for r.js optimization, move locale to another config call
     *
     * Use custom brackets property until CEF sets the correct navigator.language
     * NOTE: When we change to navigator.language here, we also should change to
     * navigator.language in ExtensionLoader (when making require contexts for each
     * extension).
     */
    require.config({
        locale: window.PhStore.getItem("locale") || window.navigator.language
    });
}

function _unregisterServiceWorkers() {
    return new Promise(resolve =>{
        if ('serviceWorker' in navigator) {
            console.warn("Recovering boot: unregistering all service workers...");
            navigator.serviceWorker.getRegistrations().then((registrations) => {
                const unregisterPromises = [];
                for (let registration of registrations) {
                    console.warn("Recovering boot: unregistering", registration.scope);
                    unregisterPromises.push(registration.unregister());
                }
                Promise.allSettled(unregisterPromises)
                    .catch(console.error)
                    .then(()=>{
                        console.warn("Recovering boot: Success, unregistered all service workers!");
                        resolve();
                    });
            }).catch(err=>{
                console.error("Error getting service worker registrations for boot recovery!!!", err);
                window.logger && window.logger.reportError(err,
                    'Critical error Recovering boot, while resetting service worker registrations');
                // wait for 2 more seconds for the error to be reported to bugsnag before reloading page.
                setTimeout(resolve, 2000);
            });
        } else {
            resolve();
        }
    });
}

const SESSION_RESTART_ONCE_DUE_TO_CRITICAL_ERROR = "SESSION_RESTART_ONCE_DUE_TO_CRITICAL_ERROR";

function applyStyles(element, styles) {
    Object.assign(element.style, styles);
}
function confirmReload(title, message) {
    // vanilla js elements as we dont know if anything else is available in crash scenario
    const modal = document.createElement('div');
    const modalContent = document.createElement('div');
    const modalTitle = document.createElement('h2');
    const modalMessage = document.createElement('p');
    const buttonsContainer = document.createElement('div'); // Container for buttons
    const copyButton = document.createElement('button');
    const getHelpButton = document.createElement('button');
    const reloadButton = document.createElement('button');

    // Set content
    modalTitle.textContent = title;
    message.split('\n').forEach((part, index, array) => {
        modalMessage.appendChild(document.createTextNode(part));
        if (index < array.length - 1) { // Don't add a break on the last element
            modalMessage.appendChild(document.createElement('br'));
        }
    });
    copyButton.textContent = 'Copy Error';
    getHelpButton.textContent = 'Get Help';
    reloadButton.textContent = 'Restart App';
    // Styling for visibility
    // Define common styles for buttons
    const buttonStyles = {
        padding: '10px 20px',
        marginRight: '10px', // Space between buttons
        border: 'none',
        color: 'white',
        borderRadius: '5px',
        cursor: 'pointer'
    };

    // Specific styles for different buttons
    const copyButtonStyles = {backgroundColor: '#288edf'};
    const getHelpButtonStyles = {backgroundColor: '#4CAF50'};
    const reloadButtonStyles = {backgroundColor: '#4CAF50'};

    modalTitle.style.color = 'red';
    applyStyles(modal, {
        color: 'black',
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        zIndex: '10000000',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
    });

    applyStyles(modalContent, {
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '10px',
        textAlign: 'center',
        boxShadow: '0 4px 8px rgba(0,0,0,0.2)'
    });

    applyStyles(buttonsContainer, {
        marginTop: '20px',
        display: 'flex',
        justifyContent: 'space-around'
    });

    // Apply styles to buttons
    applyStyles(copyButton, {...buttonStyles, ...copyButtonStyles});
    applyStyles(getHelpButton, {...buttonStyles, ...getHelpButtonStyles});
    applyStyles(reloadButton, {...buttonStyles, ...reloadButtonStyles});

    // Event listeners for buttons
    copyButton.onclick = function() {
        navigator.clipboard.writeText(message).then(() => {
            alert('Error Message copied!');
        }, (err) => {
            console.error('Failed to copy text: ', err);
        });
    };
    getHelpButton.onclick = function() {
        Phoenix.app.openURLInDefaultBrowser("https://github.com/phcode-dev/phoenix/discussions");
    };

    // Append children
    modalContent.appendChild(modalTitle);
    modalContent.appendChild(modalMessage);
    buttonsContainer.appendChild(copyButton);
    buttonsContainer.appendChild(getHelpButton);
    buttonsContainer.appendChild(reloadButton);
    modalContent.appendChild(buttonsContainer);
    modal.appendChild(modalContent);

    // Append modal to the body
    document.body.appendChild(modal);

    return new Promise(resolve =>{
        reloadButton.onclick = function() {
            resolve(true);
            reloadButton.textContent = 'Reloading...';
            reloadButton.style.color = 'darkgray';
            reloadButton.style.backgroundColor = 'grey';
        };
    });
}

function resetCacheAndRestart() {
    // try a cache reset
    if(window._resetCacheIfNeeded){
        window._resetCacheIfNeeded(true)
            .finally(()=>{
                // wait for 3 seconds for bugsnag to send report and service workers to be active.
                setTimeout(()=>{
                    _unregisterServiceWorkers()
                        .then(()=>{
                            location.reload();
                        });
                }, 3000);
            });
    } else {
        // wait for 3 seconds for bugsnag to send report.
        setTimeout(()=>{
            location.reload();
        }, 3000);
    }
}

async function _recoverOnFailure(err) {
    if (!Phoenix.isNativeApp && !navigator.onLine) {
        alert('No internet connection. Please check your connection and reload page.');
        return;
    }
    // metrics api might not be available here as we were seeing no metrics raised. Only bugsnag there.
    window.logger && window.logger.reportError(err,
        'Critical error when loading brackets. Trying to reload again.');
    const restartedOnce = sessionStorage.getItem(SESSION_RESTART_ONCE_DUE_TO_CRITICAL_ERROR);
    let shouldRestart;
    if(!restartedOnce){
        sessionStorage.setItem(SESSION_RESTART_ONCE_DUE_TO_CRITICAL_ERROR, "true");
        shouldRestart = true;
    } else {
        shouldRestart = await confirmReload('Oops! Something went wrong', (err.message +"\n"+ err.stack)||err);
    }
    if(!shouldRestart) {
        return;
    }
    resetCacheAndRestart();
}

define(function (require) {
    // Load compatibility shims--these need to load early, be careful moving this
    // Event dispatcher must be loaded before worker comm https://github.com/phcode-dev/phoenix/pull/678
    require(["utils/Metrics", "utils/Compatibility", "utils/EventDispatcher"], function () {
        window.Metrics = require("utils/Metrics");
        // Load the brackets module. This is a self-running module that loads and runs the entire application.
        require(["brackets"], ()=>{}, _recoverOnFailure);
    });
});
