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

/*globals path*/

/**
 * Generates the fully configured preferences systems used throughout Brackets. This is intended
 * to be essentially private implementation that can be overridden for tests.
 */
define(function (require, exports, module) {


    const PreferencesBase = require("./PreferencesBase"),
        Async           = require("utils/Async"),
        StateManager            = require("preferences/StateManager"),

        // The SETTINGS_FILENAME is used with a preceding "." within user projects
        SETTINGS_FILENAME = "phcode.json",
        SETTINGS_FILENAME_BRACKETS = "brackets.json",
        STATE_FILENAME    = "state.json",

        // User-level preferences
        userPrefFile = path.normalize(brackets.app.getApplicationSupportDirectory() + "/" + SETTINGS_FILENAME);

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

    /**
     * Promises to add scopes. Used at init time only.
     * @private
     * @type {Array.<$.Promise>}
     */
    var _addScopePromises = [];

    var manager = new PreferencesBase.PreferencesSystem();
    manager.pauseChangeEvents();

    // Create a Project scope
    var projectStorage          = new PreferencesBase.FileStorage(undefined, true),
        projectScope            = new PreferencesBase.Scope(projectStorage),
        projectPathLayer        = new PreferencesBase.PathLayer(),
        projectLanguageLayer    = new PreferencesBase.LanguageLayer();

    projectScope.addLayer(projectPathLayer);
    projectScope.addLayer(projectLanguageLayer);

    // Create a User scope
    var userStorage             = new PreferencesBase.FileStorage(userPrefFile, true),
        userScope               = new PreferencesBase.Scope(userStorage),
        userLanguageLayer       = new PreferencesBase.LanguageLayer();

    userScope.addLayer(userLanguageLayer);

    var userScopeLoading = manager.addScope("user", userScope);

    _addScopePromises.push(userScopeLoading);
    _addScopePromises.push(StateManager._migrateLegacyStateFile());

    // Set up the .phcode.json file handling
    userScopeLoading
        .fail(function (err) {
            _addScopePromises.push(manager.addScope("user", new PreferencesBase.MemoryStorage(), {
                before: "default"
            }));

            if (err.name && err.name === "ParsingError") {
                userScopeCorrupt = true;
            }
        })
        .always(function () {
            _addScopePromises.push(manager.addScope("project", projectScope, {
                before: "user"
            }));

            // Session Scope is for storing prefs in memory only but with the highest precedence.
            _addScopePromises.push(manager.addScope("session", new PreferencesBase.MemoryStorage()));

            Async.waitForAll(_addScopePromises)
                .always(function () {
                    _prefManagerReadyDeferred.resolve();
                });
        });


    // Listen for times where we might be unwatching a root that contains one of the user-level prefs files,
    // and force a re-read of the file in order to ensure we can write to it later (see #7300).
    function _reloadUserPrefs(rootDir) {
        var prefsDir = path.normalize(brackets.app.getApplicationSupportDirectory() + "/");
        if (prefsDir.indexOf(rootDir.fullPath) === 0) {
            manager.fileChanged(userPrefFile);
        }
    }

    // Semi-Public API. Use this at your own risk. The public API is in PreferencesManager.
    exports.manager             = manager;
    exports.projectStorage      = projectStorage;
    exports.projectPathLayer    = projectPathLayer;
    exports.userScopeLoading    = userScopeLoading;
    exports.userPrefFile        = userPrefFile;
    exports.isUserScopeCorrupt  = isUserScopeCorrupt;
    exports.managerReady        = _prefManagerReadyDeferred.promise();
    exports.reloadUserPrefs     = _reloadUserPrefs;
    exports.STATE_FILENAME      = STATE_FILENAME;
    exports.SETTINGS_FILENAME   = SETTINGS_FILENAME;
    exports.SETTINGS_FILENAME_BRACKETS = SETTINGS_FILENAME_BRACKETS;
});
