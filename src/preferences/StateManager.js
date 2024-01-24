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

/*unittests: Preferences Manager */

/**
 * StateManager
 *
 */
define(function (require, exports, module) {
    const _ = require("thirdparty/lodash"),
        EventDispatcher = require("utils/EventDispatcher"),
        ProjectManager = require("project/ProjectManager");

    const PROJECT_CONTEXT = "project";
    const GLOBAL_CONTEXT = "global";
    const PROJECT_THEN_GLOBAL_CONTEXT = "any";
    const PHSTORE_STATEMANAGER_PREFIX = "STATE_";

    const definedPreferences = {};

    function _getKey(id, useProjectContext) {
        if(useProjectContext){
            const projectRootPath = ProjectManager.getProjectRoot().fullPath;
            return `${PHSTORE_STATEMANAGER_PREFIX}${projectRootPath}${id}`; // STATE_/path/to/prj/root_ID
        }
        return `${PHSTORE_STATEMANAGER_PREFIX}${id}`; // STATE_ID
    }

    function _GET_CONTEXT_FROM_LEGACY_CONTEXT(context = null) {
        if(_.get(context, "location.layer") === 'project'){
            return PROJECT_CONTEXT;
        }
        return GLOBAL_CONTEXT;
    }

    function _getItemOrDefault(item, id) {
        if(!item && definedPreferences[id]){
            return definedPreferences[id].initial;
        }
        return item;
    }

    /**
     * Convenience function that gets a view state
     *
     * @param {string} id preference to get
     * @param {(Object|string)?} [context] Optional additional information about the request, can be:
     *  - ScopeManager.PROJECT_CONTEXT  if you want to get project specific value  or
     *  - ScopeManager.GLOBAL_CONTEXT if you want to get it from global context and not the project context.
     *  - null/undefined if you want to get from project context first, and then global context if not found in project context.
     * @param {string?} [context.scope] Eg. user - deprecated, do not use
     * @param {string?} [context.layer] Eg. project - deprecated, do not use
     * @param {string?} [context.layerID] Eg. /tauri/path/to/project - deprecated, do not use
     */
    function get(id, context= GLOBAL_CONTEXT) {
        if(Phoenix.config.environment !== 'production' && typeof  context === 'object'){
            console.warn("Use of context object in state is deprecated. Please migrate to StateManager");
        }
        let item;
        switch (context) {
        case GLOBAL_CONTEXT:
            item = PhStore.getItem(_getKey(id, false));
            return _getItemOrDefault(item, id);
        case PROJECT_CONTEXT:
            item = PhStore.getItem(_getKey(id, true));
            return _getItemOrDefault(item, id);
        case PROJECT_THEN_GLOBAL_CONTEXT:
            const val = PhStore.getItem(_getKey(id, true));
            if(val){
                return val;
            }
            item = PhStore.getItem(_getKey(id, false));
            return _getItemOrDefault(item, id);
        default:
            if(Phoenix.config.environment !== 'production'){
                console.warn("Use of context object in StateManager.get() is deprecated. Please migrate to StateManager");
            }
            return get(id, _GET_CONTEXT_FROM_LEGACY_CONTEXT(context));
        }
    }

    /**
     * Convenience function that sets a view state and then saves the file
     *
     * @param {string} id preference to set
     * @param {*} value new value for the preference
     * @param {(Object|string)?} [context] Optional additional information about the request, can be:
     *  ScopeManager.PROJECT_CONTEXT  if you want to get project specific value  or
     *  ScopeManager.GLOBAL_CONTEXT or null if you want to set globally.
     * @param {string?} [context.scope] Eg. user - deprecated, do not use
     * @param {string?} [context.layer] Eg. project - deprecated, do not use
     * @param {string?} [context.layerID] Eg. /tauri/path/to/project - deprecated, do not use
     */
    function set(id, value, context= GLOBAL_CONTEXT) {
        switch (context) {
        case PROJECT_THEN_GLOBAL_CONTEXT:
            throw new Error("Cannot use PROJECT_THEN_GLOBAL_CONTEXT with set");
        case GLOBAL_CONTEXT:
            PhStore.setItem(_getKey(id, false), value);
            return;
        case PROJECT_CONTEXT:
            PhStore.setItem(_getKey(id, true), value);
            return;
        default:
            if(Phoenix.config.environment !== 'production'){
                console.warn("Use of context object in StateManager.set() is deprecated. Please migrate to StateManager");
            }
            set(id, value, _GET_CONTEXT_FROM_LEGACY_CONTEXT(context));
        }
    }

    /**
     * returns a preference instance that can be listened `.on("change", cbfn(changeType))` . The callback fucntion will be called
     * whenever there is a change in the supplied id with a changeType argument. The change type can be one of the two:
     * CHANGE_TYPE_INTERNAL - if change is made within the current editor
     * CHANGE_TYPE_EXTERNAL - if change is made within the current editor
     *
     * @param id
     * @param type
     * @param initial
     * @param options
     * @return {{}}
     */
    function definePreference(id, type, initial, options) {
        if (definedPreferences[id]) {
            throw new Error("Preference " + id + " was redefined");
        }

        // change event processing on key
        const key = _getKey(id, false);
        const preference = {
            watchExternalChanges: function () {
                PhStore.watchExternalChanges(key);
            },
            unwatchExternalChanges: function () {
                PhStore.unwatchExternalChanges(key);
            }
        };
        EventDispatcher.makeEventDispatcher(preference);
        PhStore.on(key, (_event, changeType)=>{
            preference.trigger("change", changeType);
        });
        definedPreferences[id]={ type, initial, options, preference};
        return preference;
    }

    function getPreference(id) {
        if(!definedPreferences[id]){
            throw new Error("getPreference " + id + " no such preference defined.");
        }
        return definedPreferences[id].preference;
    }

    exports.get     = get;
    exports.set     = set;
    exports.definePreference = definePreference;
    exports.getPreference = getPreference;
    // global exports
    exports.PROJECT_CONTEXT = PROJECT_CONTEXT;
    exports.GLOBAL_CONTEXT = GLOBAL_CONTEXT;
    exports.PROJECT_THEN_GLOBAL_CONTEXT = PROJECT_THEN_GLOBAL_CONTEXT;
    exports.CHANGE_TYPE_INTERNAL = PhStore.CHANGE_TYPE_INTERNAL;
    exports.CHANGE_TYPE_EXTERNAL = PhStore.CHANGE_TYPE_EXTERNAL;
});
