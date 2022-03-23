/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global less */
// jshint ignore: start

/**
 * Check if certain features are enabled or disabled. This can be used to selectively enable
 * work in progress features during development. Dev feature!!!: Not intended for production use by users.
 * See <doc link here for more details on how to use this API>
 */
define(function (require, exports, module) {
    const FEATURE_REGISTERED = "featureGateRegistered",
        ENABLED = 'enabled',
        DISABLED = 'disabled';

    let EventDispatcher = require("utils/EventDispatcher");

    let _FeatureGateMap = {};

    /**
     * Registers a named feature with the default enabled state.
     * @param {string} featureName
     * @param {boolean} enabledDefault
     */
    function registerFeatureGate(featureName, enabledDefault) {
        if(typeof enabledDefault !== "boolean"){
            console.warn(`Feature gate ${featureName} ignoring invalid default value: ${enabledDefault}`);
            return;
        }
        _FeatureGateMap[featureName] = enabledDefault;
        exports.trigger(FEATURE_REGISTERED, featureName, enabledDefault);
    }

    /**
     * Returns an array of all named registered feature gates.
     * @return {[String]} list of registered features
     */
    function getAllRegisteredFeatures() {
        return Object.keys(_FeatureGateMap);
    }

    /**
     * Returns true is an featureGate is enabled either by default or overridden by the user using local storage.
     * @param {string} featureName
     * @return {boolean}
     */
    function isFeatureEnabled(featureName) {
        let userOverRide = localStorage.getItem(`feature.${featureName}`);
        if(userOverRide === ENABLED){
            return true;
        } else if(userOverRide === DISABLED){
            return false;
        }
        return _FeatureGateMap[featureName] === true;
    }

    EventDispatcher.makeEventDispatcher(exports);
    // Public API
    exports.registerFeatureGate = registerFeatureGate;
    exports.getAllRegisteredFeatures = getAllRegisteredFeatures;
    exports.isFeatureEnabled = isFeatureEnabled;
    // Events
    exports.FEATURE_REGISTERED = FEATURE_REGISTERED;
});
