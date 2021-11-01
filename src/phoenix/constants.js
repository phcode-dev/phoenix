/*
 * GNU AGPL-3.0 License
 * 
 * Modified work Copyright (c) 2021 - present Core.ai
 *
 * This program is free software: you can redistribute it and/or modify it under 
 * the terms of the GNU Affero General Public License as published by the Free 
 * Software Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License along
 * with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 */
  
// jshint ignore: start
/*global fs, Phoenix, process*/
/*eslint no-console: 0*/
/*eslint strict: ["error", "global"]*/
/* jshint ignore:start */

const Constants = {
    MOUNT_DEVICE_NAME: 'nativeFsAccess',
    KIND_FILE: 'file',
    KIND_DIRECTORY: 'directory',
    NODE_TYPE_FILE: 'FILE',
    NODE_TYPE_DIRECTORY: 'DIRECTORY',
    IDB_RW_TYPE: 'readwrite',
    MOUNT_POINT_ROOT: '/mnt'
};

export default Constants;
