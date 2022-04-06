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

/**
 * FileSystemError describes the errors that can occur when using the FileSystem, File,
 * and Directory modules.
 *
 * Error values are strings. Any "falsy" value: null, undefined or "" means "no error".
 */
define(function (require, exports, module) {


    /**
     * Enumerated File System Errors
     * @enum {string}
     */
    module.exports = {
        UNKNOWN: "Unknown",
        INVALID_PARAMS: "InvalidParams",
        NOT_FOUND: "NotFound",
        NOT_READABLE: "NotReadable",
        UNSUPPORTED_ENCODING: "UnsupportedEncoding",
        NOT_SUPPORTED: "NotSupported",
        NOT_WRITABLE: "NotWritable",
        OUT_OF_SPACE: "OutOfSpace",
        TOO_MANY_ENTRIES: "TooManyEntries",
        ALREADY_EXISTS: "AlreadyExists",
        CONTENTS_MODIFIED: "ContentsModified",
        ROOT_NOT_WATCHED: "RootNotBeingWatched",
        EXCEEDS_MAX_FILE_SIZE: "ExceedsMaxFileSize",
        NETWORK_DRIVE_NOT_SUPPORTED: "NetworkDriveNotSupported",
        ENCODE_FILE_FAILED: "EncodeFileFailed",
        DECODE_FILE_FAILED: "DecodeFileFailed",
        UNSUPPORTED_UTF16_ENCODING: "UnsupportedUTF16Encoding"

        // FUTURE: Add remote connection errors: timeout, not logged in, connection err, etc.
    };
});
