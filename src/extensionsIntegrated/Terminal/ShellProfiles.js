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

/**
 * ShellProfiles - manages available shell profiles for the terminal extension.
 * Detects shells via the Node-side getDefaultShells API and caches them.
 */
define(function (require, exports, module) {

    let _shells = [];
    let _defaultShell = null;

    /**
     * Initialize shell profiles from the Node-side detection
     * @param {Object} nodeConnector - The NodeConnector instance
     */
    async function init(nodeConnector) {
        try {
            const result = await nodeConnector.execPeer("getDefaultShells", {});
            _shells = result.shells || [];
            _defaultShell = _shells.find(s => s.isDefault) || _shells[0] || null;
        } catch (e) {
            console.error("Terminal: Failed to detect shells:", e);
            _shells = [];
            _defaultShell = null;
        }
    }

    /**
     * Get all available shells
     * @returns {Array} List of shell profiles
     */
    function getShells() {
        return _shells;
    }

    /**
     * Get the default shell profile
     * @returns {Object|null} Default shell profile
     */
    function getDefaultShell() {
        return _defaultShell;
    }

    /**
     * Get a shell by name
     * @param {string} name - Shell name
     * @returns {Object|null} Shell profile or null
     */
    function getShellByName(name) {
        return _shells.find(s => s.name === name) || null;
    }

    /**
     * Set a shell as the default by name
     * @param {string} name - Shell name to set as default
     */
    function setDefaultShell(name) {
        const shell = _shells.find(s => s.name === name);
        if (!shell) {
            return;
        }
        // Clear old default
        for (const s of _shells) {
            s.isDefault = false;
        }
        shell.isDefault = true;
        _defaultShell = shell;
    }

    exports.init = init;
    exports.getShells = getShells;
    exports.getDefaultShell = getDefaultShell;
    exports.getShellByName = getShellByName;
    exports.setDefaultShell = setDefaultShell;
});
