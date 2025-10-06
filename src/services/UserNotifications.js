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

/**
 * User Notifications Service
 *
 * This module handles server-sent notifications from the entitlements API.
 * Notifications are displayed as toast messages and acknowledged back to the server.
 */

define(function (require, exports, module) {
    const KernalModeTrust = window.KernalModeTrust;
    if(!KernalModeTrust){
        throw new Error("UserNotifications should have access to KernalModeTrust. Cannot boot without trust ring");
    }

    const PreferencesManager = require("preferences/PreferencesManager"),
        NotificationUI = require("widgets/NotificationUI");

    const PREF_NOTIFICATIONS_SHOWN_LIST = "notificationsShownList";
    PreferencesManager.stateManager.definePreference(PREF_NOTIFICATIONS_SHOWN_LIST, "object", {});

    let EntitlementsManager;
    let LoginService;

    // In-memory tracking to prevent duplicate notifications during rapid EVENT_ENTITLEMENTS_CHANGED events
    const currentlyShownNotifications = new Set();

    // Save a copy of window.fetch so that extensions won't tamper with it
    let fetchFn = window.fetch;

    /**
     * Get the list of notification IDs that have been shown and acknowledged
     * @returns {Object} Map of notificationID -> timestamp
     */
    function getShownNotifications() {
        return PreferencesManager.stateManager.get(PREF_NOTIFICATIONS_SHOWN_LIST) || {};
    }

    /**
     * Mark a notification as shown and acknowledged
     * @param {string} notificationID - The notification ID to mark as shown
     */
    function markNotificationAsShown(notificationID) {
        const shownNotifications = getShownNotifications();
        shownNotifications[notificationID] = Date.now();
        PreferencesManager.stateManager.set(PREF_NOTIFICATIONS_SHOWN_LIST, shownNotifications);
        currentlyShownNotifications.delete(notificationID);
    }

    /**
     * Call the server API to acknowledge a notification
     * @param {string} notificationID - The notification ID to acknowledge
     * @returns {Promise<boolean>} - True if successful, false otherwise
     */
    async function acknowledgeNotificationToServer(notificationID) {
        try {
            const accountBaseURL = LoginService.getAccountBaseURL();
            let url = `${accountBaseURL}/notificationAcknowledged`;

            const requestBody = {
                notificationID: notificationID
            };

            let fetchOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(requestBody)
            };

            // Handle different authentication methods for browser vs desktop
            if (Phoenix.isNativeApp) {
                // Desktop app: use appSessionID and validationCode
                const profile = LoginService.getProfile();
                if (profile && profile.apiKey && profile.validationCode) {
                    requestBody.appSessionID = profile.apiKey;
                    requestBody.validationCode = profile.validationCode;
                    fetchOptions.body = JSON.stringify(requestBody);
                }
            } else {
                // Browser app: use session cookies
                fetchOptions.credentials = 'include';
            }

            const response = await fetchFn(url, fetchOptions);

            if (response.ok) {
                const result = await response.json();
                if (result.isSuccess) {
                    console.log(`Notification ${notificationID} acknowledged successfully`);
                    return true;
                }
            }

            console.warn(`Failed to acknowledge notification ${notificationID}:`, response.status);
            return false;
        } catch (error) {
            console.error(`Error acknowledging notification ${notificationID}:`, error);
            return false;
        }
    }

    /**
     * Handle notification dismissal
     * @param {string} notificationID - The notification ID that was dismissed
     */
    async function handleNotificationDismiss(notificationID) {
        // Call server API to acknowledge (don't wait for success)
        await acknowledgeNotificationToServer(notificationID);

        // Always mark as shown locally to prevent re-showing, even if API fails
        markNotificationAsShown(notificationID);
    }

    /**
     * Check if a notification should be shown
     * @param {Object} notification - The notification object from server
     * @returns {boolean} - True if should be shown, false otherwise
     */
    function shouldShowNotification(notification) {
        if (!notification || !notification.notificationID) {
            return false;
        }

        // Check if expired
        if (notification.validTill && Date.now() > notification.validTill) {
            return false;
        }

        // Check if already shown (persistent storage)
        const shownNotifications = getShownNotifications();
        if (shownNotifications[notification.notificationID]) {
            return false;
        }

        // Check if currently being shown (in-memory)
        if (currentlyShownNotifications.has(notification.notificationID)) {
            return false;
        }

        return true;
    }

    /**
     * Display a single notification
     * @param {Object} notification - The notification object from server
     */
    function displayNotification(notification) {
        const {
            notificationID,
            title,
            htmlContent,
            options = {}
        } = notification;

        // Mark as currently showing to prevent duplicates
        currentlyShownNotifications.add(notificationID);

        // Prepare options for NotificationUI
        const toastOptions = {
            dismissOnClick: options.dismissOnClick !== undefined ? options.dismissOnClick : true,
            toastStyle: options.toastStyle || NotificationUI.NOTIFICATION_STYLES_CSS_CLASS.INFO
        };

        // Add autoCloseTimeS if provided
        if (options.autoCloseTimeS) {
            toastOptions.autoCloseTimeS = options.autoCloseTimeS;
        }

        // Create and show the toast notification
        const notificationInstance = NotificationUI.createToastFromTemplate(
            title,
            htmlContent,
            toastOptions
        );

        // Handle notification dismissal
        notificationInstance.done(() => {
            handleNotificationDismiss(notificationID);
        });
    }

    /**
     * Clean up stale notification IDs from state manager
     * Removes notification IDs that are no longer in the remote notifications list
     * @param {Array} remoteNotifications - The current notifications from server
     */
    function cleanupStaleNotifications(remoteNotifications) {
        if (!remoteNotifications || remoteNotifications.length === 0) {
            return;
        }

        // Build a set of remote notification IDs for quick lookup
        const remoteIDs = new Set();
        for (const notification of remoteNotifications) {
            if (notification.notificationID) {
                remoteIDs.add(notification.notificationID);
            }
        }

        // Keep only notification IDs that are still in remote notifications
        const shownNotifications = getShownNotifications();
        const updatedShownNotifications = {};
        for (const id in shownNotifications) {
            if (remoteIDs.has(id)) {
                updatedShownNotifications[id] = shownNotifications[id];
            }
        }

        // Update state if we removed any stale IDs
        const oldCount = Object.keys(shownNotifications).length;
        const newCount = Object.keys(updatedShownNotifications).length;
        if (newCount < oldCount) {
            console.log(`Cleaning up ${oldCount - newCount} stale notification ID(s) from state`);
            PreferencesManager.stateManager.set(PREF_NOTIFICATIONS_SHOWN_LIST, updatedShownNotifications);
        }
    }

    /**
     * Process notifications from entitlements
     */
    async function processNotifications() {
        try {
            const notifications = await EntitlementsManager.getNotifications();

            if (!notifications || !Array.isArray(notifications)) {
                return;
            }

            // Clean up stale notification IDs if we have at least 1 notification from server
            if (notifications.length > 0) {
                cleanupStaleNotifications(notifications);
            }

            // Filter and show new notifications
            const notificationsToShow = notifications.filter(shouldShowNotification);

            if (notificationsToShow.length > 0) {
                console.log(`Showing ${notificationsToShow.length} new notification(s)`);
                notificationsToShow.forEach(displayNotification);
            }
        } catch (error) {
            console.error('Error processing notifications:', error);
        }
    }

    /**
     * Initialize the UserNotifications service
     */
    function init() {
        EntitlementsManager = KernalModeTrust.EntitlementsManager;
        LoginService = KernalModeTrust.loginService;

        if (!EntitlementsManager || !LoginService) {
            throw new Error("UserNotifications requires EntitlementsManager and LoginService in KernalModeTrust");
        }

        // Listen for entitlements changes
        EntitlementsManager.on(EntitlementsManager.EVENT_ENTITLEMENTS_CHANGED, processNotifications);

        console.log('UserNotifications service initialized');
    }

    // Test-only exports for integration testing
    if (Phoenix.isTestWindow) {
        window._test_user_notifications_exports = {
            getShownNotifications,
            markNotificationAsShown,
            shouldShowNotification,
            acknowledgeNotificationToServer,
            processNotifications,
            cleanupStaleNotifications,
            currentlyShownNotifications,
            setFetchFn: function (fn) {
                fetchFn = fn;
            }
        };
    }

    exports.init = init;
    // no public exports to prevent extension tampering
});
