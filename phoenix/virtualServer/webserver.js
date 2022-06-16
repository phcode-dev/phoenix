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

    async function _wait(timeMs) {
        return new Promise((resolve)=>{
            setTimeout(resolve, timeMs);
        });
    }

    // fs read that always resolves even if there is error
    async function _resolvingRead(path, encoding) {
        return new Promise((resolve)=>{
            fs.readFile(path, encoding, function (error, contents) {
                resolve({error, contents});
            });
        });
    }
    // fs stat that always resolves even if there is error
    async function _resolvingStat(path) {
        return new Promise((resolve)=>{
            fs.stat(path, function (error, stats) {
                resolve({error, stats});
            });
        });
    }
    const FILE_READ_RETRY_COUNT = 5,
          BACKOFF_TIME_MS = 10;

    const serve = async function (path, formatter, download) {
        return new Promise(async (resolve) => {
            function buildResponse(responseData) {
                return new Response(responseData.body, responseData.config);
            }

            function serveError(path, err) {
                if (err.code === 'ENOENT') {
                    return resolve(buildResponse(formatter.format404(path)));
                }
                resolve(buildResponse(formatter.format500(path, err)));
            }

            async function serveFile(path, stats) {
                let err = null;
                for(let i = 1; i <= FILE_READ_RETRY_COUNT; i++){
                    // sometimes there is read after write contention in native fs between main thread and worker.
                    // so we retry
                    let fileResponse = await _resolvingRead(path, fs.BYTE_ARRAY_ENCODING);
                    if(fileResponse.error){
                        err = fileResponse.error;
                        await _wait(i * BACKOFF_TIME_MS);
                        continue;
                    }
                    const responseData = formatter.formatFile(path, fileResponse.contents, stats);

                    // If we are supposed to serve this file or download, add headers
                    if (responseData.config.status === 200 && download) {
                        responseData.config.headers['Content-Disposition'] =
                            formatContentDisposition(path, stats);
                    }

                    resolve(new Response(responseData.body, responseData.config));
                    return;
                }
                serveError(path, err);
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

            let err = null;
            for(let i = 1; i <= FILE_READ_RETRY_COUNT; i++){
                let fileStat = await _resolvingStat(path);
                if(fileStat.error){
                    err = fileStat.error;
                    await _wait(i * BACKOFF_TIME_MS);
                    continue;
                }
                if (fileStat.stats.isDirectory()) {
                    return serveDir(path);
                } else {
                    return serveFile(path, fileStat.stats);
                }
            }
            return serveError(path, err);
        });
    };

    self.Serve = {
        serve
    };

}
