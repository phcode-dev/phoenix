/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2014 - 2021 Adobe Systems Incorporated. All rights reserved.
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
 * Generates the fully configured preferences systems used IN TESTING. This configuration does
 * not manipulate the user's preferences.
 */
define(function (require, exports, module) {


    var PreferencesBase = require("./PreferencesBase"),

        // The SETTINGS_FILENAME is used with a preceding "." within user projects
        SETTINGS_FILENAME = "brackets.json",
        STATE_FILENAME    = "state.json",

        // User-level preferences
        userPrefFile = null;

    /**
     * A deferred object which is used to indicate PreferenceManager readiness during the start-up.
     * @private
     * @type {$.Deferred}
     */
    var _prefManagerReadyDeferred = new $.Deferred();

    /**
     * A boolean property indicating if the user scope configuration file is malformed.
     */
    var userScopeCorrupt = false;

    function isUserScopeCorrupt() {
        return userScopeCorrupt;
    }

    var manager = new PreferencesBase.PreferencesSystem();
    manager.pauseChangeEvents();

    // Create a Project scope
    var projectStorage          = new PreferencesBase.FileStorage(undefined, true),
        projectScope            = new PreferencesBase.Scope(projectStorage),
        projectPathLayer        = new PreferencesBase.PathLayer(),
        projectLanguageLayer    = new PreferencesBase.LanguageLayer();

    projectScope.addLayer(projectPathLayer);
    projectScope.addLayer(projectLanguageLayer);

    var userScope           = new PreferencesBase.Scope(new PreferencesBase.MemoryStorage()),
        userPathLayer       = new PreferencesBase.PathLayer(),
        userLanguageLayer   = new PreferencesBase.LanguageLayer();

    userScope.addLayer(userPathLayer);
    userScope.addLayer(userLanguageLayer);

    var userScopeLoading = manager.addScope("user", userScope);

    // Set up the .brackets.json file handling
    manager.addScope("project", projectScope, {
        before: "user"
    });

    // Session Scope is for storing prefs in memory only but with the highest precedence.
    manager.addScope("session", new PreferencesBase.MemoryStorage());

    // Memory storages take no time to initialize
    _prefManagerReadyDeferred.resolve();

    // "State" is stored like preferences but it is not generally intended to be user-editable.
    // It's for more internal, implicit things like window size, working set, etc.
    var stateManager = new PreferencesBase.PreferencesSystem();
    var smUserScope = new PreferencesBase.Scope(new PreferencesBase.MemoryStorage());
    var stateProjectLayer = new PreferencesBase.ProjectLayer();
    smUserScope.addLayer(stateProjectLayer);
    var smUserScopeLoading = stateManager.addScope("user", smUserScope);

    function _reloadUserPrefs() {
        return;
    }

    // Semi-Public API. Use this at your own risk. The public API is in PreferencesManager.
    exports.manager             = manager;
    exports.projectStorage      = projectStorage;
    exports.projectPathLayer    = projectPathLayer;
    exports.userScopeLoading    = userScopeLoading;
    exports.stateManager        = stateManager;
    exports.stateProjectLayer   = stateProjectLayer;
    exports.smUserScopeLoading  = smUserScopeLoading;
    exports.userPrefFile        = userPrefFile;
    exports.isUserScopeCorrupt  = isUserScopeCorrupt;
    exports.managerReady        = _prefManagerReadyDeferred.promise();
    exports.reloadUserPrefs    = _reloadUserPrefs;
    exports.STATE_FILENAME      = STATE_FILENAME;
    exports.SETTINGS_FILENAME   = SETTINGS_FILENAME;
});
