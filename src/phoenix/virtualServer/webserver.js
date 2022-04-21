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

/* global Config, importScripts*/

importScripts('phoenix/virtualServer/config.js');

if(!self.Serve){
    let fs = self.fs;
    let Path = self.path;
// https://tools.ietf.org/html/rfc2183
    function formatContentDisposition(path, stats) {
        const filename = Path.basename(path);
        const modified = stats.mtime.toUTCString();
        return `attachment; filename="${filename}"; modification-date="${modified}"; size=${stats.size};`;
    }

    const serve = function (path, formatter, download) {
        return new Promise((resolve) => {
            function buildResponse(responseData) {
                return new Response(responseData.body, responseData.config);
            }

            function serveError(path, err) {
                if (err.code === 'ENOENT') {
                    return resolve(buildResponse(formatter.format404(path)));
                }
                resolve(buildResponse(formatter.format500(path, err)));
            }

            function serveFile(path, stats) {
                fs.readFile(path, fs.BYTE_ARRAY_ENCODING, function (err, contents) {
                    if (err) {
                        return serveError(path, err);
                    }

                    const responseData = formatter.formatFile(path, contents, stats);

                    // If we are supposed to serve this file or download, add headers
                    if (responseData.config.status === 200 && download) {
                        responseData.config.headers['Content-Disposition'] =
                            formatContentDisposition(path, stats);
                    }

                    resolve(new Response(responseData.body, responseData.config));
                });
            }

            // Either serve /index.html (default index) or / (directory listing)
            function serveDir(path) {

                function maybeServeIndexFile() {
                    const indexPath = Path.join(path, Config.directoryIndex);

                    fs.stat(indexPath, function (err, stats) {
                        if (err) {
                            if (err.code === 'ENOENT' && !Config.disableIndexes) {
                                // Fallback to a directory listing instead
                                serveDirListing();
                            } else {
                                // Let the error (likely 404) pass through instead
                                serveError(path, err);
                            }
                        } else {
                            // Index file found, serve that instead
                            serveFile(indexPath, stats);
                        }
                    });
                }

                function serveDirListing() {
                    fs.readdir(path, function (err, entries) {
                        if (err) {
                            return serveError(path, err);
                        }

                        const responseData = formatter.formatDir(Config.route, path, entries);
                        resolve(new Response(responseData.body, responseData.config));
                    });
                }

                maybeServeIndexFile();
            }

            fs.stat(path, function (err, stats) {
                if (err) {
                    return serveError(path, err);
                }

                if (stats.isDirectory()) {
                    serveDir(path);
                } else {
                    serveFile(path, stats);
                }
            });
        });
    };

    self.Serve = {
        serve
    };

}
