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

// @INCLUDE_IN_API_DOCS


/*unittests: Preferences Manager */
/*global fs*/

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
    const transformDotsInID = {};

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
        if((item === null || item === undefined) && definedPreferences[id]){
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
    function getVal(id, context= GLOBAL_CONTEXT) {
        if(Phoenix.config.environment !== 'production' && typeof  context === 'object'){
            console.warn("Use of context object in state is deprecated. Please migrate to StateManager");
        }
        if(transformDotsInID[id]){
            // this is true if
            id=id.replace(".", ":");
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
            return getVal(id, _GET_CONTEXT_FROM_LEGACY_CONTEXT(context));
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
    function setVal(id, value, context= GLOBAL_CONTEXT) {
        if(transformDotsInID[id]){
            // this is true if
            id=id.replace(".", ":");
        }
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
            setVal(id, value, _GET_CONTEXT_FROM_LEGACY_CONTEXT(context));
        }
    }

    /**
     * returns a preference instance that can be listened `.on("change", cbfn(changeType))` . The callback fucntion will be called
     * whenever there is a change in the supplied id with a changeType argument. The change type can be one of the two:
     * CHANGE_TYPE_INTERNAL - if change is made within the current app window/browser tap
     * CHANGE_TYPE_EXTERNAL - if change is made in a different app window/browser tab
     *
     * @param id
     * @param type
     * @param initial
     * @param options
     * @return {{}}
     */
    function definePreferenceInternal(id, type, initial, options) {
        if (definedPreferences[id]) {
            throw new Error("Preference " + id + " was redefined");
        }

        if(id.includes(".")){
            // this is a problem as our event Dispatcher treats . as event class names. so listening on is's that have
            // a dot will fail as instead of listening to events on for Eg. `eventName.hello`, eventDispatcher will only
            // listen to `eventName`. To mitigate this, we will try to change the id name by replacing `.` with `:`
            transformDotsInID[id] = true;
            id=id.replace(".", ":");
            console.error(`StateManager.definePreference should not be called with an id ${id} that has a` +
                " `.`- trying to continue...");
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

    function getPreferenceInternal(id) {
        if(!definedPreferences[id]){
            throw new Error("getPreference " + id + " no such preference defined.");
        }
        return definedPreferences[id].preference;
    }

    const knownExtensions = {};
    function createExtensionStateManager(extensionID) {
        let i=0;
        if(extensionID.includes(".")){
            // this is a problem as our event Dispatcher treats . as event class names. so listening on id's that have
            // a dot will fail as instead of listening to events on for Eg. `eventName.hello`, eventDispatcher will only
            // listen to `eventName`. To mitigate this, we will try to change the id name by replacing `.` with `:`
            extensionID=extensionID.replace(".", ":");
        }
        let originalExtensionID = extensionID;
        while(knownExtensions[extensionID]){
            let newID = `${originalExtensionID}_${i++}`;
            console.warn(`Another extension of the same id ${extensionID} exists in createExtensionStateManager.` +
                ` Mitigating-Identifying a new free id to use... ${newID}`);
            extensionID = newID;
        }
        knownExtensions[extensionID] = true;
        const extPrefix = `EXT_${extensionID}`;
        return {
            get: function (id, context) {
                return getVal(`${extPrefix}_${id}`, context);
            },
            set: function (id, value, context) {
                return setVal(`${extPrefix}_${id}`, value, context);
            },
            definePreference: function (id, type, initial, options) {
                return definePreferenceInternal(`${extPrefix}_${id}`, type, initial, options);
            },
            getPreference: function (id) {
                return getPreferenceInternal(`${extPrefix}_${id}`);
            },
            PROJECT_CONTEXT,
            GLOBAL_CONTEXT,
            PROJECT_THEN_GLOBAL_CONTEXT
        };
    }

    function save() {
        console.warn("StateManager.save() is deprecated. Settings are auto saved to a high throughput Database");
    }

    function getPrefixedSystem(prefix) {
        console.warn("StateManager.getPrefixedSystem() is deprecated. Use StateManager.createExtensionStateManager()");
        return createExtensionStateManager(prefix);
    }

    // private api for internal use only
    // All internal states must be registered here to prevent collisions in internal codebase state managers
    const _INTERNAL_STATES = {
        TAB_SPACES: "TAB_SPC_"
    };
    exports._INTERNAL_STATES = _INTERNAL_STATES;
    exports._createInternalStateManager = createExtensionStateManager;

    // public api
    exports.get     = getVal;
    exports.set     = setVal;
    exports.definePreference = definePreferenceInternal;
    exports.getPreference = getPreferenceInternal;
    exports.createExtensionStateManager = createExtensionStateManager;
    //deprecated APIs
    exports.save = save;
    exports.getPrefixedSystem = getPrefixedSystem;
    // global exports
    exports.PROJECT_CONTEXT = PROJECT_CONTEXT;
    exports.GLOBAL_CONTEXT = GLOBAL_CONTEXT;
    exports.PROJECT_THEN_GLOBAL_CONTEXT = PROJECT_THEN_GLOBAL_CONTEXT;
    exports.CHANGE_TYPE_INTERNAL = PhStore.CHANGE_TYPE_INTERNAL;
    exports.CHANGE_TYPE_EXTERNAL = PhStore.CHANGE_TYPE_EXTERNAL;
});
