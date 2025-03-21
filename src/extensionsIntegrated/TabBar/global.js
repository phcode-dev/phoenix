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

/*
 * This file houses the global working set array
 */
define(function (require, exports, module) {
    /**
     * This array's represents the current working set
     * It holds all the working set items that are to be displayed in the tab bar
     * Properties of each object:
     * path: {String} full path of the file
     * name: {String} name of the file
     * isFile: {Boolean} whether the file is a file or a directory
     * isDirty: {Boolean} whether the file is dirty
     * isPinned: {Boolean} whether the file is pinned
     * displayName: {String} name to display in the tab (may include directory info for duplicate files)
     */
    let firstPaneWorkingSet = [];
    let secondPaneWorkingSet = [];

    module.exports = {
        firstPaneWorkingSet,
        secondPaneWorkingSet
    };
});
