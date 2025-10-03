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
 * Shared Login Service
 *
 * This module contains shared login service functionality used by both
 * browser and desktop login implementations, including entitlements management.
 */

define(function (require, exports, module) {
    const KernalModeTrust = window.KernalModeTrust;
    if(!KernalModeTrust){
        // integrated extensions will have access to kernal mode, but not external extensions
        throw new Error("manage-licenses should have access to KernalModeTrust. Cannot boot without trust ring");
    }

    const Strings = require("strings"),
        NodeUtils = require("utils/NodeUtils"),
        Dialogs = require("widgets/Dialogs"),
        Mustache = require("thirdparty/mustache/mustache"),
        licenseManagementHTML = require("text!./html/license-management.html");

    // Save a copy of window.fetch so that extensions won't tamper with it
    let fetchFn = window.fetch;

    async function _getLinuxDeviceID() {
        const LINUX_DEVICE_ID_FILE = Phoenix.VFS.getTauriVirtualPath('/etc/machine-id');
        const result = await Phoenix.VFS.readFileResolves(LINUX_DEVICE_ID_FILE, 'utf8');
        if(result.error || !result.data) {
            logger.reportError(result.error, `Failed to read machine-id file for licensing`);
            return null;
        }
        return KernalModeTrust.generateDataSignature(result.data.trim()); // \n and spaces are trimmed, just id please
    }

    async function _getDeviceID() {
        if(!Phoenix.isNativeApp) {
            // We only grant device licenses to desktop apps. Browsers cannot be uniquely device identified obviously.
            return null;
        }
        switch (Phoenix.platform) {
        case 'linux': return _getLinuxDeviceID();
        default: return null;
        }
    }

    /**
     * Get the API base URL for license operations
     */
    function _getAPIBaseURL() {
        return Phoenix.config.account_url.replace(/\/$/, ''); // Remove trailing slash
    }

    /**
     * Call the validateDeviceLicense API
     */
    async function _validateDeviceLicense(deviceLicenseKey) {
        const apiURL = `${_getAPIBaseURL()}/validateDeviceLicense`;

        try {
            const response = await fetchFn(apiURL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    deviceLicenseKey: deviceLicenseKey
                })
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('Error validating device license:', error);
            throw error;
        }
    }

    /**
     * Call the registerDevice API to activate a license
     */
    async function _registerDevice(licenseKey, deviceLicenseKey, platform, deviceLabel) {
        const apiURL = `${_getAPIBaseURL()}/registerDevice`;

        try {
            const response = await fetchFn(apiURL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    licenseKey: licenseKey,
                    deviceLicenseKey: deviceLicenseKey,
                    platform: platform,
                    deviceLabel: deviceLabel
                })
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.errorMessage || `HTTP ${response.status}: ${response.statusText}`);
            }

            return result;
        } catch (error) {
            console.error('Error registering device:', error);
            throw error;
        }
    }

    /**
     * Format date for display
     */
    function _formatDate(timestamp) {
        if (!timestamp) {
            return Strings.LICENSE_VALID_NEVER;
        }
        const date = new Date(timestamp);
        return date.toLocaleDateString(Phoenix.getLocale(), {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    /**
     * Update the license status display in the dialog
     */
    async function _updateLicenseStatusDisplay($dialog, licenseData) {
        const $loading = $dialog.find('#license-status-loading');
        const $none = $dialog.find('#license-status-none');
        const $valid = $dialog.find('#license-status-valid');
        const $error = $dialog.find('#license-status-error');
        const $reapplyContainer = $dialog.find('#reapply-license-container');

        // Hide all status sections
        $loading.hide();
        $none.hide();
        $valid.hide();
        $error.hide();
        $reapplyContainer.hide();

        if (licenseData && licenseData.isValid) {
            // Show valid license info
            $dialog.find('#licensed-to-name').text(licenseData.licensedToName || Strings.LICENSE_STATUS_UNKNOWN);
            $dialog.find('#license-type-name').text(licenseData.licenseTypeName || Strings.LICENSE_STATUS_UNKNOWN);
            $dialog.find('#license-valid-till').text(_formatDate(licenseData.validTill));
            $valid.show();

            // Show reapply button if license is valid but not applied system-wide
            const isLicensed = await NodeUtils.isLicensedDevice();
            if (!isLicensed) {
                $reapplyContainer.show();
            }
        } else if (licenseData && licenseData.isValid === false) {
            // No valid license
            $none.show();
        } else {
            // Error state
            $dialog.find('#license-error-message').text(Strings.LICENSE_STATUS_ERROR_CHECK);
            $error.show();
        }
    }

    /**
     * Show activation result message
     */
    function _showActivationMessage($dialog, isSuccess, message) {
        const $messageDiv = $dialog.find('#activation-message');
        const $messageText = $dialog.find('#activation-message-text');

        $messageText.text(message);

        // Remove previous classes
        $messageDiv.removeClass('success error');

        // Add appropriate class
        if (isSuccess) {
            $messageDiv.addClass('success');
        } else {
            $messageDiv.addClass('error');
        }

        $messageDiv.show();

        // Hide message after 5 seconds
        setTimeout(() => {
            $messageDiv.fadeOut();
        }, 5000);
    }

    /**
     * Load and display current license status
     */
    async function _loadLicenseStatus($dialog) {
        try {
            const deviceID = await _getDeviceID();
            if (!deviceID) {
                _updateLicenseStatusDisplay($dialog, { isValid: false });
                return;
            }

            const licenseData = await _validateDeviceLicense(deviceID);
            _updateLicenseStatusDisplay($dialog, licenseData);
        } catch (error) {
            console.error('Error loading license status:', error);
            _updateLicenseStatusDisplay($dialog, null);
        }
    }

    /**
     * Handle license activation
     */
    async function _handleLicenseActivation($dialog, licenseKey) {
        const $btn = $dialog.find('#activate-license-btn');
        const $btnText = $btn.find('.btn-text');
        const $btnSpinner = $btn.find('.btn-spinner');

        try {
            // Show loading state
            $btn.prop('disabled', true);
            $btnText.hide();
            $btnSpinner.show();

            const deviceID = await _getDeviceID();
            if (!deviceID) {
                throw new Error('Unable to get device ID. Device licenses are only supported on desktop applications.');
            }

            const platform = Phoenix.platform || 'unknown';
            const deviceLabel = `Phoenix Code - ${platform}`;

            const result = await _registerDevice(licenseKey, deviceID, platform, deviceLabel);

            if (result.isSuccess) {
                const addSuccess = await NodeUtils.addDeviceLicense();
                const successString = addSuccess ?
                    Strings.LICENSE_ACTIVATE_SUCCESS : Strings.LICENSE_ACTIVATE_SUCCESS_PARTIAL;
                _showActivationMessage($dialog, true, successString);

                // Clear the input field
                $dialog.find('#license-key-input').val('');

                // Refresh license status
                await _loadLicenseStatus($dialog);
            } else {
                _showActivationMessage($dialog, false, result.errorMessage || Strings.LICENSE_ACTIVATE_FAIL);
            }
        } catch (error) {
            _showActivationMessage($dialog, false, error.message || Strings.LICENSE_ACTIVATE_FAIL);
        } finally {
            // Reset button state
            $btn.prop('disabled', false);
            $btnText.show();
            $btnSpinner.hide();
        }
    }

    /**
     * Handle reapply license to device
     */
    async function _handleReapplyLicense($dialog) {
        const $link = $dialog.find('#reapply-license-link');
        const originalText = $link.html();

        try {
            // Show loading state
            $link.html('<i class="fa fa-spinner fa-spin" style="margin-right: 6px;"></i>Applying...');
            $link.css('pointer-events', 'none');

            const addSuccess = await NodeUtils.addDeviceLicense();
            if (addSuccess) {
                _showActivationMessage($dialog, true, Strings.LICENSE_ACTIVATE_SUCCESS);
                // Refresh license status
                await _loadLicenseStatus($dialog);
            } else {
                _showActivationMessage($dialog, false, 'Failed to apply license to device');
            }
        } catch (error) {
            _showActivationMessage($dialog, false, error.message || 'Failed to apply license to device');
        } finally {
            // Reset link state
            $link.html(originalText);
            $link.css('pointer-events', 'auto');
        }
    }

    async function showManageLicensesDialog() {
        const $template = $(Mustache.render(licenseManagementHTML, {Strings}));

        Dialogs.showModalDialogUsingTemplate($template);

        // Set up event handlers
        const $dialog = $template;
        const $licenseInput = $dialog.find('#license-key-input');
        const $activateBtn = $dialog.find('#activate-license-btn');
        const $reapplyLink = $dialog.find('#reapply-license-link');

        // Handle activate button click
        $activateBtn.on('click', async function() {
            const licenseKey = $licenseInput.val().trim();
            if (!licenseKey) {
                _showActivationMessage($dialog, false, Strings.LICENSE_ENTER_KEY);
                return;
            }

            await _handleLicenseActivation($dialog, licenseKey);
        });

        // Handle Enter key in license input
        $licenseInput.on('keypress', function(e) {
            if (e.which === 13) { // Enter key
                $activateBtn.click();
            }
        });

        // Handle reapply license link click
        $reapplyLink.on('click', async function(e) {
            e.preventDefault();
            await _handleReapplyLicense($dialog);
        });

        // Load current license status
        await _loadLicenseStatus($dialog);
    }

    exports.showManageLicensesDialog = showManageLicensesDialog;
});
