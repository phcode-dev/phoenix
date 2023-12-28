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

/*global less */
// jshint ignore: start

// @INCLUDE_IN_API_DOCS

/**
 * FeatureGate defines util methods for enabling or disabling features in development based on a flag in local storage.
 * A global `window.FeatureGate` object is made available in phoenix that can be called anytime after AppStart.
 *
 * ## Usage
 * For Eg. You may have an extensions in development that colors phoenix in red. But you are working on a new feature
 * that makes other colors available, but not yet ready for use. So put the extension behind a named feature gate
 * so that only people who want to test the extension will be able to use it.
 *
 * ### creating a feature gate
 * ```js
 * // within extensions
 * const FeatureGate = brackets.getModule("utils/FeatureGate"); // replace with `require` for core modules.
 * const FEATURE_NEW_COLORS = 'myExtension.newColors';
 * FeatureGate.registerFeatureGate(FEATURE_NEW_COLORS, false); // false is the default value
 * ```
 *
 * ### checking if a feature is gated
 * Once the feature is registered, use the below code to check if the feature can be safely enabled. For Eg., if
 * you want to enable fancy colors based on the example above:
 *
 * ```js
 * if(FeatureGate.isFeatureEnabled(FEATURE_NEW_COLORS)){
 *    // do fancy colors here
 * }
 * ```
 * ### Enabling features for testing
 * 1. Open developer tools > local storage
 * 2. Add a new key with the key you have specified for the feature gate.
 *    In the above Eg., the key is `myExtension.newColors`
 * 3. set the value in local storage to `enabled` to enable the feature or anything else to disable.
 * @module utils/FeatureGate
 */

define(function (require, exports, module) {
    const FEATURE_REGISTERED = "featureGateRegistered",
        ENABLED = 'enabled',
        DISABLED = 'disabled';

    let EventDispatcher = require("utils/EventDispatcher");

    let _FeatureGateMap = {};

    /**
     * Registers a named feature with the default enabled state.
     * @example <caption>To register a feature gate with name `myExtension.newColors`</caption>
     * const FEATURE_NEW_COLORS = 'myExtension.newColors';
     * FeatureGate.registerFeatureGate(FEATURE_NEW_COLORS, false); // false is the default value here
     *
     * @param {string} featureName
     * @param {boolean} enabledDefault
     * @type {function}
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
     * @type {function}
     */
    function getAllRegisteredFeatures() {
        return Object.keys(_FeatureGateMap);
    }

    /**
     * Returns true is an featureGate is enabled either by default or overridden by the user using local storage.
     * @example <caption>To check if the feature `myExtension.newColors` is enabled</caption>
     * const FEATURE_NEW_COLORS = 'myExtension.newColors';
     * if(FeatureGate.isFeatureEnabled(FEATURE_NEW_COLORS)){
     *    // do fancy colors here
     * }
     * @param {string} featureName
     * @return {boolean}
     * @type {function}
     */
    function isFeatureEnabled(featureName) {
        let userOverRide = PhStore.getItem(`FeatureGate-${featureName}`);
        if(userOverRide === ENABLED){
            return true;
        } else if(userOverRide === DISABLED){
            return false;
        }
        return _FeatureGateMap[featureName] === true;
    }

    /**
     * Sets the enabled state of a specific feature in the application.
     *
     * @param {string} featureName - The name of the feature to be modified.
     * @param {boolean} isEnabled - A boolean flag indicating whether the feature should be enabled (true) or disabled (false).
     */
    function setFeatureEnabled(featureName, isEnabled) {
        PhStore.setItem(`FeatureGate-${featureName}`, isEnabled ? ENABLED : DISABLED);
    }

    EventDispatcher.makeEventDispatcher(exports);
    // Public API
    exports.registerFeatureGate = registerFeatureGate;
    exports.getAllRegisteredFeatures = getAllRegisteredFeatures;
    exports.isFeatureEnabled = isFeatureEnabled;
    exports.setFeatureEnabled = setFeatureEnabled;
    // Events
    exports.FEATURE_REGISTERED = FEATURE_REGISTERED;
});
