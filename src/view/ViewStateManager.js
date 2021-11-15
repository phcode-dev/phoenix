/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
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
 * ViewStateManager is a singleton for views to park their global viwe state. The state is saved
 * with project data but the View or View Factory is responsible for restoring the view state
 * when the view is created.
 *
 * Views should implement `getViewState()` so that the view state can be saved and that data is cached
 * for later use.
 *
 * Views or View Factories are responsible for restoring the view state when the view of that file is created
 * by recalling the cached state.  Views determine what data is store in the view state and how to restore it.
 */
define(function (require, exports, module) {


    var _ = require("thirdparty/lodash");

    /**
     * The view state cache.
     * @type {Object.<string,*>}
     * @private
     */
    var _viewStateCache = {};

    /**
     * resets the view state cache
     */
    function reset() {
        _viewStateCache = {};
    }

    /**
     * Sets the view state for the specfied file
     * @param {!File} file - the file to record the view state for
     * @param {?*} viewState - any data that the view needs to restore the view state.
     */
    function _setViewState(file, viewState) {
        _viewStateCache[file.fullPath] = viewState;
    }


    /**
     * Updates the view state for the specified view
     * @param {!{!getFile:function():File, getViewState:function():*}} view - the to save state
     * @param {?*} viewState - any data that the view needs to restore the view state.
     */
    function updateViewState(view) {
        if (view.getViewState) {
            _setViewState(view.getFile(), view.getViewState());
        }
    }

    /**
     * gets the view state for the specified file
     * @param {!File} file - the file to record the view state for
     * @return {?*} whatever data that was saved earlier with a call setViewState
     */
    function getViewState(file) {
        return _viewStateCache[file.fullPath];
    }

    /**
     * adds an array of view states
     * @param {!object.<string, *>} viewStates - View State object to append to the current set of view states
     */
    function addViewStates(viewStates) {
        _viewStateCache = _.extend(_viewStateCache, viewStates);
    }

    /*
     * Public API
     */
    exports.reset           = reset;
    exports.updateViewState = updateViewState;
    exports.getViewState    = getViewState;
    exports.addViewStates   = addViewStates;
});
