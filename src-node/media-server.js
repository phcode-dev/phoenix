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
 * media-server Module
 *
 * Serves a local file over the node http server, so video and audio can be
 * played without the renderer ever holding the bytes.
 *
 * The viewer used to read the whole file through the filesystem API and hand a
 * base64 data URI to the media element. That caps at FileUtils.MAX_FILE_SIZE
 * (16MB), costs roughly three times the file in memory - the byte array, the
 * intermediate strings and the base64, which is itself a third larger - and
 * cannot start playing or seek until all of it has been read and encoded.
 * Reading from disk here instead removes the cap, holds one stream buffer
 * rather than the file, and answers byte ranges, which is what lets the media
 * element seek at all.
 *
 * Any readable path is served, not just paths under the open project, because
 * the editor can open media from anywhere. Nothing is registered first: the
 * request carries the path and this reads it, which keeps the viewer's job to
 * building a url.
 *
 * The route is guarded the same way as every other route on this server, by a
 * large random prefix chosen at startup - see the security note in index.js.
 * That guard is the whole of it, and it is enough: reaching this route means
 * running code in the renderer, and renderer code can already read any file it
 * likes through the filesystem API. Serving a file here grants nothing that
 * was not already available.
 */

const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".webm": "video/webm",
    ".ogv": "video/ogg",
    ".mov": "video/quicktime",
    ".mkv": "video/x-matroska",
    ".avi": "video/x-msvideo",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".oga": "audio/ogg",
    ".m4a": "audio/mp4",
    ".flac": "audio/flac",
    ".aac": "audio/aac",
    ".aif": "audio/aiff",
    ".aiff": "audio/aiff",
    ".opus": "audio/opus"
};

/**
 * Serve the file named by the request, honouring byte ranges.
 *
 * Range is the point of this route. A media element asks for a couple of bytes
 * to find the size, then for the piece it needs; refuse ranges and it cannot
 * seek, and will usually pull the whole file to play any of it.
 *
 * @param {IncomingMessage} req
 * @param {ServerResponse} res
 * @param {URL} requestURL - the parsed request url, carrying ?platformPath=
 */
function serveMedia(req, res, requestURL) {
    const wanted = requestURL.searchParams.get("platformPath");
    // A native path for whichever platform this is: "/home/me/a.mp4" on linux
    // and mac, "c:\\users\\me\\a.mp4" on windows, url encoded by the caller so
    // that spaces and backslashes survive the query string. It must be
    // absolute - a relative one would be resolved against node's working
    // directory, which is not anywhere the caller meant.
    if (!wanted || !path.isAbsolute(wanted)) {
        res.writeHead(400, {"Content-Type": "text/plain"});
        res.end("400: Bad Request");
        return;
    }
    // normalised so that "." and ".." in the path cannot name a different file
    // than the one that gets checked below
    const filePath = path.resolve(wanted);

    let stat;
    try {
        stat = fs.statSync(filePath);
    } catch (e) {
        res.writeHead(404, {"Content-Type": "text/plain"});
        res.end("404: Not Found");
        return;
    }
    if (!stat.isFile()) {
        res.writeHead(404, {"Content-Type": "text/plain"});
        res.end("404: Not Found");
        return;
    }
    const size = stat.size;

    // No Access-Control-Allow-Origin here, unlike the static route: a media
    // element does not need it, and there is no reason to let other origins
    // read local files.
    const headers = {
        "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store"
    };

    const match = /bytes=(\d*)-(\d*)/.exec(req.headers.range || "");
    if (!match) {
        headers["Content-Length"] = size;
        res.writeHead(200, headers);
        fs.createReadStream(filePath).pipe(res);
        return;
    }

    // An open ended range ("bytes=500-") runs to the end of the file.
    const start = match[1] ? parseInt(match[1], 10) : 0;
    let end = match[2] ? parseInt(match[2], 10) : size - 1;
    if (isNaN(start) || isNaN(end) || start > end || start >= size) {
        res.writeHead(416, {"Content-Range": `bytes */${size}`});
        res.end();
        return;
    }
    end = Math.min(end, size - 1);

    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    headers["Content-Length"] = end - start + 1;
    res.writeHead(206, headers);
    fs.createReadStream(filePath, {start: start, end: end}).pipe(res);
}

exports.serveMedia = serveMedia;
