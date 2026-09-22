/*
 * Copyright (c) 2021 - present core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Bounded image reads for local file URLs and remote images without browser CORS support. */
const fs = require("fs");
const {fileURLToPath} = require("url");

const MAX_BYTES = 8 * 1024 * 1024;

/** @return {string|null} An image MIME type recognized from the bytes, never from the filename alone. */
function _imageType(bytes) {
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) { return "image/png"; }
    if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) { return "image/jpeg"; }
    if (/^GIF8[79]a$/.test(bytes.toString("ascii", 0, 6))) { return "image/gif"; }
    if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
        return "image/webp";
    }
    if (bytes.toString("ascii", 4, 8) === "ftyp" && /avif|avis/.test(bytes.toString("ascii", 8, 32))) {
        return "image/avif";
    }
    if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0) { return "image/x-icon"; }
    const head = bytes.toString("utf8", 0, Math.min(bytes.length, 2048)).trim();
    // The prolog and each comment stop at their own end marker, so the match is linear
    // (a lazy [\s\S]*? could span comments and backtrack exponentially on hostile bytes).
    if (/^(?:<\?xml(?:(?!\?>)[\s\S])*\?>\s*)?(?:<!--(?:(?!-->)[\s\S])*-->\s*)*<svg[\s>]/i.test(head)) {
        return "image/svg+xml";
    }
    return null;
}

/**
 * Read one image without uploading it or forwarding browser credentials.
 * @param {{url: string}} params - HTTP(S) or file URL supplied to the image tool.
 * @return {Promise<Object>} A data URL, or a small structured error.
 */
async function readImage(params) {
    let controller, timer;
    try {
        const url = new URL(params.url);
        if (!["file:", "https:", "http:"].includes(url.protocol) || url.username || url.password) {
            throw new Error("Unsupported image URL");
        }
        let bytes;
        if (url.protocol === "file:") {
            const filePath = fileURLToPath(url);
            const beforeOpen = await fs.promises.stat(filePath);
            if (!beforeOpen.isFile() || beforeOpen.size > MAX_BYTES) {
                throw new Error("Image exceeds the 8 MB limit");
            }
            // Nonblocking prevents a replaced path from hanging if it becomes a pipe between stat and open.
            // eslint-disable-next-line no-bitwise
            const file = await fs.promises.open(filePath, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK || 0));
            try {
                const stat = await file.stat();
                if (!stat.isFile() || stat.size > MAX_BYTES) { throw new Error("Image exceeds the 8 MB limit"); }
                bytes = Buffer.alloc(Math.min(stat.size + 1, MAX_BYTES + 1));
                let offset = 0;
                while (offset < bytes.length) {
                    const read = await file.read(bytes, offset, bytes.length - offset, offset);
                    if (!read.bytesRead) { break; }
                    offset += read.bytesRead;
                }
                bytes = bytes.subarray(0, offset);
            } finally {
                await file.close();
            }
        } else {
            controller = new AbortController();
            timer = setTimeout(function () { controller.abort(); }, 10000);
            const response = await fetch(url, {signal: controller.signal, credentials: "omit"});
            if (!response.ok) { throw new Error("Image request failed (" + response.status + ")"); }
            if (Number(response.headers.get("content-length")) > MAX_BYTES) {
                throw new Error("Image exceeds the 8 MB limit");
            }
            const chunks = [];
            let size = 0;
            for await (const chunk of response.body) {
                size += chunk.length;
                if (size > MAX_BYTES) { throw new Error("Image exceeds the 8 MB limit"); }
                chunks.push(Buffer.from(chunk));
            }
            bytes = Buffer.concat(chunks);
        }
        if (bytes.length > MAX_BYTES) { throw new Error("Image exceeds the 8 MB limit"); }
        const mediaType = _imageType(bytes);
        if (!mediaType) { throw new Error("The URL does not contain a supported image"); }
        return {dataUrl: "data:" + mediaType + ";base64," + bytes.toString("base64")};
    } catch (error) {
        return {error: error.message};
    } finally {
        clearTimeout(timer);
        if (controller) { controller.abort(); }
    }
}

exports.readImage = readImage;
