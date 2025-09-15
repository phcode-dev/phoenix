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
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */

/*global logger*/

/**
 * Phoenix Browser Login Service
 *
 * This module handles user authentication for Phoenix browser applications.
 * It integrates with the Phoenix login service to provide secure authentication
 * across the phcode.dev domain ecosystem.
 *
 * IMPORTANT: For detailed setup instructions, development workflows, and
 * troubleshooting guide, see: src/services/login-service-no_dist.md
 *
 * Key Features:
 * - Domain-wide session management using 'session' cookie at .phcode.dev level
 * - Proxy server support for localhost development (serve-proxy.js)
 * - Support for both production (account.phcode.dev) and custom login servers
 * - Automatic session validation and user profile management
 *
 * Development Notes:
 * - Production: Uses account.phcode.dev directly with domain-wide cookies
 * - Development: Uses /proxy/accounts route through serve-proxy.js for localhost:8000 to account.phcode.dev
 * - Session cookies must be manually copied from account.phcode.dev to localhost for testing
 *
 * @see src/services/login-service-no_dist.md for comprehensive documentation
 */

define(function (require, exports, module) {
    require("./login-service"); // after this, loginService will be in KernalModeTrust
    const PreferencesManager  = require("preferences/PreferencesManager"),
        Metrics = require("utils/Metrics"),
        Dialogs = require("widgets/Dialogs"),
        DefaultDialogs = require("widgets/DefaultDialogs"),
        Strings = require("strings"),
        StringUtils = require("utils/StringUtils"),
        ProfileMenu  = require("./profile-menu"),
        Mustache = require("thirdparty/mustache/mustache"),
        browserLoginWaitingTemplate = require("text!./html/browser-login-waiting-dialog.html");

    const KernalModeTrust = window.KernalModeTrust;
    if(!KernalModeTrust){
        // integrated extensions will have access to kernal mode, but not external extensions
        throw new Error("Browser Login service should have access to KernalModeTrust. Cannot boot without trust ring");
    }
    const LoginService = KernalModeTrust.loginService;

    // user profile structure: "customerID": "uuid...", "firstName":"Aa","lastName":"bb",
    // "email":"aaaa@sss.com", "loginTime":1750074393853, "isSuccess": true,
    // "profileIcon":{"color":"#14b8a6","initials":"AB"}
    let userProfile = null;
    let isLoggedInUser = false;

    // just used as trigger to notify different windows about user profile changes
    const PREF_USER_PROFILE_VERSION = "userProfileVersion";

    function isLoggedIn() {
        return isLoggedInUser;
    }

    function getProfile() {
        return userProfile;
    }

    /**
     * Get the base URL for account API calls
     * Uses proxy routes for localhost, direct URL otherwise
     */
    function _getAccountBaseURL() {
        if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
            return '/proxy/accounts';
        }
        return Phoenix.config.account_url.replace(/\/$/, ''); // Remove trailing slash
    }

    /**
     * Get the account website URL for opening browser tabs
     */
    function _getAccountWebURL() {
        return Phoenix.config.account_url;
    }

    const ERR_RETRY_LATER = "retry_later";
    const ERR_INVALID = "invalid";
    const ERR_NOT_LOGGED_IN = "not_logged_in";

    // save a copy of window.fetch so that extensions wont tamper with it.
    let fetchFn = window.fetch;

    /**
     * Resolve browser session using cookies
     * @return {Promise<Object>} A promise resolving to user profile or error object
     */
    async function _resolveBrowserSession() {
        const resolveURL = `${_getAccountBaseURL()}/resolveBrowserSession`;
        if (!navigator.onLine) {
            return {err: ERR_RETRY_LATER};
        }
        try {
            const response = await fetchFn(resolveURL, {
                method: 'GET',
                credentials: 'include', // Include cookies
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (response.status === 401 || response.status === 403 || response.status === 404) {
                // Not logged in or session expired
                return {err: ERR_NOT_LOGGED_IN};
            } else if (response.status === 400) {
                return {err: ERR_INVALID};
            } else if (response.ok) {
                const userDetails = await response.json();
                if (userDetails.isSuccess) {
                    return {userDetails};
                } else {
                    return {err: ERR_NOT_LOGGED_IN};
                }
            }
            // Other errors like 500 are retriable
            console.log('Browser session resolve error:', response.status);
            return {err: ERR_RETRY_LATER};
        } catch (e) {
            console.error(e, "Failed to call resolveBrowserSession endpoint", resolveURL);
            return {err: ERR_RETRY_LATER};
        }
    }

    async function _resetBrowserLogin() {
        isLoggedInUser = false;
        userProfile = null;
        ProfileMenu.setNotLoggedIn();
        // bump the version so that in multi windows, the other window gets notified of the change
        PreferencesManager.stateManager.set(PREF_USER_PROFILE_VERSION, crypto.randomUUID());
    }

    /**
     * Calls remote resolveBrowserSession endpoint to verify login status. should not be used frequently.
     * @param silentCheck
     * @returns {Promise<void>}
     * @private
     */
    async function _verifyBrowserLogin(silentCheck = false) {
        console.log("Verifying browser login status...");

        const resolveResponse = await _resolveBrowserSession();
        if(resolveResponse.userDetails) {
            // User is logged in
            userProfile = resolveResponse.userDetails;
            isLoggedInUser = true;
            ProfileMenu.setLoggedIn(userProfile.profileIcon.initials, userProfile.profileIcon.color);
            console.log("Browser login verified for:", userProfile.email);
            Metrics.countEvent(Metrics.EVENT_TYPE.AUTH, "browser", "OKLogin");
            return;
        }

        // User is not logged in or error occurred if here
        if(resolveResponse.err === ERR_NOT_LOGGED_IN) {
            console.log("No browser session found. Not logged in");
            Metrics.countEvent(Metrics.EVENT_TYPE.AUTH, "browser", "NotLoggedIn");
            _handleLoginError(silentCheck);
            return;
        }

        if (resolveResponse.err === ERR_INVALID) {
            console.log("Invalid auth token, resetting login state");
            Metrics.countEvent(Metrics.EVENT_TYPE.AUTH, "browser", "invalidLogin");
            _handleLoginError(silentCheck);
            return;
        }

        // Other errors (network, retry later, etc.)
        console.log("Browser login verification failed (temporary):", resolveResponse.err);
        Metrics.countEvent(Metrics.EVENT_TYPE.AUTH, "browser", "RetryLogin");
        // Don't reset login state for temporary errors, regardless of silent check
    }

    function _handleLoginError(silentCheck) {
        if (!silentCheck) {
            _resetBrowserLogin();
        } else {
            // For silent checks, just update the internal state
            isLoggedInUser = false;
            userProfile = null;
        }
    }

    let loginWaitingDialog = null;

    /**
     * Show waiting dialog with auto-detection and manual check options
     */
    function _showLoginWaitingDialog() {
        if (loginWaitingDialog) {
            return; // Already showing
        }

        // Prepare dialog data with fallback strings
        const dialogData = {
            Strings: {
                SIGN_IN_WAITING_TITLE: Strings.SIGN_IN_WAITING_TITLE,
                SIGN_IN_WAITING_MESSAGE: Strings.SIGN_IN_WAITING_MESSAGE,
                WAITING_FOR_LOGIN: Strings.WAITING_FOR_LOGIN,
                CHECK_NOW: Strings.CHECK_NOW,
                CANCEL: Strings.CANCEL
            }
        };

        const $template = $(Mustache.render(browserLoginWaitingTemplate, dialogData));
        loginWaitingDialog = Dialogs.showModalDialogUsingTemplate($template);

        // Handle Check Now button
        $template.on('click', '[data-button-id="check"]', async function() {
            const $btn = $(this);
            const originalText = $btn.text();
            $btn.prop('disabled', true).text(Strings.CHECKING);
            $template.find('#login-status').text(Strings.CHECKING_STATUS);

            await _verifyBrowserLogin();

            if (isLoggedInUser) {
                _onLoginSuccess();
            } else {
                $template.find('#login-status').text(Strings.NOT_SIGNED_IN_YET);
                $btn.prop('disabled', false).text(originalText);
            }
        });

        // Handle Cancel button
        $template.on('click', '[data-button-id="cancel"]', function() {
            loginWaitingDialog.close();
        });

        // Auto-check when page gains focus
        const onFocusCheck = async () => {
            if (loginWaitingDialog && !isLoggedInUser) {
                $template.find('#login-status').text(Strings.CHECKING_STATUS);
                await _verifyBrowserLogin();

                if (isLoggedInUser) {
                    _onLoginSuccess();
                }
            }
        };

        $(window).off('focus.loginWaiting');
        $(window).on('focus.loginWaiting', onFocusCheck);

        // Clean up when dialog closes
        loginWaitingDialog.done(() => {
            _cancelLoginWaiting();
        });
    }

    function _onLoginSuccess() {
        if (loginWaitingDialog) {
            const $template = loginWaitingDialog.getElement();
            const welcomeBackMessage = Phoenix.isNativeApp ?
                StringUtils.format(Strings.WELCOME_BACK_USER, userProfile.firstName): Strings.WELCOME_BACK;
            // in desktop app, the apis return full username so we can show `Welcome back, alice`, but in
            // browser app, we only get name like `a***` due to security posture, so we show `Welcome back` in browser.
            $template.find('#login-status')
                .text(welcomeBackMessage)
                .css('color', '#10b981');
            setTimeout(() => {
                _cancelLoginWaiting();
                Metrics.countEvent(Metrics.EVENT_TYPE.AUTH, "browserLogin", "browser");
            }, 1500);
        }
    }

    function _cancelLoginWaiting() {
        if (loginWaitingDialog) {
            loginWaitingDialog.close();
            loginWaitingDialog = null;
        }
        $(window).off('focus.loginWaiting');
    }

    /**
     * Open browser-based sign-in in new tab
     */
    async function signInToBrowser() {
        if (!navigator.onLine) {
            Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_ERROR,
                Strings.SIGNED_IN_OFFLINE_TITLE,
                Strings.SIGNED_IN_OFFLINE_MESSAGE
            );
            return;
        }

        const accountURL = _getAccountWebURL();

        // Open account URL in new tab
        const newTab = window.open(accountURL, '_blank');

        if (!newTab) {
            Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_ERROR,
                Strings.SIGNED_IN_FAILED_TITLE,
                StringUtils.format(Strings.POPUP_BLOCKED, accountURL)
            );
            return;
        }

        // Show dialog with better UX - auto-detect when user returns
        _showLoginWaitingDialog();

        Metrics.countEvent(Metrics.EVENT_TYPE.AUTH, "browserLoginAttempt", "browser");
    }

    /**
     * Sign out from browser session
     */
    async function signOutBrowser() {
        const logoutURL = `${_getAccountBaseURL()}/signOut`;
        try {
            const response = await fetchFn(logoutURL, {
                method: 'POST',
                credentials: 'include', // Include cookies
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({})
            });

            // Always reset local state regardless of server response
            await _resetBrowserLogin();

            if (response.ok) {
                const result = await response.json();
                if (result.isSuccess) {
                    Dialogs.showModalDialog(
                        DefaultDialogs.DIALOG_ID_INFO,
                        Strings.SIGNED_OUT,
                        Strings.SIGNED_OUT_MESSAGE_FRIENDLY
                    );
                    Metrics.countEvent(Metrics.EVENT_TYPE.AUTH, 'browserLogoutOK', 'browser');
                    return;
                }
            }

            // If we get here, there was some issue but we still signed out locally
            console.warn('Logout may not have completed on server, but signed out locally');
            const dialog = Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_ERROR,
                Strings.SIGNED_OUT_FAILED_TITLE,
                Strings.SIGNED_OUT_FAILED_MESSAGE
            );
            dialog.done(() => {
                window.open(_getAccountWebURL() + "#advanced", '_blank');
            });
            Metrics.countEvent(Metrics.EVENT_TYPE.AUTH, 'browserLogoutPartial', 'browser');

        } catch (error) {
            // Always reset local state even on network error
            await _resetBrowserLogin();
            console.error("Network error during logout:", error);
            const dialog = Dialogs.showModalDialog(
                DefaultDialogs.DIALOG_ID_ERROR,
                Strings.SIGNED_OUT_FAILED_TITLE,
                Strings.SIGNED_OUT_FAILED_MESSAGE
            );
            dialog.done(() => {
                window.open(_getAccountWebURL() + "#advanced", '_blank');
            });
            Metrics.countEvent(Metrics.EVENT_TYPE.AUTH, 'browserLogoutError', 'browser');
        }
    }

    function init() {
        ProfileMenu.init();
        if(Phoenix.isNativeApp){
            console.log("Browser login service is not needed for native app");
            return;
        }

        // Always verify login on browser app start
        _verifyBrowserLogin().catch(console.error);

        // Watch for profile changes from other windows/tabs
        const pref = PreferencesManager.stateManager.definePreference(PREF_USER_PROFILE_VERSION, 'string', '0');
        pref.watchExternalChanges();
        pref.on('change', ()=>{
            _verifyBrowserLogin(true).catch(console.error);
        });

        // Note: We don't do automatic verification on page focus to avoid server overload.
        // Automatic checks are only done during the login waiting dialog period.
    }

    // no sensitive apis or events should be triggered from the public exports of this module as extensions
    // can read them. Always use KernalModeTrust.loginService for sensitive apis.

    // Only set exports for browser apps to avoid conflict with desktop login
    if (!Phoenix.isNativeApp) {
        // kernal exports
        // Add to existing KernalModeTrust.loginService from login-service.js
        LoginService.isLoggedIn = isLoggedIn;
        LoginService.signInToAccount = signInToBrowser;
        LoginService.signOutAccount = signOutBrowser;
        LoginService.getProfile = getProfile;
        // verifyLoginStatus Calls remote resolveBrowserSession endpoint to verify. should not be used frequently.
        // All users are required to use isLoggedIn API instead.
        LoginService._verifyLoginStatus = () => _verifyBrowserLogin(false);
        LoginService.getAccountBaseURL = _getAccountBaseURL;
        init();
    }

    // Test-only exports for integration testing
    if (Phoenix.isTestWindow) {
        window._test_login_browser_exports = {
            setFetchFn: function _setFetchFn(fn) {
                fetchFn = fn;
            }
        };
    }

    // public exports
    exports.isLoggedIn = isLoggedIn;

});
