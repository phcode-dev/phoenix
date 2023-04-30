/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * modified by core.ai, based on work by David Humphrey <david.humphrey@senecacolleage.ca> (@humphd)
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

/* global mime, importScripts*/

importScripts('phoenix/virtualServer/mime-types.js');

if(!self.ContentType){
    (function () {
        function getMimeType(path) {
            return mime.lookup(path) || 'application/octet-stream';
        }

        // https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types#Audio_and_video_types
        function isMedia(path) {
            let mimeType = mime.lookup(path);
            if (!mimeType) {
                return false;
            }

            mimeType = mimeType.toLowerCase();

            // Deal with OGG special case
            if (mimeType === 'application/ogg') {
                return true;
            }

            // Anything else with `audio/*` or `video/*` is "media"
            return mimeType.startsWith('audio/') || mimeType.startsWith('video/');
        }

        // https://developer.mozilla.org/en-US/docs/Web/HTTP/Basics_of_HTTP/MIME_types#Image_types
        function isImage(path) {
            const mimeType = mime.lookup(path);
            if (!mimeType) {
                return false;
            }

            return mimeType.toLowerCase().startsWith('image/');
        }

        self.ContentType = {
            isMedia,
            isImage,
            getMimeType
        };
    }());
}
