/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*unittests: Preferences Manager */

/**
 * Manages the view state for the application.
 *
 * The view state is stored in the preferences, but it is handled separately
 * from the normal preferences.
 *
 * The view state is persisted in the file "state.json" in the user's appData directory.
 *
 * There are three contexts for view state:
 *
 * - global: This is for things that are not specific to a project.
 * - project: This is for things that are specific to a project.
 * - project-then-global: This is a read-only context that will first look for a
 *   project-specific value, and if it is not found, it will look for a global value.
 *
 * When a value is set, it is stored in memory and the preferences file is
 * saved to disk asynchronously.
 */
define(function (require, exports, module) {
    "use strict";

    var PreferencesImpl = require("preferences/PreferencesImpl"),
        FileSystem      = require("filesystem/FileSystem"),
        FileUtils       = require("file/FileUtils"),
        _               = require("thirdparty/lodash");

    var _stateFile,
        _data = {};

    var PROJECT_CONTEXT = "project",
        GLOBAL_CONTEXT = "global",
        PROJECT_THEN_GLOBAL_CONTEXT = "project-then-global";

    var _projectRoot,
        _projectData;

    /**
     * Asynchronously saves the view state to disk.
     */
    function _save() {
        return FileUtils.writeText(_stateFile, JSON.stringify(_data, null, 4));
    }

    /**
     * Gets a value from the view state.
     *
     * @param {string} id The id of the value to get.
     * @param {string=} context The context to get the value from. Defaults to GLOBAL_CONTEXT.
     * @return {*} The value.
     */
    function get(id, context) {
        context = context || GLOBAL_CONTEXT;

        var val;
        if (context === PROJECT_THEN_GLOBAL_CONTEXT) {
            if (_projectData) {
                val = _projectData[id];
            }
            if (val === undefined) {
                val = _data[id];
            }
        } else if (context === PROJECT_CONTEXT) {
            if (_projectData) {
                val = _projectData[id];
            }
        } else {
            val = _data[id];
        }
        return val;
    }

    /**
     * Sets a value in the view state.
     *
     * @param {string} id The id of the value to set.
     * @param {*} value The value to set.
     * @param {string=} context The context to set the value in. Defaults to GLOBAL_CONTEXT.
     * @return {$.Promise} A promise that is resolved when the state is saved.
     */
    function set(id, value, context) {
        context = context || GLOBAL_CONTEXT;

        if (context === PROJECT_CONTEXT) {
            if (_projectData) {
                _projectData[id] = value;
            }
        } else {
            _data[id] = value;
        }
        return _save();
    }

    /**
     * Sets the project root. This is used to determine which project-specific
     * view state to use.
     *
     * @param {string} root The project root.
     */
    function setProjectRoot(root) {
        _projectRoot = root;
        if (_projectRoot) {
            if (!_data.projects) {
                _data.projects = {};
            }
            if (!_data.projects[_projectRoot]) {
                _data.projects[_projectRoot] = {};
            }
            _projectData = _data.projects[_projectRoot];
        } else {
            _projectData = null;
        }
    }

    PreferencesImpl.manager.on("projectClose", function () {
        setProjectRoot(null);
    });

    PreferencesImpl.manager.on("projectOpen", function (e, projectRoot) {
        setProjectRoot(projectRoot.fullPath);
    });

    // Load the view state from disk.
    PreferencesImpl.managerReady.always(function () {
        var dir = path.dirname(PreferencesImpl.userPrefFile);
        _stateFile = FileSystem.getFileForPath(dir + "/" + PreferencesImpl.STATE_FILENAME);
        _stateFile.read(function (err, contents) {
            if (!err) {
                try {
                    var loadedData = JSON.parse(contents);
                    // Don't overwrite data that has been set since we were loaded
                    _data = _.extend(loadedData, _data);
                } catch (e) {
                    console.error("Error parsing view state: " + e);
                }
            }
        });
    });

    // Public API
    exports.get = get;
    exports.set = set;
    exports.PROJECT_CONTEXT = PROJECT_CONTEXT;
    exports.GLOBAL_CONTEXT = GLOBAL_CONTEXT;
    exports.PROJECT_THEN_GLOBAL_CONTEXT = PROJECT_THEN_GLOBAL_CONTEXT;
});
