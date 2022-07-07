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

define(function (require, exports, module) {


    var TERN_ADD_FILES_MSG          = "AddFiles",
        TERN_UPDATE_FILE_MSG        = "UpdateFile",
        TERN_INIT_MSG               = "Init",
        TERN_JUMPTODEF_MSG          = "JumptoDef",
        TERN_COMPLETIONS_MSG        = "Completions",
        TERN_GET_FILE_MSG           = "GetFile",
        TERN_SCOPEDATA_MSG          = "ScopeData",
        TERN_CALLED_FUNC_TYPE_MSG   = "FunctionType",
        TERN_PRIME_PUMP_MSG         = "PrimePump",
        TERN_GET_GUESSES_MSG        = "GetGuesses",
        TERN_WORKER_READY           = "WorkerReady",
        TERN_INFERENCE_TIMEDOUT     = "InferenceTimedOut",
        SET_CONFIG                  = "SetConfig",
        TERN_UPDATE_DIRTY_FILE      = "UpdateDirtyFileEntry",
        TERN_REFS                   = "getRefs",
        TERN_CLEAR_DIRTY_FILES_LIST = "ClearDirtyFilesList";

    // Message parameter constants
    var TERN_FILE_INFO_TYPE_PART    = "part",
        TERN_FILE_INFO_TYPE_FULL    = "full",
        TERN_FILE_INFO_TYPE_EMPTY   = "empty";


    exports.TERN_ADD_FILES_MSG          = TERN_ADD_FILES_MSG;
    exports.TERN_JUMPTODEF_MSG          = TERN_JUMPTODEF_MSG;
    exports.TERN_COMPLETIONS_MSG        = TERN_COMPLETIONS_MSG;
    exports.TERN_INIT_MSG               = TERN_INIT_MSG;
    exports.TERN_GET_FILE_MSG           = TERN_GET_FILE_MSG;
    exports.TERN_SCOPEDATA_MSG          = TERN_SCOPEDATA_MSG;
    exports.TERN_CALLED_FUNC_TYPE_MSG   = TERN_CALLED_FUNC_TYPE_MSG;
    exports.TERN_PRIME_PUMP_MSG         = TERN_PRIME_PUMP_MSG;
    exports.TERN_GET_GUESSES_MSG        = TERN_GET_GUESSES_MSG;
    exports.TERN_UPDATE_FILE_MSG        = TERN_UPDATE_FILE_MSG;
    exports.TERN_WORKER_READY           = TERN_WORKER_READY;
    exports.TERN_FILE_INFO_TYPE_PART    = TERN_FILE_INFO_TYPE_PART;
    exports.TERN_FILE_INFO_TYPE_FULL    = TERN_FILE_INFO_TYPE_FULL;
    exports.TERN_FILE_INFO_TYPE_EMPTY   = TERN_FILE_INFO_TYPE_EMPTY;
    exports.TERN_INFERENCE_TIMEDOUT     = TERN_INFERENCE_TIMEDOUT;
    exports.SET_CONFIG                  = SET_CONFIG;
    exports.TERN_UPDATE_DIRTY_FILE      = TERN_UPDATE_DIRTY_FILE;
    exports.TERN_CLEAR_DIRTY_FILES_LIST = TERN_CLEAR_DIRTY_FILES_LIST;
    exports.TERN_REFS = TERN_REFS;
});


