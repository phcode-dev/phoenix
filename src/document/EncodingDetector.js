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

/*global fs*/

/**
 * Phoenix always decodes newly opened files as UTF-8 by default (see File.js/AppshellFileSystem.js).
 * That's correct for the vast majority of files, but some files - most commonly HTML/XML documents
 * authored a long time ago, or exported by legacy tools (old FrontPage/Dreamweaver, Windows editors,
 * etc) - are actually encoded in a legacy 8-bit charset like `windows-1252`, and self-declare that
 * fact via a `<meta charset>`/`Content-Type` tag. Force-decoding such a file as UTF-8 doesn't just
 * look wrong - the browser's `TextDecoder("utf8")` is non-fatal, so every undecodable byte is
 * silently and *irreversibly* replaced with U+FFFD ("<27>") the moment the file is read. Once that
 * happens the original bytes are gone; if the user then saves, the corruption is baked into the file
 * on disk too.
 *
 * This module lets us catch that case before the first (lossy) read ever happens, so newly opened
 * files get decoded with the encoding they actually declare - the same behavior a web browser
 * exhibits when honoring a page's own declared charset.
 *
 * Two independent signals are checked, from strongest to weakest:
 *   1. A byte-order-mark (BOM) - an unambiguous, extension-independent signal, so it's checked for
 *      any non-binary file (see detectFileEncoding's use of LanguageManager.isBinary()). This also
 *      means files like plain .txt with a genuine UTF-16/UTF-32 BOM now get decoded correctly on
 *      first open too, which - surprisingly - nothing did automatically before this module existed;
 *      previously that required manually picking the encoding from the status bar dropdown.
 *   2. A self-declared charset (`<meta charset>`/`Content-Type`) - only meaningful for markup file
 *      extensions (see SNIFFABLE_EXTENSIONS), and only trusted when the raw bytes are NOT already
 *      valid UTF-8. If they are, we trust that over any declaration - this avoids second-guessing
 *      modern UTF-8 files that simply have a stale/incorrect meta tag left over from a copy-paste.
 *      There is no BOM equivalent for single-byte legacy charsets like windows-1252 - a document
 *      declaring itself is the only signal there is.
 *
 * Either way, this is only ever used for a fresh, first-time open. Once a user has explicitly
 * picked an encoding for a path (via the status bar dropdown), that choice always wins - see
 * DocumentCommandHandlers.
 */
