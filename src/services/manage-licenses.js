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

    async function showManageLicensesDialog() {
        alert(`machine id is: ${await _getDeviceID()}`);
    }

    exports.showManageLicensesDialog = showManageLicensesDialog;
});
