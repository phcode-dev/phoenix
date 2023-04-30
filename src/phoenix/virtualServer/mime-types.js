/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * modified by core.ai, based on  mime-types lib https://github.com/jshttp/mime-types
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015 Douglas Christopher Wilson
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

/*globals MIME_TYPE_DATABASE_REFERENCE*/
importScripts('phoenix/virtualServer/mime-db.js');

/**
 * Web worker env
 * based on  mime-types lib https://github.com/jshttp/mime-types
 */
if(!self.mime){
    (function() {
        self.mime ={};
        let db = MIME_TYPE_DATABASE_REFERENCE;

        if (!self.path) {
            console.error("Phoenix fs lib should be loaded before mime type.");
        }
        /**
         * Module variables.
         * @private
         */

        var EXTRACT_TYPE_REGEXP = /^\s*([^;\s]*)(?:;|\s|$)/;
        var TEXT_TYPE_REGEXP = /^text\//i;

        /**
         * Module exports.
         * @public
         */

        self.mime.charset = charset;
        self.mime.charsets = {lookup: charset};
        self.mime.contentType = contentType;
        self.mime.extension = extension;
        self.mime.extensions = {
            "text/html": [
                "html",
                "htm",
                "shtml"
            ]
        };
        self.mime.lookup = lookup;
        self.mime.types = {
            htm: "text/html",
            html: "text/html",
            shtml: "text/html"
        };

        /**
         * Get the default charset for a MIME type.
         *
         * @param {string} type
         * @return {boolean|string}
         */

        function charset(type) {
            if (!type || typeof type !== 'string') {
                return false;
            }

            // TODO: use media-typer
            var match = EXTRACT_TYPE_REGEXP.exec(type);
            var mime = match && db[match[1].toLowerCase()];

            if (mime && mime.charset) {
                return mime.charset;
            }

            // default text/* to utf-8
            if (match && TEXT_TYPE_REGEXP.test(match[1])) {
                return 'UTF-8';
            }

            return false;
        }

        /**
         * Create a full Content-Type header given a MIME type or extension.
         *
         * @param {string} str
         * @return {boolean|string}
         */

        function contentType(str) {
            // TODO: should this even be in this module?
            if (!str || typeof str !== 'string') {
                return false;
            }

            var mime = str.indexOf('/') === -1
                ? self.mime.lookup(str)
                : str;

            if (!mime) {
                return false;
            }

            // TODO: use content-type or other module
            if (mime.indexOf('charset') === -1) {
                var charset = self.mime.charset(mime);
                if (charset) { mime += '; charset=' + charset.toLowerCase(); }
            }

            return mime;
        }

        /**
         * Get the default extension for a MIME type.
         *
         * @param {string} type
         * @return {boolean|string}
         */

        function extension(type) {
            if (!type || typeof type !== 'string') {
                return false;
            }

            // TODO: use media-typer
            var match = EXTRACT_TYPE_REGEXP.exec(type);

            // get extensions
            var exts = match && self.mime.extensions[match[1].toLowerCase()];

            if (!exts || !exts.length) {
                return false;
            }

            return exts[0];
        }

        /**
         * Lookup the MIME type for a file path/extension.
         *
         * @param {string} path
         * @return {boolean|string}
         */

        function lookup(path) {
            if (!path || typeof path !== 'string') {
                return false;
            }

            // get the extension ("ext" or ".ext" or full path)
            var extension = self.path.extname('x.' + path)
                .toLowerCase()
                .substr(1);

            if (!extension) {
                return false;
            }

            return self.mime.types[extension] || false;
        }

        /**
         * Populate the extensions and types maps.
         * @private
         */

        function populateMaps(extensions, types) {
            // source preference (least -> most)
            var preference = ['nginx', 'apache', undefined, 'iana'];

            Object.keys(db).forEach(function forEachMimeType(type) {
                var mime = db[type];
                var exts = mime.extensions;

                if (!exts || !exts.length) {
                    return;
                }

                // mime -> extensions
                extensions[type] = exts;

                // extension -> mime
                for (var i = 0; i < exts.length; i++) {
                    var extension = exts[i];

                    if (types[extension]) {
                        var from = preference.indexOf(db[types[extension]].source);
                        var to = preference.indexOf(mime.source);

                        if (types[extension] !== 'application/octet-stream' &&
                            (from > to || (from === to && types[extension].substr(0, 12) === 'application/'))) {
                            // skip the remapping
                            continue;
                        }
                    }

                    // set the extension -> mime
                    types[extension] = type;
                }
            });
        }

        populateMaps(self.mime.extensions, self.mime.types);
    }());
}