define(function (require, exports, module) {


    const FileUtils      = require("file/FileUtils"),
        LanguageManager = require("language/LanguageManager");

    /**
     * File extensions for which we attempt to sniff a self-declared charset.
     * @type {Array.<string>}
     */
    const SNIFFABLE_EXTENSIONS = ["html", "htm", "xhtml", "shtml", "php", "xml"];

    // The HTML5 spec only requires user agents to scan the first 1024 bytes of a document for a
    // charset declaration before starting to parse it; we use the same limit here.
    const SNIFF_BYTE_LIMIT = 1024;

    // Matches both `<meta charset="...">` and
    // `<meta http-equiv="Content-Type" content="text/html; charset=...">` style declarations.
    const META_CHARSET_RE = /<meta[^>]+charset\s*=\s*["']?\s*([a-zA-Z0-9_\-:.]+)/i;

    // Charset aliases that browsers commonly treat as equivalent to a related, better-supported
    // name (keyed/valued by the normalized form - see _normalizeEncodingName). Per the WHATWG
    // encoding spec, content labeled iso-8859-1 is treated as windows-1252 in practice, since
    // windows-1252 is a strict superset (it just assigns printable characters to the 0x80-0x9F
    // range that iso-8859-1 leaves as C1 control codes, which real-world content essentially
    // never intentionally uses).
    const CHARSET_ALIASES = {
        "latin1": "windows1252",
        "iso88591": "windows1252"
    };

    /**
     * @private
     * Normalizes a charset name the same way Phoenix's underlying iconv-lite based fs layer does
     * when looking up a codec (lower-cased, non-alphanumeric characters stripped) - eg
     * "windows-1252" and "Windows_1252" both become "windows1252". `fs.SUPPORTED_ENCODINGS` is
     * itself a list of already-normalized names, so declared charsets must be normalized the same
     * way before being compared against it or handed back as the encoding to decode with.
     * @param {string} name
     * @return {string}
     */
    function _normalizeEncodingName(name) {
        return name.toLowerCase().replace(/[^0-9a-z]/g, "");
    }

    const BOM_SIGNATURES = [
        {bytes: [0xEF, 0xBB, 0xBF], encoding: "utf8"},
        {bytes: [0xFF, 0xFE, 0x00, 0x00], encoding: "utf32le"},
        {bytes: [0x00, 0x00, 0xFE, 0xFF], encoding: "utf32be"},
        {bytes: [0xFF, 0xFE], encoding: "utf16le"},
        {bytes: [0xFE, 0xFF], encoding: "utf16be"}
    ];

    /**
     * @private
     * Returns the encoding named by a recognized byte-order-mark at the start of `bytes`, or null.
     * @param {Uint8Array} bytes
     * @return {?string}
     */
    function _detectBOM(bytes) {
        for (const sig of BOM_SIGNATURES) {
            if (bytes.length >= sig.bytes.length && sig.bytes.every(function (b, i) {
                return bytes[i] === b;
            })) {
                return sig.encoding;
            }
        }
        return null;
    }

    /**
     * @private
     * Extracts a declared charset name from a `<meta>` tag, if present in the given bytes. The
     * declaration itself is always plain ASCII per spec, so it's safe to scan for it by treating
     * the raw bytes as Latin-1/ASCII regardless of the file's real encoding.
     * @param {Uint8Array} bytes
     * @return {?string} lower-cased charset name, or null if none found
     */
    function _extractDeclaredCharset(bytes) {
        const prefix = bytes.subarray(0, Math.min(bytes.length, SNIFF_BYTE_LIMIT));
        let asciiText = "";
        for (let i = 0; i < prefix.length; i++) {
            asciiText += String.fromCharCode(prefix[i]);
        }
        const match = META_CHARSET_RE.exec(asciiText);
        return match ? match[1].toLowerCase() : null;
    }

    /**
     * @private
     * @param {Uint8Array} bytes
     * @return {boolean} true if `bytes` is well-formed UTF-8
     */
    function _isValidUTF8(bytes) {
        try {
            new TextDecoder("utf8", {fatal: true}).decode(bytes);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Given the raw bytes of a file and its extension, determine whether a non-default encoding
     * should be used to decode it. Pure/synchronous - does no I/O.
     *
     * @param {string} extension lower-case file extension, no leading dot
     * @param {Uint8Array} bytes raw file content
     * @param {Array.<string>=} supportedEncodings encoding names Phoenix's fs layer can decode with;
     *      defaults to `fs.SUPPORTED_ENCODINGS` when running in the app.
     * @return {?string} the encoding name to use, or null to keep the default (utf8)
     */
    function detectEncodingFromBytes(extension, bytes, supportedEncodings) {
        if (!bytes || !bytes.length) {
            return null;
        }

        const bom = _detectBOM(bytes);
        if (bom) {
            // An explicit BOM is unambiguous. A utf-8 BOM just means "definitely utf-8", which is
            // already our default, so nothing to override there.
            return bom === "utf8" ? null : bom;
        }

        if (SNIFFABLE_EXTENSIONS.indexOf(extension) === -1) {
            return null;
        }

        if (_isValidUTF8(bytes)) {
            return null;
        }

        const rawDeclared = _extractDeclaredCharset(bytes);
        if (!rawDeclared) {
            return null;
        }

        let declared = _normalizeEncodingName(rawDeclared);
        declared = CHARSET_ALIASES[declared] || declared;

        if (declared === "utf8") {
            // Declared utf-8 but isn't valid utf-8 bytes - nothing sane we can substitute, so we
            // just keep decoding as utf-8 (matching today's behavior) rather than guessing further.
            return null;
        }

        supportedEncodings = supportedEncodings || (typeof fs !== "undefined" && fs.SUPPORTED_ENCODINGS);
        if (supportedEncodings && supportedEncodings.indexOf(declared) === -1) {
            return null;
        }

        return declared;
    }

    /**
     * Attempts to detect a non-default encoding for `file` before it's opened for the first time,
     * by reading its raw bytes and looking for a BOM or (for markup files) a self-declared charset
     * (see detectEncodingFromBytes). Never rejects - resolves with null if detection isn't
     * applicable to this file, or nothing conclusive was found, in which case the caller should
     * just fall back to the normal default (utf8) decode.
     *
     * We only skip reading the file at all when it's a known binary type (image, font, zip, etc) -
     * same check the rest of the app uses (LanguageManager's isBinary()) to decide whether a file
     * should ever be treated as text. Anything else is fair game for a BOM, even if its extension
     * isn't one we scan for a `<meta charset>` declaration (see SNIFFABLE_EXTENSIONS) - a BOM is a
     * cheap, unambiguous signal that doesn't depend on file type the way a meta tag scan does.
     *
     * @param {File} file
     * @return {$.Promise} resolved with the detected encoding name, or null
     */
    function detectFileEncoding(file) {
        const result = new $.Deferred();
        const language = LanguageManager.getLanguageForPath(file.fullPath);

        if (language.isBinary()) {
            result.resolve(null);
            return result.promise();
        }

        const extension = FileUtils.getFileExtension(file.fullPath).toLowerCase();
        file.read({encoding: window.fs.BYTE_ARRAY_ENCODING, doNotCache: true}, function (err, content) {
            if (err || !content) {
                result.resolve(null);
                return;
            }
            const bytes = new Uint8Array(content);
            result.resolve(detectEncodingFromBytes(extension, bytes, window.fs.SUPPORTED_ENCODINGS));
        });

        return result.promise();
    }

    /**
     * True if `encoding` is a real text codec name, as opposed to the non-text sentinel value
     * (`fs.BYTE_ARRAY_ENCODING`, i.e. "byte_array" - notably still present in
     * `fs.SUPPORTED_ENCODINGS`, so that list alone can't be used to tell them apart) that plenty of
     * *other* call sites across the codebase pass to `File.read()` for legitimate non-text reasons
     * (downloading a file, attaching an image, exporting a zip, etc) - and, unless they also pass
     * `doNotCache: true`, leave cached in `file._encoding` as a side effect of File.read()'s
     * caching (see File.js). A File instance touched that way before ever being opened as a
     * document would otherwise look "already known" to a naive truthiness check, silently
     * defeating both detection and the re-open-skip optimization in DocumentCommandHandlers.
     * @param {?string} encoding
     * @return {boolean}
     */
    function isKnownTextEncoding(encoding) {
        return !!encoding && encoding !== window.fs.BYTE_ARRAY_ENCODING;
    }

    exports.SNIFFABLE_EXTENSIONS      = SNIFFABLE_EXTENSIONS;
    exports.detectEncodingFromBytes   = detectEncodingFromBytes;
    exports.detectFileEncoding        = detectFileEncoding;
    exports.isKnownTextEncoding       = isKnownTextEncoding;
});
