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


define(function (require, exports, module) {
    const EventDispatcher = require("utils/EventDispatcher"),
        PreferencesManager  = require("preferences/PreferencesManager"),
        Dialogs = require("widgets/Dialogs"),
        DefaultDialogs = require("widgets/DefaultDialogs"),
        Strings = require("strings"),
        NativeApp = require("utils/NativeApp"),
        ProfileMenu  = require("./profile-menu"),
        Mustache = require("thirdparty/mustache/mustache"),
        otpDialogTemplate = require("text!./html/otp-dialog.html");

    const KernalModeTrust = window.KernalModeTrust;
    if(!KernalModeTrust){
        // integrated extensions will have access to kernal mode, but not external extensions
        throw new Error("Login service should have access to KernalModeTrust. Cannot boot without trust ring");
    }
    const secureExports = {};
    KernalModeTrust.loginService = secureExports;
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


    function isLoggedIn() {
        return isLoggedInUser;
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

    async function _verifyLogin() {
        const savedUserProfile = await KernalModeTrust.getCredential(KernalModeTrust.CRED_KEY_API);
        if(!savedUserProfile){
            console.log("No savedUserProfile found. Not logged in");
            ProfileMenu.setNotLoggedIn();
            return;
        }
        try {
            userProfile = JSON.parse(savedUserProfile);
        } catch (e) {
            console.error(e, "Failed to parse saved user profile credentials");// this should never happen
            ProfileMenu.setNotLoggedIn();
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
            return;
        }
        // some error happened.
        if(resolveResponse.err === ERR_INVALID) { // the api key is invalid, we need to logout and tell user
            isLoggedInUser = false;
            ProfileMenu.setNotLoggedIn();
            Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_ERROR,
                Strings.SIGNED_OUT,
                Strings.SIGNED_OUT_MESSAGE
            );
            await KernalModeTrust.removeCredential(KernalModeTrust.CRED_KEY_API);
        }
        // maybe some intermittent network error, ERR_RETRY_LATER is here. do nothing
    }

    // never rejects.
    async function _getAppAuthSession() {
        const authPortURL = "9797/abc"; // todo autho auth later
        const appName = encodeURIComponent(`${Strings.APP_NAME} Desktop on ${Phoenix.platform}`);
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
            // todo raise metrics/log
            return null;
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

        let checking = false, checkAgain = false;
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
        exports.on(_EVT_PAGE_FOCUSED, checkLoginStatus);

        // Clean up when dialog is closed
        dialog.done(function() {
            exports.off(_EVT_PAGE_FOCUSED, checkLoginStatus);
            clearTimeout(closeTimeout);
        });
        NativeApp.openURLInDefaultBrowser(appSignInURL);
    }

    function init() {
        ProfileMenu.init();
        if(!Phoenix.isNativeApp){
            console.warn("Login service is not supported in browser");
            return;
        }
        _verifyLogin().catch(console.error);// todo raise metrics
        const pref = PreferencesManager.stateManager.definePreference(PREF_USER_PROFILE_VERSION, 'string', '0')
            .watchExternalChanges();

    }

    init();

    // no sensitive apis or events should be triggered from the public exports of this module as extensions
    // can read them. Always use KernalModeTrust.loginService for sensitive apis.

    // kernal exports
    secureExports.isLoggedIn = isLoggedIn;
    secureExports.signInToAccount = signInToAccount;

    // public exports
    exports.isLoggedIn = isLoggedIn;

});
