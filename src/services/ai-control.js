// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2021 - present core.ai. All rights reserved.

/**
 * This file is only relevant to desktop apps.
 *
 * AI can be not active in phoenix code either by:
 * 1. Schools with admin control. See https://docs.phcode.dev/docs/control-ai
 * 2. user is not entitled to ai services by his subscription.
 *
 * This file only deals with case 1. you should use `EntitlementsManager.js` to resolve the correct AI entitlment,
 * which will reconcile 1 and 2 to give you appropriate status.
 **/

/*global */

define(function (require, exports, module) {
    const KernalModeTrust = window.KernalModeTrust;
    if(!KernalModeTrust){
        // integrated extensions will have access to kernal mode, but not external extensions
        throw new Error("ai-control.js should have access to KernalModeTrust. Cannot boot without trust ring");
    }

    const NodeUtils = require("utils/NodeUtils"),
        Strings = require("strings"),
        StringUtils = require("utils/StringUtils");
    let EntitlementsManager;

    /**
     * Get the platform-specific config file path
     * @returns {string} The path to the config file
     */
    function _getAIConfigFilePath() {
        let aiConfigPath;
        // The path is decided by https://github.com/phcode-dev/phoenix-code-ai-control/tree/main/install_scripts

        if(!Phoenix.isNativeApp) {
            return "";
        }

        if (Phoenix.platform === 'win') {
            aiConfigPath = 'C:\\Program Files\\Phoenix AI Control\\config.json';
        } else if (Phoenix.platform === 'mac') {
            aiConfigPath = '/Library/Application Support/Phoenix AI Control/config.json';
        } else if (Phoenix.platform === 'linux') {
            aiConfigPath = '/etc/phoenix-ai-control/config.json';
        } else {
            throw new Error(`Unsupported platform: ${Phoenix.platform}`);
        }
        return Phoenix.VFS.getTauriVirtualPath(aiConfigPath);
    }
    const AI_CONFIG_FILE_PATH = _getAIConfigFilePath();
    if(Phoenix.isNativeApp) {
        console.log("AI system Config File is: ", AI_CONFIG_FILE_PATH);
    }

    /**
     * Check if the current user is in the allowed users list
     * @param {Array<string>} allowedUsers - List of allowed usernames
     * @param {string} currentUser to check against
     * @returns {boolean} True if current user is allowed
     */
    function _isCurrentUserAllowed(allowedUsers, currentUser) {
        if (!allowedUsers || !Array.isArray(allowedUsers) || allowedUsers.length === 0) {
            return false;
        }

        return allowedUsers.includes(currentUser);
    }

    /**
     * Get AI control configuration
     * @returns {Object} The configuration status and details
     */
    async function getAIControlStatus() {
        try {
            if(!Phoenix.isNativeApp) {
                return {aiEnabled: true}; // AI control with system files in not available in browser.
                // In browser, AI can be disabled with firewall only.
            }
            const fileData = await Phoenix.VFS.readFileResolves(AI_CONFIG_FILE_PATH, 'utf8');

            if (fileData.error || !fileData.data) {
                return {
                    aiEnabled: true,
                    message: Strings.AI_CONTROL_ALL_ALLOWED_NO_CONFIG
                }; // No ai config file exists
            }

            const aiConfig = JSON.parse(fileData.data);
            const currentUser = await NodeUtils.getOSUserName();

            // Check if AI is disabled globally
            if (aiConfig.disableAI === true) {
                // Check if current user is in allowed users list
                if (aiConfig.allowedUsers && _isCurrentUserAllowed(aiConfig.allowedUsers, currentUser)) {
                    return {
                        aiEnabled: true,
                        message: StringUtils.format(Strings.AI_CONTROL_USER_ALLOWED, currentUser)
                    };
                } else if(aiConfig.managedByEmail){
                    return {
                        aiEnabled: false,
                        message: StringUtils.format(Strings.AI_CONTROL_ADMIN_DISABLED_CONTACT, aiConfig.managedByEmail)
                    };
                }
                return {
                    aiEnabled: false,
                    message: Strings.AI_CONTROL_ADMIN_DISABLED
                };
            }
            // AI is enabled globally
            return {
                aiEnabled: true,
                message: Strings.AI_CONTROL_ALL_ALLOWED
            };
        } catch (error) {
            console.error('Error checking AI control:', error);
            return {aiEnabled: true, message: error.message};
        }
    }

    let inited = false;
    function init() {
        if(inited){
            return;
        }
        inited = true;
        EntitlementsManager = KernalModeTrust.EntitlementsManager;
        EntitlementsManager.getAIControlStatus = getAIControlStatus;
    }

    exports.init = init;
});
