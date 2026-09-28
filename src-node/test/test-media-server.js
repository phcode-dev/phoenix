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

/**
 * Node side helpers for the media server spec.
 *
 * The real handler is driven over a real http server and a real file, because
 * what is worth testing here is the wire behaviour a media element depends on -
 * the status, the range headers and the bytes - not the shape of the code.
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const MediaServer = require("../media-server");
const NodeConnector = require("../node-connector");

const ROUTE = "/MediaTestRoute";

let server, port, fixturePath, fixtureSize;

/**
 * A file with known, position dependent contents, so a served range can be
 * checked to be the range that was asked for rather than merely the right
 * length.
 * @return {string} path of the file written
 */
function _writeFixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ph-media-test-"));
    const file = path.join(dir, "fixture.mp4");
    const buf = Buffer.alloc(4096);
    for (let i = 0; i < buf.length; i++) {
        buf[i] = i % 256;
    }
    fs.writeFileSync(file, buf);
    return file;
}

/**
 * Start a server that routes to the real media handler, and write the fixture.
 * @return {Promise<{port: number, route: string, path: string, size: number}>}
 */
function startMediaTestServer() {
    if (server) {
        return Promise.resolve({port, route: ROUTE, path: fixturePath, size: fixtureSize});
    }
    fixturePath = _writeFixture();
    fixtureSize = fs.statSync(fixturePath).size;
    return new Promise(function (resolve) {
        server = http.createServer(function (req, res) {
            if (!req.url.startsWith(ROUTE)) {
                res.writeHead(404);
                res.end("Not Found");
                return;
            }
            MediaServer.serveMedia(req, res, new URL(req.url, `http://${req.headers.host}`));
        });
        server.listen(0, "localhost", function () {
            port = server.address().port;
            resolve({port, route: ROUTE, path: fixturePath, size: fixtureSize});
        });
    });
}

/**
 * Stop the server and remove the fixture.
 * @return {Promise<void>}
 */
function stopMediaTestServer() {
    return new Promise(function (resolve) {
        const done = function () {
            server = null;
            if (fixturePath) {
                try {
                    fs.rmSync(path.dirname(fixturePath), {recursive: true, force: true});
                } catch (e) { /* already gone */ }
                fixturePath = null;
            }
            resolve();
        };
        if (!server) { done(); return; }
        server.close(done);
    });
}

/**
 * Ask the media route for something and report what came back.
 * @param {Object} params
 * @param {string} [params.platformPath] - value for the query string, raw
 * @param {string} [params.range] - a Range header to send
 * @param {boolean} [params.omitParam] - leave the query string off entirely
 * @return {Promise<Object>} status, headers of interest and a body digest
 */
function requestMedia({platformPath, range, omitParam}) {
    const target = omitParam
        ? `http://localhost:${port}${ROUTE}`
        : `http://localhost:${port}${ROUTE}?platformPath=` +
            encodeURIComponent(platformPath === undefined ? fixturePath : platformPath);
    return new Promise(function (resolve) {
        const req = http.get(target, {headers: range ? {Range: range} : {}}, function (res) {
            const chunks = [];
            res.on("data", function (c) { chunks.push(c); });
            res.on("end", function () {
                const body = Buffer.concat(chunks);
                resolve({
                    status: res.statusCode,
                    contentType: res.headers["content-type"] || null,
                    acceptRanges: res.headers["accept-ranges"] || null,
                    contentRange: res.headers["content-range"] || null,
                    contentLength: res.headers["content-length"] || null,
                    cors: res.headers["access-control-allow-origin"] || null,
                    length: body.length,
                    // the fixture's bytes are their own offset mod 256, so this
                    // says whether the bytes are the ones that were asked for
                    firstByte: body.length ? body[0] : null,
                    lastByte: body.length ? body[body.length - 1] : null
                });
            });
        });
        req.on("error", function (e) { resolve({error: e.message}); });
    });
}

/**
 * What the handler makes of a path, without touching the disk. Answers the
 * cross platform question: a native path is absolute on its own platform, and
 * anything relative must be refused whichever platform this runs on.
 * @param {Object} params
 * @param {string} params.candidate
 * @return {Promise<{absolutePosix: boolean, absoluteWin: boolean}>}
 */
async function classifyPath({candidate}) {
    return {
        absolutePosix: path.posix.isAbsolute(candidate),
        absoluteWin: path.win32.isAbsolute(candidate)
    };
}

exports.startMediaTestServer = startMediaTestServer;
exports.stopMediaTestServer = stopMediaTestServer;
exports.requestMedia = requestMedia;
exports.classifyPath = classifyPath;

NodeConnector.createNodeConnector("ph_test_media_server", exports);
