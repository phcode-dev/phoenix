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

/* global Config, virtualServerBaseURL*/

importScripts('phoenix/virtualServer/config.js');

if(!self.Serve){
    const fs = self.fs;
    const Path = self.path;
    let instrumentedURLs = {},
        responseListeners = {};

    let requestIDCounter = 0;
    function _getNewRequestID() {
        return requestIDCounter++;
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

    const serve = async function (path, formatter, download) {
        path = Path.normalize(path);
        return new Promise(async (resolve, reject) => { // eslint-disable-line
            function buildResponse(responseData) {
                return new Response(responseData.body, responseData.config);
            }

            function serveError(path, err) {
                if (err.code === 'ENOENT') {
                    return resolve(buildResponse(formatter.format404(path)));
                }
                resolve(buildResponse(formatter.format500(path, err)));
            }

            async function serveInstrumentedFile(path, stats) {
                let allURLs = [];
                for(let rootPaths of Object.keys(instrumentedURLs)){
                    for(let subPath of instrumentedURLs[rootPaths]){
                        allURLs.push(Path.normalize(rootPaths + subPath));
                    }
                }
                if(allURLs.includes(path)){
                    self._debugLivePreviewLog("Service worker: serving instrumented file", path);
                    const requestID = _getNewRequestID();
                    phoenixWindowPort.postMessage({
                        type: "getInstrumentedContent",
                        path,
                        requestID
                    });
                    responseListeners[requestID] = function (response) {
                        const responseData = formatter.formatFile(path, response.contents, stats);
                        resolve(new Response(responseData.body, responseData.config));
                    };
                    return true;
                }
                return false;
            }

            async function serveFile(path, stats) {
                let fileServed = await serveInstrumentedFile(path, stats);
                if(fileServed){
                    return;
                }
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

                        const responseData = formatter.formatDir(virtualServerBaseURL, path, entries);
                        resolve(new Response(responseData.body, responseData.config));
                    });
                }

                maybeServeIndexFile();
            }

            let err = null;
            try{
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

    // service-worker.js
    let phoenixWindowPort;
    let clientPorts = {};

    function processVirtualServerMessage(event) {
        let eventType = event.data && event.data.type;
        switch (eventType) {
        case 'setInstrumentedURLs': setInstrumentedURLs(event); return true;
        case 'PHOENIX_CONNECT': phoenixWindowPort = event.ports[0]; return true;
        case 'PHOENIX_SEND':
            const clientIDs = event.data.args[0],
                message = event.data.args[1];
            for(let clientID of clientIDs){
                if(clientPorts[clientID]){
                    clientPorts[clientID].postMessage({
                        type: "MESSAGE_FROM_PHOENIX",
                        clientID: event.data.clientID,
                        message: message
                    });
                }  else {
                    console.error("unknown client ID for event: ", clientID, event);
                }
            }
            return true;
        case 'BROWSER_CONNECT':
            clientPorts[event.data.clientID] = event.ports[0];
            phoenixWindowPort.postMessage({
                type: "BROWSER_CONNECT",
                clientID: event.data.clientID,
                url: event.data.url
            });
            return true;
        case 'BROWSER_MESSAGE':
            phoenixWindowPort.postMessage({
                type: "BROWSER_MESSAGE",
                clientID: event.data.clientID,
                message: event.data.message
            });
            return true;
        case 'BROWSER_CLOSE':
            phoenixWindowPort.postMessage({
                type: "BROWSER_CLOSE",
                clientID: event.data.clientID
            });
            delete clientPorts[event.data.clientID];
            return true;
        case 'PHOENIX_CLOSE': self._debugLivePreviewLog("Service worker: main phoenixWindowPort closing."); return true;
        case 'REQUEST_RESPONSE':
            const requestID = event.data.requestID;
            if(event.data.requestID && responseListeners[requestID]){
                responseListeners[requestID](event.data);
                delete responseListeners[requestID];
                return true;
            }
        }
    }

    self.Serve = {
        serve,
        processVirtualServerMessage
    };

}
