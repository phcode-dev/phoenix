/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it under
 * the terms of the GNU Affero General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License along
 * with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

/*global logger*/

define(function (require, exports, module) {
    const EventDispatcher = require("utils/EventDispatcher"),
        PreferencesManager  = require("preferences/PreferencesManager"),
        Metrics = require("utils/Metrics"),
        Dialogs = require("widgets/Dialogs"),
        DefaultDialogs = require("widgets/DefaultDialogs"),
        Strings = require("strings"),
        NativeApp = require("utils/NativeApp"),
        ProfileMenu  = require("./profile-menu"),
        LoginService = require("./login-service"),
        Mustache = require("thirdparty/mustache/mustache"),
        NodeConnector = require("NodeConnector"),
        otpDialogTemplate = require("text!./html/otp-dialog.html");

    const KernalModeTrust = window.KernalModeTrust;
    if(!KernalModeTrust){
        // integrated extensions will have access to kernal mode, but not external extensions
        throw new Error("Login service should have access to KernalModeTrust. Cannot boot without trust ring");
    }
    const secureExports = {};
    // Only set loginService for native apps to avoid conflict with browser login
    if (Phoenix.isNativeApp) {
        KernalModeTrust.loginService = secureExports;
    }
    // user profile is something like "apiKey": "uuid...", validationCode: "dfdf", "firstName":"Aa","lastName":"bb",
    // "email":"aaaa@sss.com", "customerID":"uuid...","loginTime":1750074393853,
    // "profileIcon":{"color":"#14b8a6","initials":"AB"}
    let userProfile = null;
    let isLoggedInUser = false;

    // just used as trigger to notify different windows about user profile changes
    const PREF_USER_PROFILE_VERSION = "userProfileVersion";

    EventDispatcher.makeEventDispatcher(exports);
    EventDispatcher.makeEventDispatcher(secureExports);

    const _EVT_PAGE_FOCUSED = "page_focused";
    $(window).focus(function () {
        exports.trigger(_EVT_PAGE_FOCUSED);
    });

    const AUTH_CONNECTOR_ID = "ph_auth";
    const EVENT_CONNECTED = "connected";
    let authNodeConnector;
    if(Phoenix.isNativeApp) {
        authNodeConnector = NodeConnector.createNodeConnector(AUTH_CONNECTOR_ID, exports);
    }


    function isLoggedIn() {
        return isLoggedInUser;
    }

    function getProfile() {
        return userProfile;
    }

    /**
     * Get the account base URL for API calls
     * For desktop apps, this directly uses the configured account URL
     */
    function getAccountBaseURL() {
        return Phoenix.config.account_url.replace(/\/$/, ''); // Remove trailing slash
    }

    const ERR_RETRY_LATER = "retry_later";
    const ERR_INVALID = "invalid";

    /**
     * Resolves the provided API key and verification code to user profile data
     *
     * @param {string} apiKey - The API key to be validated.
     * @param {string} validationCode - The verification code associated with the API key.
     * @return {Promise<Object>} A promise resolving to an object containing the user details if successful,
     * or an error object with the relevant error code (`ERR_RETRY_LATER` or `ERR_INVALID`) if the operation fails.
     * never rejects.
     */
    async function _resolveAPIKey(apiKey, validationCode) {
        const resolveURL = `${Phoenix.config.account_url}resolveAppSessionID?appSessionID=${apiKey}&validationCode=${validationCode}`;
        if (!navigator.onLine) {
            return {err: ERR_RETRY_LATER};
        }
        try {
            const response = await fetch(resolveURL);
            if (response.status === 400 || response.status === 404) {
                // 404 api key not found and 400 Bad Request, eg: verification code mismatch
                return {err: ERR_INVALID};
            } else if (response.ok) {
                const userDetails = await response.json();
                userDetails.apiKey = apiKey;
                userDetails.validationCode = validationCode;
                return {userDetails};
            }
            // Other errors like 500 are retriable
            console.log('Other error:', response.status);
            return {err: ERR_RETRY_LATER};
        } catch (e) {
            console.error(e, "Failed to call resolve API endpoint", resolveURL);
            return {err: ERR_RETRY_LATER};
        }
    }

    async function _resetAccountLogin() {
        isLoggedInUser = false;
        ProfileMenu.setNotLoggedIn();
        await KernalModeTrust.removeCredential(KernalModeTrust.CRED_KEY_API);
        // bump the version so that in multi windows, the other window gets notified of the change
        PreferencesManager.stateManager.set(PREF_USER_PROFILE_VERSION, crypto.randomUUID());
    }

    async function _verifyLogin(silentCheck = false) {
        const savedUserProfile = await KernalModeTrust.getCredential(KernalModeTrust.CRED_KEY_API);
        if(!savedUserProfile){
            console.log("No savedUserProfile found. Not logged in");
            if (!silentCheck) {
                ProfileMenu.setNotLoggedIn();
            }
            isLoggedInUser = false;
            return;
        }
        try {
            userProfile = JSON.parse(savedUserProfile);
        } catch (e) {
            console.error(e, "Failed to parse saved user profile credentials");// this should never happen
            if (!silentCheck) {
                ProfileMenu.setNotLoggedIn();
            }
            return; // not logged in if parse fails
        }
        isLoggedInUser = true;
        // api key is present, verify if the key is valid. but just show user that we are logged in with
        // stored credentials.
        ProfileMenu.setLoggedIn(userProfile.profileIcon.initials, userProfile.profileIcon.color);
        const resolveResponse = await _resolveAPIKey(userProfile.apiKey, userProfile.validationCode);
        if(resolveResponse.userDetails) {
            // a valid user account is in place. update the stored credentials
            userProfile = resolveResponse.userDetails;
            ProfileMenu.setLoggedIn(userProfile.profileIcon.initials, userProfile.profileIcon.color);
            await KernalModeTrust.setCredential(KernalModeTrust.CRED_KEY_API, JSON.stringify(userProfile));
            // we dont need to bump the PREF_USER_PROFILE_VERSION here as its just a cred update
            // (maybe name) and may lead to infi loops.
            return;
        }
        // some error happened.
        if(resolveResponse.err === ERR_INVALID) { // the api key is invalid, we need to logout and tell user
            _resetAccountLogin()
                .catch(console.error);
            Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_ERROR,
                Strings.SIGNED_OUT,
                Strings.SIGNED_OUT_MESSAGE
            );
        }
        // maybe some intermittent network error, ERR_RETRY_LATER is here. do nothing
    }

    function _getAutoAuthPortURL() {
        const localAutoAuthURL = KernalModeTrust.localAutoAuthURL; // Eg: http://localhost:33577/AutoAuthDI0zAUJo
        if(!localAutoAuthURL) {
            return "9797/urlDoesntExist";
        }
        return localAutoAuthURL.replace("http://localhost:", "");
    }

    const PLATFORM_STRINGS = {
        "win": "Windows",
        "mac": "mac",
        "linux": "Linux"
    };
    // never rejects.
    async function _getAppAuthSession() {
        const authPortURL = _getAutoAuthPortURL();
        const platformStr = PLATFORM_STRINGS[Phoenix.platform] || Phoenix.platform;
        const appName = encodeURIComponent(`${Strings.APP_NAME} Desktop on ${platformStr}`);
        const resolveURL = `${Phoenix.config.account_url}getAppAuthSession?autoAuthPort=${authPortURL}&appName=${appName}`;
        // {"isSuccess":true,"appSessionID":"a uuid...","validationCode":"SWXP07"}
        try {
            const response = await fetch(resolveURL);
            if (response.ok) {
                const {appSessionID, validationCode} = await response.json();
                if(!appSessionID || !validationCode) {
                    throw new Error("Invalid response from getAppAuthSession API endpoint" + resolveURL);
                }
                return {appSessionID, validationCode};
            }
            return null;
        } catch (e) {
            console.error(e, "Failed to call getAppAuthSession API endpoint", resolveURL);
            Metrics.countEvent(Metrics.EVENT_TYPE.AUTH, 'getAppAuth', Phoenix.platform);
            logger.reportError(e, "Failed to call getAppAuthSession API endpoint" + resolveURL);
            return null;
        }
    }

    async function setAutoVerificationCode(validationCode) {
        const TIMEOUT_MS = 1000;
        try {
            await Promise.race([
                authNodeConnector.execPeer("setVerificationCode", validationCode),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS))
            ]);
        } catch (e) {
            console.error("failed to send auth login verification code to node", e);
            // we ignore this and continue for manual verification
            Metrics.countEvent(Metrics.EVENT_TYPE.AUTH, 'autoFail', Phoenix.platform);
        }
    }

    async function signInToAccount() {
        if (!navigator.onLine) {
            Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_ERROR,
                Strings.SIGNED_IN_OFFLINE_TITLE,
                Strings.SIGNED_IN_OFFLINE_MESSAGE
            );
            return;
        }
        const appAuthSession = await _getAppAuthSession();
        if(!appAuthSession) {
            Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_ERROR,
                Strings.SIGNED_IN_FAILED_TITLE,
                Strings.SIGNED_IN_FAILED_MESSAGE
            );
            return;
        }
        const {appSessionID, validationCode} = appAuthSession;
        await setAutoVerificationCode(validationCode);
        const appSignInURL = `${Phoenix.config.account_url}authorizeApp?appSessionID=${appSessionID}`;

        // Show dialog with validation code
        const dialogData = {
            validationCode: validationCode,
            Strings: Strings
        };

        const $template = $(Mustache.render(otpDialogTemplate, dialogData));
        const dialog = Dialogs.showModalDialogUsingTemplate($template);

        // Set timeout to close dialog after 5 minutes, as validity is only 5 mins
        const closeTimeout = setTimeout(() => {
            dialog.close();
        }, 5 * 60 * 1000);

        // Handle button clicks
        $template.on('click', '[data-button-id="copy"]', function() {
            Phoenix.app.copyToClipboard(validationCode);

            // Show "Copied" feedback
            const $validationCodeSpan = $template.find('.validation-code span');
            const originalText = $validationCodeSpan.text();

            // Replace validation code with "Copied" text
            $validationCodeSpan.text(Strings.VALIDATION_CODE_COPIED);

            // Restore original validation code after 1.5 seconds
            setTimeout(() => {
                $validationCodeSpan.text(originalText);
            }, 1500);
        });

        $template.on('click', '[data-button-id="open"]', function() {
            NativeApp.openURLInDefaultBrowser(appSignInURL);
        });
        $template.on('click', '[data-button-id="cancel"]', function() {
            dialog.close();
        });
        $template.on('click', '[data-button-id="refresh"]', function() {
            checkLoginStatus();
        });

        let checking = false, checkAgain = false;
        // never rejects
        async function checkLoginStatus() {
            if(checking) {
                checkAgain = true;
                return;
            }
            checking = true;
            try {
                const resolveResponse = await _resolveAPIKey(appSessionID, validationCode);
                if(resolveResponse.userDetails) {
                    // the user has validated the creds
                    userProfile = resolveResponse.userDetails;
                    ProfileMenu.setLoggedIn(userProfile.profileIcon.initials, userProfile.profileIcon.color);
                    await KernalModeTrust.setCredential(KernalModeTrust.CRED_KEY_API, JSON.stringify(userProfile));
                    // bump the version so that in multi windows, the other window gets notified of the change
                    PreferencesManager.stateManager.set(PREF_USER_PROFILE_VERSION, crypto.randomUUID());
                    checkAgain = false;
                    isLoggedInUser = true;
                    dialog.close();
                }
            } catch (e) {
                console.error("Failed to check login status.", e);
            }
            checking = false;
            if(checkAgain) {
                checkAgain = false;
                setTimeout(checkLoginStatus, 100);
            }
        }
        let isAutoSignedIn = false;
        exports.on(_EVT_PAGE_FOCUSED, checkLoginStatus);
        async function _AutoSignedIn() {
            isAutoSignedIn = true;
            await checkLoginStatus();
        }
        authNodeConnector.one(EVENT_CONNECTED, _AutoSignedIn);

        // Clean up when dialog is closed
        dialog.done(function() {
            exports.off(_EVT_PAGE_FOCUSED, checkLoginStatus);
            authNodeConnector.off(EVENT_CONNECTED, _AutoSignedIn);
            clearTimeout(closeTimeout);
            Metrics.countEvent(Metrics.EVENT_TYPE.AUTH,
                isAutoSignedIn ? 'autoLogin' : 'manLogin'
                , Phoenix.platform);
            Metrics.countEvent(Metrics.EVENT_TYPE.AUTH, "dsktpLogin",
                isAutoSignedIn ? 'auto' : 'man');
        });
        NativeApp.openURLInDefaultBrowser(appSignInURL);
    }

    async function signOutAccount() {
        const resolveURL = `${Phoenix.config.account_url}logoutSession`;
        try {
            let input = {
                appSessionID: userProfile.apiKey
            };

            const response = await fetch(resolveURL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(input)
            });

            const result = await response.json();

            if (!result.isSuccess) {
                console.error('Error logging out', result);
                const dialog = Dialogs.showModalDialog(
                    DefaultDialogs.DIALOG_ID_ERROR,
                    Strings.SIGNED_OUT_FAILED_TITLE,
                    Strings.SIGNED_OUT_FAILED_MESSAGE
                );
                dialog.done(() => {
                    NativeApp.openURLInDefaultBrowser(Phoenix.config.account_url + "#advanced");
                });
                Metrics.countEvent(Metrics.EVENT_TYPE.AUTH, 'logoutFail', Phoenix.platform);
                return;
            }
            await _resetAccountLogin();
            Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_INFO,
                Strings.SIGNED_OUT,
                Strings.SIGNED_OUT_MESSAGE_FRIENDLY
            );
            Metrics.countEvent(Metrics.EVENT_TYPE.AUTH, 'logoutOK', Phoenix.platform);
        } catch (error) {
            console.error("Network error. Could not log out session.", error);
            const dialog = Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_ERROR,
                Strings.SIGNED_OUT_FAILED_TITLE,
                Strings.SIGNED_OUT_FAILED_MESSAGE
            );
            dialog.done(() => {
                NativeApp.openURLInDefaultBrowser(Phoenix.config.account_url + "#advanced");
            });
            Metrics.countEvent(Metrics.EVENT_TYPE.AUTH, 'getAppAuth', Phoenix.platform);
            logger.reportError(error, "Failed to call logout calling" + resolveURL);
        }
    }

    function init() {
        if(!Phoenix.isNativeApp){
            console.log("Desktop login service not needed for browser");
            return;
        }
        ProfileMenu.init();
        _verifyLogin(true).catch(console.error);// todo raise metrics - silent check on init
        const pref = PreferencesManager.stateManager.definePreference(PREF_USER_PROFILE_VERSION, 'string', '0');
        pref.watchExternalChanges();
        pref.on('change', _verifyLogin);
    }

    // no sensitive apis or events should be triggered from the public exports of this module as extensions
    // can read them. Always use KernalModeTrust.loginService for sensitive apis.

    // Only set exports for native apps to avoid conflict with browser login
    if (Phoenix.isNativeApp) {
        init();
        // kernal exports
        secureExports.isLoggedIn = isLoggedIn;
        secureExports.signInToAccount = signInToAccount;
        secureExports.signOutAccount = signOutAccount;
        secureExports.getProfile = getProfile;
        secureExports.verifyLoginStatus = () => _verifyLogin(false);
        secureExports.getAccountBaseURL = getAccountBaseURL;
        secureExports.getEntitlements = LoginService.getEntitlements;
        secureExports.EVENT_ENTITLEMENTS_CHANGED = LoginService.EVENT_ENTITLEMENTS_CHANGED;
    }

    // public exports
    exports.isLoggedIn = isLoggedIn;

});
