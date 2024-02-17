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
/**
 * TaskManager module deals with managing long running tasks in phcode. It handles the `Tasks` dropdown in the status
 * bar where the user can see all running tasks, monitor its progress and close/pause the execution of the task if
 * supported by the task.
 * @module features/TaskManager
 */

define(function (require, exports, module) {
    let taskSelect;

    function _setTaskSelect(select) {
        taskSelect = select;
    }
    function _renderItem(item, index) {

    }

    function _onSelect(el, selection) {

    }

    // private apis
    exports._setTaskSelect = _setTaskSelect;
    exports._renderItem = _renderItem;
    exports._onSelect = _onSelect;
});
