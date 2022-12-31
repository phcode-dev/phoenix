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

/* global Config, virtualServerBaseURL, HtmlFormatter*/

importScripts('phoenix/virtualServer/html-formatter.js');
importScripts('phoenix/virtualServer/config.js');

if(!self.Serve){
    const _serverBroadcastChannel = new BroadcastChannel("virtual_server_broadcast");
    const fs = self.fs;
    const Path = self.path;
    let instrumentedURLs = {},
        responseListeners = {};

    function _getNewRequestID() {
        return Math.round( Math.random()*1000000000000);
    }

    function _getAllInstrumentedFullPaths() {
        let allURLs = [];
        for(let rootPaths of Object.keys(instrumentedURLs)){
            for(let subPath of instrumentedURLs[rootPaths]){
                allURLs.push(Path.normalize(rootPaths + subPath));
            }
        }
        return allURLs;
    }

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

    const serve = async function (path, download, phoenixInstanceID) {
        path = Path.normalize(path);
        return new Promise(async (resolve, reject) => { // eslint-disable-line
            function buildResponse(responseData) {
                return new Response(responseData.body, responseData.config);
            }

            function serveError(path, err) {
                if (err.code === 'ENOENT') {
                    return resolve(buildResponse(HtmlFormatter.format404(path)));
                }
                resolve(buildResponse(HtmlFormatter.format500(path, err)));
            }

            function serveInstrumentedFile(path) {
                let allURLs = _getAllInstrumentedFullPaths();
                if(!allURLs.includes(path)){
                    self._debugLivePreviewLog("Service worker: cannot serve, no such instrumented file", path);
                    return false;
                }
                self._debugLivePreviewLog("Service worker: serving instrumented file", path);
                const requestID = _getNewRequestID();
                _serverBroadcastChannel.postMessage({
                    type: "getInstrumentedContent",
                    path,
                    requestID,
                    phoenixInstanceID
                });
                responseListeners[requestID] = function (response) {
                    if(!response.contents){
                        self._debugLivePreviewLog(
                            "Service worker: no instrumented file received from phoenix!", path);
                        return resolve(buildResponse(HtmlFormatter.format404(path)));
                    }
                    const responseData = HtmlFormatter.formatFile(path, response.contents);
                    const headers = response.headers || {};
                    responseData.config.headers = { ...responseData.config.headers, ...headers};
                    resolve(new Response(responseData.body, responseData.config));
                };
                return true;
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
                    const responseData = HtmlFormatter.formatFile(path, fileResponse.contents);

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
                    if(path.endsWith("//")){
                        // this is for us to override and show the directory listing if the path ends with //
                        serveDirListing();
                        return;
                    }

                    const indexPath = Path.join(path, 'index.html');
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

                        const responseData = HtmlFormatter.formatDir(virtualServerBaseURL, path, entries);
                        resolve(new Response(responseData.body, responseData.config));
                    });
                }

                maybeServeIndexFile();
            }

            let err = null;
            try{
                if(serveInstrumentedFile(path)){
                    return;
                }
                for(let i = 1; i <= FILE_READ_RETRY_COUNT; i++){
                    let fileStat = await _resolvingStat(path);
                    if(fileStat.error){
                        err = fileStat.error;
                        await _wait(i * BACKOFF_TIME_MS);
                        continue;
                    }
                    if (fileStat.stats.isDirectory()) {
                        return serveDir(path);
                    }
                    return serveFile(path, fileStat.stats);

                }
                return serveError(path, err);
            } catch (e) {
                reject(e);
            }
        });
    };

    async function setInstrumentedURLs(event) {
        const data = event.data;
        const root = data.root,
            paths = data.paths;
        self._debugLivePreviewLog("Service worker: setInstrumentedURLs", data);
        instrumentedURLs[root] = paths;
        event.ports[0].postMessage(true);// acknowledge for the other side to resolve promise
    }

    console.log("service worker init");

    function processVirtualServerMessage(event) {
        let eventType = event.data && event.data.type;
        switch (eventType) {
        case 'REQUEST_RESPONSE':
            const requestID = event.data.requestID;
            if(event.data.requestID && responseListeners[requestID]){
                responseListeners[requestID](event.data);
                delete responseListeners[requestID];
                return true;
            }
        }
    }

    _serverBroadcastChannel.onmessage = processVirtualServerMessage;

    self.Serve = {
        serve,
        setInstrumentedURLs
    };

}
