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

/*global path*/

/**
 * Shared Login Service
 *
 * This module contains shared login service functionality used by both
 * browser and desktop login implementations, including entitlements management.
 */

define(function (require, exports, module) {
    require("./setup-login-service"); // this adds loginService to KernalModeTrust
    require("./promotions");
    require("./login-utils");
    const EntitlementsDirectImport = require("./entitlements"); // this adds Entitlements to KernalModeTrust

    const Metrics = require("utils/Metrics"),
        Strings = require("strings");

    const MS_IN_DAY = 10 * 24 * 60 * 60 * 1000;
    const TEN_MINUTES = 10 * 60 * 1000;
    const FREE_PLAN_VALIDITY_DAYS = 10000;

    // the fallback salt is always a constant as this will only fail in rare circumstatnces and it needs to
    // be exactly same across versions of the app. Changing this will not affect the large majority of users and
    // for the ones who are affected, the app will reset the signed data with new salt but will not grant ant trial
    // when tampering is detected.
    const FALLBACK_SALT = 'fallback-salt-2f309322-b32d-4d59-85b4-2baef666a9f4';
    let currentSalt;

    // Cache file path for desktop app entitlements
    const CACHED_ENTITLEMENTS_FILE = path.join(Phoenix.app.getApplicationSupportDirectory(),
        "cached_entitlements.json");

    // save a copy of window.fetch so that extensions wont tamper with it.
    let fetchFn = window.fetch;
    let dateNowFn = Date.now;

    const KernalModeTrust = window.KernalModeTrust;
    if(!KernalModeTrust){
        // integrated extensions will have access to kernal mode, but not external extensions
        throw new Error("Login service should have access to KernalModeTrust. Cannot boot without trust ring");
    }

    const LoginService = KernalModeTrust.loginService;

    // Event constants
    const EVENT_ENTITLEMENTS_CHANGED = "entitlements_changed";

    // Cached entitlements data
    let cachedEntitlements = null;

    // Last recorded state for entitlements monitoring
    let lastRecordedState = null;

    // Debounced trigger for entitlements changed
    let entitlementsChangedTimer = null;

    function _debounceEntitlementsChanged() {
        if (entitlementsChangedTimer) {
            // already scheduled, skip
            return;
        }

        entitlementsChangedTimer = setTimeout(() => {
            LoginService.trigger(EVENT_ENTITLEMENTS_CHANGED);
            entitlementsChangedTimer = null;
        }, 1000); // atmost 1 entitlement changed event will be triggered in a second
    }


    /**
     * Get per-user salt for signature generation, creating and persisting one if it doesn't exist
     * Used for signing cached data to prevent tampering
     */
    async function getSalt() {
        // Fallback salt constant for rare circumstances where salt generation fails
        if(currentSalt) {
            return currentSalt;
        }

        try {
            if (Phoenix.isNativeApp) {
                // Native app: use KernalModeTrust credential store
                let salt = await KernalModeTrust.getCredential(KernalModeTrust.SIGNATURE_SALT_KEY);
                if (!salt) {
                    // Generate and store new salt
                    salt = crypto.randomUUID();
                    await KernalModeTrust.setCredential(KernalModeTrust.SIGNATURE_SALT_KEY, salt);
                }
                currentSalt = salt;
                return salt;
            }
            // In browser app, there is no way to securely store salt without extensions being able to
            // read it. Return a static salt for basic integrity checking.
            currentSalt = FALLBACK_SALT;
            return FALLBACK_SALT;
        } catch (error) {
            console.error("Error getting signature salt:", error);
            // Return a fallback salt to prevent crashes
            Metrics.countEvent(Metrics.EVENT_TYPE.AUTH, "saltGet", "Err");
            currentSalt = FALLBACK_SALT;
            return FALLBACK_SALT;
        }
    }

    /**
     * Load cached entitlements from disk with signature validation
     * Returns null if no cache, invalid signature, or error
     */
    async function _loadCachedEntitlements() {
        if (!Phoenix.isNativeApp) {
            return null; // No caching for browser app
        }

        try {
            const fileData = await Phoenix.VFS.readFileResolves(CACHED_ENTITLEMENTS_FILE, 'utf8');

            if (fileData.error || !fileData.data) {
                return null; // No cached file exists
            }

            const cachedData = JSON.parse(fileData.data);
            if (!cachedData.jsonData || !cachedData.sign) {
                console.warn("Invalid cached entitlements format - missing jsonData or sign");
                await _clearCachedEntitlements();
                return null;
            }

            // Validate signature
            const salt = await getSalt();
            const isValidSignature = await KernalModeTrust.validateDataSignature(
                cachedData.jsonData,
                cachedData.sign,
                salt
            );

            if (!isValidSignature) {
                console.warn("Cached entitlements signature validation failed - possible tampering detected");
                Metrics.countEvent(Metrics.EVENT_TYPE.PRO, "entCacheLD", "signInvalid");
                await _clearCachedEntitlements();
                return null;
            }

            // Parse and return the entitlements
            return JSON.parse(cachedData.jsonData);
        } catch (error) {
            console.error("Error loading cached entitlements:", error);
            Metrics.countEvent(Metrics.EVENT_TYPE.PRO, "entCacheLD", "error");
            await _clearCachedEntitlements(); // Clear corrupted cache
            return null;
        }
    }

    /**
     * Save entitlements to cache with signature
     */
    async function _saveCachedEntitlements(entitlements) {
        if (!Phoenix.isNativeApp || !entitlements) {
            return; // No caching for browser app
        }

        try {
            const jsonData = JSON.stringify(entitlements);
            const salt = await getSalt();
            const signature = await KernalModeTrust.generateDataSignature(jsonData, salt);

            const cacheData = {
                jsonData: jsonData,
                sign: signature
            };

            await Phoenix.VFS.writeFileAsync(CACHED_ENTITLEMENTS_FILE, JSON.stringify(cacheData), 'utf8');
            console.log("Entitlements cached successfully");
        } catch (error) {
            Metrics.countEvent(Metrics.EVENT_TYPE.PRO, "entCacheSave", "err");
            console.error("Error saving cached entitlements:", error);
        }
    }

    /**
     * Clear cached entitlements file
     */
    async function _clearCachedEntitlements() {
        if (!Phoenix.isNativeApp) {
            return; // No caching for browser app
        }

        try {
            await Phoenix.VFS.unlinkResolves(CACHED_ENTITLEMENTS_FILE);
            console.log("Cached entitlements cleared");
        } catch (error) {
            console.log("Error clearing cached entitlements:", error);
        }
    }


    /**
     * Get entitlements from API or disc cache.
     * @param {string} forceRefresh If provided will always fetch from server and bypass cache. Use rarely like
     *      when a user logs in/out/some other user activity/ account-related events.
     * Returns null if the user is not logged in
     */
    async function getEntitlements(forceRefresh = false) {
        // Return null if not logged in
        if (!LoginService.isLoggedIn()) {
            return null;
        }

        // Return cached data if available and not forcing refresh
        if (cachedEntitlements && !forceRefresh) {
            return cachedEntitlements;
        }

        if (cachedEntitlements && !navigator.onLine) {
            return cachedEntitlements;
        }

        async function _processDiscCachedEntitlement() {
            const diskCachedEntitlements = await _loadCachedEntitlements();
            if (diskCachedEntitlements) {
                console.log("offline/network/server error: Using cached entitlements from disk");
                const entitlementsChanged =
                    JSON.stringify(cachedEntitlements) !== JSON.stringify(diskCachedEntitlements);
                cachedEntitlements = diskCachedEntitlements;
                // Trigger event if entitlements changed
                if (entitlementsChanged) {
                    _debounceEntitlementsChanged();
                }
                return cachedEntitlements;
            }
            return null;
        }

        try {
            const accountBaseURL = LoginService.getAccountBaseURL();
            const language = brackets.getLocale();
            const currentVersion = window.AppConfig.apiVersion || "1.0.0";
            let url = `${accountBaseURL}/getAppEntitlements?lang=${language}&version=${currentVersion}`+
                `&platform=${Phoenix.platform}&appType=${Phoenix.isNativeApp ? "desktop" : "browser"}}`;
            let fetchOptions = {
                method: 'GET',
                headers: {
                    'Accept': 'application/json'
                }
            };

            // Handle different authentication methods for browser vs desktop
            if (Phoenix.isNativeApp) {
                // Desktop app: use appSessionID and validationCode
                const profile = LoginService.getProfile();
                if (profile && profile.apiKey && profile.validationCode) {
                    url += `&appSessionID=${encodeURIComponent(profile.apiKey)}&validationCode=${encodeURIComponent(profile.validationCode)}`;
                } else {
                    console.error('Missing appSessionID or validationCode for desktop app entitlements');
                    return null;
                }
            } else {
                // Browser app: use session cookies
                fetchOptions.credentials = 'include';
            }

            // For desktop app, if offline, try to return disc cached entitlements
            if (Phoenix.isNativeApp && !navigator.onLine) {
                const processedEntitlement = await _processDiscCachedEntitlement();
                if (processedEntitlement) {
                    return processedEntitlement;
                }
            }

            const response = await fetchFn(url, fetchOptions);

            if (response.ok) {
                const result = await response.json();
                if (result.isSuccess) {
                    // Check if entitlements actually changed
                    const entitlementsChanged = JSON.stringify(cachedEntitlements) !== JSON.stringify(result);

                    cachedEntitlements = result;

                    // Save to disk cache for desktop app
                    if (Phoenix.isNativeApp) {
                        await _saveCachedEntitlements(result);
                    }

                    // Trigger event if entitlements changed
                    if (entitlementsChanged) {
                        _debounceEntitlementsChanged();
                    }

                    return cachedEntitlements;
                }
            } else if (response.status >= 500 && response.status < 600) {
                // Handle 5xx errors by loading from cache.
                if (Phoenix.isNativeApp) {
                    console.warn('Fetch entitlements server error:', response.status);
                    const processedEntitlement = await _processDiscCachedEntitlement();
                    if (processedEntitlement) {
                        return processedEntitlement;
                    }
                }
            } else if (Phoenix.isNativeApp) {
                // 4xx errors are genuine auth fail errors, so our cache is not good then
                console.warn('Cearing entitlements, entitlements server error:', response.status);
                await _clearCachedEntitlements();
            }
        } catch (error) {
            console.error('Failed to fetch entitlements:', error);

            // errors that happen during the fetch operation itself, which are typically not HTTP errors
            // returned by the server, but rather issues at the network or browser level.
            // For desktop app, fall back to cached entitlements if available
            if (Phoenix.isNativeApp) {
                const processedEntitlement = await _processDiscCachedEntitlement();
                if (processedEntitlement) {
                    return processedEntitlement;
                }
            }
        }

        return null;
    }

    /**
     * Clear cached entitlements and trigger change event
     * Called when user logs out
     */
    async function clearEntitlements() {
        if (cachedEntitlements) {
            cachedEntitlements = null;
            _debounceEntitlementsChanged();
        }
    }


    /**
     * Start the 10-minute interval timer for monitoring entitlements
     */
    function startEffectiveEntitlementsMonitor() {
        // Reconcile effective entitlements from server. So the effective entitlements api injects trial
        // entitlements data. but only the server fetch will trigger the entitlements change event.
        // so in here, we observe the effective entitlements, and if the effective entitlements are changed,
        // since the last triggered state, we trigger a change event. This only concerens with the effective
        // entitlement changes. This will not logout the user if user logged out from the server admin panel,
        // but his entitlements will be cleared by this call anyways.

        // At app start we refresh entitlements, then only one each user action like user clicks on profile icon,
        // or if some user hits some backend api, we will refresh entitlements. But here, we periodically refresh
        // entitlements from the server every 10 minutes, but only trigger entitlement change events only if some
        // effective entitlement(Eg. trial) data changed or any validity expired.
        if(Phoenix.isTestWindow){
            return;
        }
        setTimeout( async function() {
            lastRecordedState = await getEffectiveEntitlements(false);
        }, 30000);
        setInterval(async () => {
            try {
                // Get fresh effective entitlements
                const freshEntitlements = await getEffectiveEntitlements(true);

                // Check if we need to refresh
                const expiredPlanName = KernalModeTrust.LoginUtils
                    .validTillExpired(freshEntitlements, lastRecordedState);
                const hasChanged = KernalModeTrust.LoginUtils
                    .haveEntitlementsChanged(freshEntitlements, lastRecordedState);

                if (expiredPlanName || hasChanged) {
                    console.log(`Entitlements monitor detected changes, Expired: ${expiredPlanName},` +
                        `changed: ${hasChanged} refreshing...`);
                    Metrics.countEvent(Metrics.EVENT_TYPE.PRO, "entRefresh",
                        expiredPlanName ? "exp_"+expiredPlanName : "changed");
                    // if not logged in, the getEffectiveEntitlements will not trigger change even if some trial
                    // entitlements changed. so we trigger a change anyway here. The debounce will take care of
                    // multi fire and we are ok with multi fire 1 second apart.
                    _debounceEntitlementsChanged();
                }

                // Update last recorded state
                lastRecordedState = freshEntitlements;
            } catch (error) {
                console.error('Entitlements monitor error:', error);
            }
        }, TEN_MINUTES);

        console.log('Entitlements monitor started (10-minute interval)');
    }

    function _validateAndFilterEntitlements(entitlements) {
        if (!entitlements) {
            return;
        }

        const currentDate = dateNowFn();

        if(entitlements.plan && (!entitlements.plan.validTill || currentDate > entitlements.plan.validTill)) {
            entitlements.plan = {
                ...entitlements.plan,
                paidSubscriber: false,
                name: Strings.USER_FREE_PLAN_NAME,
                validTill: currentDate + (FREE_PLAN_VALIDITY_DAYS * MS_IN_DAY)
            };
        }

        const featureEntitlements = entitlements.entitlements;
        if (!featureEntitlements) {
            return;
        }

        for(const featureName in featureEntitlements) {
            const feature = featureEntitlements[featureName];
            if(feature && (!feature.validTill || currentDate > feature.validTill)) {
                feature.activated = false;
                feature.upgradeToPlan = feature.upgradeToPlan || brackets.config.main_pro_plan;
                feature.subscribeURL = feature.subscribeURL || brackets.config.purchase_url;
                feature.validTill = feature.validTill || (currentDate - MS_IN_DAY);
            }
        }
    }

    /**
     * Get effective entitlements for determining feature availability.
     * This is for internal use only. All consumers in phoenix code should use `KernalModeTrust.Entitlements` APIs.
     *
     * @returns {Promise<Object|null>} Entitlements object or null if not logged in and no trial active
     *
     * @description Response shapes vary based on user state:
     *
     * **For non-logged-in users:**
     * - Returns `null` if no trial is active
     * - Returns synthetic entitlements if trial is active:
     * ```javascript
     * {
     *   plan: {
     *     paidSubscriber: true,    // Always true for trial users
     *     name: "Phoenix Pro"
     *   },
     *   isInProTrial: true,        // Indicates this is a trial user
     *   trialDaysRemaining: number, // Days left in trial
     *   entitlements: {
     *     liveEdit: {
     *       activated: true        // Trial users get liveEdit access
     *     }
     *   }
     * }
     * ```
     *
     * **For logged-in trial users:**
     * - If remote response has `plan.paidSubscriber: false`, injects `paidSubscriber: true`
     * - Adds `isInProTrial: true` and `trialDaysRemaining`
     * - Injects `entitlements.liveEdit.activated: true`
     * - Note: Trial users may not be actual paid subscribers, but `paidSubscriber: true` is set
     *   so all Phoenix code treats them as paid subscribers
     *
     * **For logged-in users (full remote response):**
     * ```javascript
     * {
     *   isSuccess: boolean,
     *   lang: string,
     *   plan: {
     *     name: "Phoenix Pro",
     *     paidSubscriber: boolean,
     *     validTill: number        // Timestamp
     *   },
     *   profileview: {
     *     quota: {
     *       titleText: "Ai Quota Used",
     *       usageText: "100 / 200 credits",
     *       usedPercent: number
     *     },
     *     htmlMessage: string      // HTML alert message
     *   },
     *   entitlements: {
     *     liveEdit: {
     *       activated: boolean,
     *       subscribeURL: string,  // URL to subscribe if not activated
     *       upgradeToPlan: string, // Plan name that includes this entitlement
     *       validTill: number      // Timestamp when entitlement expires
     *     },
     *     liveEditAI: {
     *       activated: boolean,
     *       subscribeURL: string,
     *       purchaseCreditsURL: string, // URL to purchase AI credits
     *       upgradeToPlan: string,
     *       validTill: number
     *     }
     *   }
     * }
     * ```
     *
     * @example
     * // Listen for entitlements changes
     * const LoginService = window.KernelModeTrust.loginService;
     * LoginService.on(LoginService.EVENT_ENTITLEMENTS_CHANGED, async() => {
     *   const entitlements = await LoginService.getEffectiveEntitlements();
     *   console.log('Entitlements changed:', entitlements);
     *   // Update UI based on new entitlements
     * });
     *
     * // Get current entitlements
     * const entitlements = await LoginService.getEffectiveEntitlements();
     * if (entitlements?.plan?.paidSubscriber) {
     *   // Enable pro features
     * }
     * if (entitlements?.entitlements?.liveEdit?.activated) {
     *   // Enable live edit feature
     * }
     */
    async function getEffectiveEntitlements(forceRefresh = false) {
        // Get raw server entitlements
        const serverEntitlements = await getEntitlements(forceRefresh);
        _validateAndFilterEntitlements(serverEntitlements); // will prune invalid entitlements

        // Get trial days remaining
        const trialDaysRemaining = await LoginService.getProTrialDaysRemaining();

        // If no trial is active, return server entitlements as-is
        if (trialDaysRemaining <= 0) {
            return serverEntitlements;
        }

        // User has active trial
        if (serverEntitlements && serverEntitlements.plan) {
            // Logged-in user with trial
            if (serverEntitlements.plan.paidSubscriber) {
                // Already a paid subscriber, return as-is
                return serverEntitlements;
            }
            // Enhance entitlements for trial user
            // ie if any entitlement has valid till expired, we need to deactivate that entitlement
            return {
                ...serverEntitlements,
                plan: {
                    ...serverEntitlements.plan,
                    paidSubscriber: true,
                    name: brackets.config.main_pro_plan,
                    validTill: dateNowFn() + trialDaysRemaining * MS_IN_DAY
                },
                isInProTrial: true,
                trialDaysRemaining: trialDaysRemaining,
                entitlements: {
                    ...serverEntitlements.entitlements,
                    liveEdit: {
                        activated: true,
                        subscribeURL: brackets.config.purchase_url,
                        upgradeToPlan: brackets.config.main_pro_plan,
                        validTill: dateNowFn() + trialDaysRemaining * MS_IN_DAY
                    }
                }
            };
        }

        // Non-logged-in user with trial - return synthetic entitlements
        return {
            plan: {
                paidSubscriber: true,
                name: brackets.config.main_pro_plan,
                validTill: dateNowFn() + trialDaysRemaining * MS_IN_DAY
            },
            isInProTrial: true,
            trialDaysRemaining: trialDaysRemaining,
            entitlements: {
                liveEdit: {
                    activated: true,
                    subscribeURL: brackets.config.purchase_url,
                    upgradeToPlan: brackets.config.main_pro_plan,
                    validTill: dateNowFn() + trialDaysRemaining * MS_IN_DAY
                }
            }
        };
    }

    // Add functions to secure exports
    LoginService.getEntitlements = getEntitlements;
    LoginService.getEffectiveEntitlements = getEffectiveEntitlements;
    LoginService.clearEntitlements = clearEntitlements;
    LoginService.getSalt = getSalt;
    LoginService.EVENT_ENTITLEMENTS_CHANGED = EVENT_ENTITLEMENTS_CHANGED;

    let inited = false;
    function init() {
        if(inited){
            return;
        }
        inited = true;
        EntitlementsDirectImport.init();
    }
    // Test-only exports for integration testing
    if (Phoenix.isTestWindow) {
        window._test_login_service_exports = {
            LoginService,
            setFetchFn: function _setFetchFn(fn) {
                fetchFn = fn;
            },
            setDateNowFn: function _setDdateNowFn(fn) {
                dateNowFn = fn;
            },
            _validateAndFilterEntitlements: _validateAndFilterEntitlements
        };
    }

    // Start the entitlements monitor timer
    startEffectiveEntitlementsMonitor();

    exports.init = init;
    // no public exports to prevent extension tampering
});
