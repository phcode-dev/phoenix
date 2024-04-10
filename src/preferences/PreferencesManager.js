/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*global define, console */
/*unittests: Preferences Manager */

/**
 * PreferencesManager
 *
 */
define(function (require, exports, module) {


    var AppInit                 = require("utils/AppInit"),
        Commands                = require("command/Commands"),
        CommandManager          = require("command/CommandManager"),
        FileUtils               = require("file/FileUtils"),
        PreferencesBase         = require("preferences/PreferencesBase"),
        FileSystem              = require("filesystem/FileSystem"),
        Strings                 = require("strings"),
        PreferencesImpl         = require("preferences/PreferencesImpl"),
        StateManager            = require("preferences/StateManager"),
        _                       = require("thirdparty/lodash");

    var currentFilename         = null, // the filename currently being edited
        currentLanguageId       = null, // the language id of the file currently being edited
        projectDirectory        = null,
        projectScopeIsIncluded  = true;

    /**
     * @private
     *
     * Determines whether the project Scope should be included based on whether
     * the currently edited file is within the project.
     *
     * @param {string=} filename Full path to edited file
     * @return {boolean} true if the project Scope should be included.
     */
    function _includeProjectScope(filename) {
        filename = filename || currentFilename;
        if (!filename || !projectDirectory) {
            return false;
        }
        return FileUtils.getRelativeFilename(projectDirectory, filename) !== undefined;
    }

    /**
     * Get the full path to the user-level preferences file.
     *
     * @return {string} Path to the preferences file
     */
    function getUserPrefFile() {
        return PreferencesImpl.userPrefFile;
    }

    /**
     * @private
     *
     * Adds or removes the project Scope as needed based on whether the currently
     * edited file is within the project.
     */
    function _toggleProjectScope() {
        if (_includeProjectScope() === projectScopeIsIncluded) {
            return;
        }
        if (projectScopeIsIncluded) {
            PreferencesImpl.manager.removeFromScopeOrder("project");
        } else {
            PreferencesImpl.manager.addToScopeOrder("project", "user");
        }
        projectScopeIsIncluded = !projectScopeIsIncluded;
    }

    /**
     * @private
     *
     * This is used internally within Brackets for the ProjectManager to signal
     * which file contains the project-level preferences.
     *
     * @param {string} settingsFile Full path to the project's settings file
     */
    function _setProjectSettingsFile(settingsFile) {
        projectDirectory = FileUtils.getDirectoryPath(settingsFile);
        _toggleProjectScope();
        PreferencesImpl.projectPathLayer.setPrefFilePath(settingsFile);
        PreferencesImpl.projectStorage.setPath(settingsFile);
    }

    /**
     * Creates an extension-specific preferences manager using the prefix given.
     * A `.` character will be appended to the prefix. So, a preference named `foo`
     * with a prefix of `myExtension` will be stored as `myExtension.foo` in the
     * preferences files.
     *
     * @param {string} prefix Prefix to be applied
     */
    function getExtensionPrefs(prefix) {
        return PreferencesImpl.manager.getPrefixedSystem(prefix);
    }

    // Constants for preference lookup contexts.

    /**
     * Context to look up preferences in the current project.
     * @type {Object}
     */
    var CURRENT_PROJECT = {};

    /**
     * Cached copy of the scopeOrder with the project Scope
     */
    var scopeOrderWithProject = null;

    /**
     * Cached copy of the scopeOrder without the project Scope
     */
    var scopeOrderWithoutProject = null;

    /**
     * @private
     *
     * Adjusts scopeOrder to have the project Scope if necessary.
     * Returns a new array if changes are needed, otherwise returns
     * the original array.
     *
     * @param {Array.<string>} scopeOrder initial scopeOrder
     * @param {boolean} includeProject Whether the project Scope should be included
     * @return {Array.<string>} array with or without project Scope as needed.
     */
    function _adjustScopeOrderForProject(scopeOrder, includeProject) {
        var hasProject = scopeOrder.indexOf("project") > -1;

        if (hasProject === includeProject) {
            return scopeOrder;
        }

        var newScopeOrder;

        if (includeProject) {
            var before = scopeOrder.indexOf("user");
            if (before === -1) {
                before = scopeOrder.length - 2;
            }
            newScopeOrder = _.take(scopeOrder, before);
            newScopeOrder.push("project");
            newScopeOrder.push.apply(newScopeOrder, _.drop(scopeOrder, before));
        } else {
            newScopeOrder = _.without(scopeOrder, "project");
        }
        return newScopeOrder;
    }

    /**
     * @private
     *
     * Creates a context based on the specified filename and language.
     *
     * @param {string=} filename Filename to create the context with.
     * @param {string=} languageId Language ID to create the context with.
     */
    function _buildContext(filename, languageId) {
        var ctx = {};
        if (filename) {
            ctx.path = filename;
        } else {
            ctx.path = currentFilename;
        }
        if (languageId) {
            ctx.language = languageId;
        } else {
            ctx.language = currentLanguageId;
        }
        ctx.scopeOrder = _includeProjectScope(ctx.path) ?
                        scopeOrderWithProject :
                        scopeOrderWithoutProject;
        return ctx;
    }

    function _getContext(context) {
        context = context || {};
        return _buildContext(context.path, context.language);
    }

    /**
     * @private
     *
     * This is used internally within Brackets for the EditorManager to signal
     * to the preferences what the currently edited file is.
     *
     * @param {string} newFilename Full path to currently edited file
     */
    function _setCurrentFile(newFilename) {
        var oldFilename = currentFilename;
        if (oldFilename === newFilename) {
            return;
        }
        currentFilename = newFilename;
        _toggleProjectScope();
        PreferencesImpl.manager.signalContextChanged(_buildContext(oldFilename, currentLanguageId),
                                                     _buildContext(newFilename, currentLanguageId));
    }

    /**
     * @private
     * This function is used internally to set the current language of the document.
     * Both at the moment of opening the file and when the language is manually
     * overriden.
     *
     * @param {string} newLanguageId The id of the language of the current editor.
     */
    function _setCurrentLanguage(newLanguageId) {
        var oldLanguageId = currentLanguageId;
        if (oldLanguageId === newLanguageId) {
            return;
        }
        currentLanguageId = newLanguageId;
        PreferencesImpl.manager.signalContextChanged(_buildContext(currentFilename, oldLanguageId),
                                                     _buildContext(currentFilename, newLanguageId));
    }


    PreferencesImpl.manager.contextBuilder = _getContext;

    /**
     * @private
     *
     * Updates the CURRENT_PROJECT context to have the correct scopes.
     */
    function _updateCurrentProjectContext() {
        var defaultScopeOrder = PreferencesImpl.manager._getScopeOrder({});
        scopeOrderWithProject = _adjustScopeOrderForProject(defaultScopeOrder, true);
        scopeOrderWithoutProject = _adjustScopeOrderForProject(defaultScopeOrder, false);
        CURRENT_PROJECT.scopeOrder = scopeOrderWithProject;
    }

    _updateCurrentProjectContext();

    PreferencesImpl.manager.on("scopeOrderChange", _updateCurrentProjectContext);

    /**
     * @private
     */
    function _handleOpenPreferences() {
        var fullPath = getUserPrefFile(),
            file = FileSystem.getFileForPath(fullPath);
        file.exists(function (err, doesExist) {
            if (doesExist) {
                CommandManager.execute(Commands.FILE_OPEN, { fullPath: fullPath });
            } else {
                FileUtils.writeText(file, "", true)
                    .done(function () {
                        CommandManager.execute(Commands.FILE_OPEN, { fullPath: fullPath });
                    });
            }
        });

    }

    CommandManager.register(Strings.CMD_OPEN_PREFERENCES, Commands.FILE_OPEN_PREFERENCES, _handleOpenPreferences);

    /**
     * Convenience function that gets a view state
     *
     * @param {string} id preference to get
     * @param {Object} [context] Optional additional information about the request
     */
    function getViewState(id, context) {
        return StateManager.get(id, context);
    }

    /**
     * Convenience function that sets a view state and then saves the file
     *
     * @param {string} id preference to set
     * @param {*} value new value for the preference
     * @param {Object} [context] Optional additional information about the request
     */
    function setViewState(id, value, context) {
        return StateManager.set(id, value, context);
    }

    AppInit.appReady(function () {
        PreferencesImpl.manager.resumeChangeEvents();
    });

    // Private API for unit testing and use elsewhere in Brackets core
    exports._isUserScopeCorrupt     = PreferencesImpl.isUserScopeCorrupt;
    exports._setCurrentFile         = _setCurrentFile;
    exports._setCurrentLanguage     = _setCurrentLanguage;
    exports._setProjectSettingsFile = _setProjectSettingsFile;
    exports._reloadUserPrefs        = PreferencesImpl.reloadUserPrefs;
    exports._buildContext           = _buildContext;

    // Public API

    // Context names for preference lookups
    exports.CURRENT_PROJECT     = CURRENT_PROJECT;
    exports.STATE_PROJECT_CONTEXT = StateManager.PROJECT_CONTEXT;
    exports.STATE_GLOBAL_CONTEXT = StateManager.GLOBAL_CONTEXT;
    exports.STATE_PROJECT_THEN_GLOBAL_CONTEXT = StateManager.PROJECT_THEN_GLOBAL_CONTEXT;
    exports.PROJECT_SCOPE = { location: { scope: "project" } };

    exports.ready               = PreferencesImpl.managerReady;
    exports.getUserPrefFile     = getUserPrefFile;
    exports.get                 = PreferencesImpl.manager.get.bind(PreferencesImpl.manager);
    exports.set                 = PreferencesImpl.manager.set.bind(PreferencesImpl.manager);
    exports.save                = PreferencesImpl.manager.save.bind(PreferencesImpl.manager);
    exports.on                  = PreferencesImpl.manager.on.bind(PreferencesImpl.manager);
    exports.off                 = PreferencesImpl.manager.off.bind(PreferencesImpl.manager);
    exports.getPreference       = PreferencesImpl.manager.getPreference.bind(PreferencesImpl.manager);
    exports.getAllPreferences   = PreferencesImpl.manager.getAllPreferences.bind(PreferencesImpl.manager);
    exports.getExtensionPrefs   = getExtensionPrefs;
    exports.getViewState        = getViewState;
    exports.setViewState        = setViewState;
    exports.addScope            = PreferencesImpl.manager.addScope.bind(PreferencesImpl.manager);
    exports.stateManager        = StateManager;
    exports.FileStorage         = PreferencesBase.FileStorage;
    exports.SETTINGS_FILENAME   = PreferencesImpl.SETTINGS_FILENAME;
    exports.SETTINGS_FILENAME_BRACKETS   = PreferencesImpl.SETTINGS_FILENAME_BRACKETS;
    exports.definePreference    = PreferencesImpl.manager.definePreference.bind(PreferencesImpl.manager);
    exports.fileChanged         = PreferencesImpl.manager.fileChanged.bind(PreferencesImpl.manager);
});
