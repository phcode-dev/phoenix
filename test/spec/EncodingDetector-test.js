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

/*global describe, it, expect, awaitsForDone */
/*unittests: EncodingDetector*/

define(function (require, exports, module) {


    const EncodingDetector = require("document/EncodingDetector");

    // Builds a Uint8Array where each char code (0-255) becomes exactly one byte. Lets tests
    // express arbitrary single-byte-encoded content (eg windows-1252) as a plain JS string
    // without needing a real encoder: any char code above 0x7F is used as the raw byte value,
    // which is exactly what windows-1252/latin1 do for the accented letters used below.
    function bytesFromLatin1(str) {
        const arr = new Uint8Array(str.length);
        for (let i = 0; i < str.length; i++) {
          // eslint-disable-next-line no-bitwise
            arr[i] = str.charCodeAt(i) & 0xFF;
        }
        return arr;
    }

    function bytesFromUTF8(str) {
        return new TextEncoder().encode(str);
    }

    // 0xE9 is "é" in both windows-1252 and latin1, but is not a valid standalone UTF-8 byte.
    const WIN1252_E_ACUTE = String.fromCharCode(0xE9);

    // matches the normalized (non-alphanumeric-stripped) form Phoenix's fs.SUPPORTED_ENCODINGS uses
    const SUPPORTED = ["utf8", "windows1252", "iso88591", "utf16le", "utf16be", "utf32le", "utf32be"];

    describe("EncodingDetector", function () {

        describe("detectEncodingFromBytes", function () {

            it("should return null for empty/missing bytes", function () {
                expect(EncodingDetector.detectEncodingFromBytes("html", new Uint8Array(0), SUPPORTED)).toBeNull();
                expect(EncodingDetector.detectEncodingFromBytes("html", null, SUPPORTED)).toBeNull();
            });

            it("should ignore non-sniffable extensions even with a declared charset", function () {
                const bytes = bytesFromLatin1(
                    '<meta charset="windows-1252"> caf' + WIN1252_E_ACUTE
                );
                expect(EncodingDetector.detectEncodingFromBytes("js", bytes, SUPPORTED)).toBeNull();
                expect(EncodingDetector.detectEncodingFromBytes("txt", bytes, SUPPORTED)).toBeNull();
            });

            it("should detect windows-1252 from a short-form <meta charset> tag", function () {
                const bytes = bytesFromLatin1(
                    '<html><head><meta charset="windows-1252"></head><body>caf' +
                        WIN1252_E_ACUTE + '</body></html>'
                );
                expect(EncodingDetector.detectEncodingFromBytes("html", bytes, SUPPORTED)).toBe("windows1252");
            });

            it("should detect windows-1252 from a Content-Type http-equiv meta tag", function () {
                // this is exactly the shape FrontPage/legacy authoring tools emit, and what the
                // original bug report's file used.
                const bytes = bytesFromLatin1(
                    '<meta http-equiv="Content-Type" content="text/html; charset=windows-1252">' +
                        'supermarch' + WIN1252_E_ACUTE
                );
                expect(EncodingDetector.detectEncodingFromBytes("html", bytes, SUPPORTED)).toBe("windows1252");
            });

            it("should alias iso-8859-1 and latin1 declarations to windows-1252", function () {
                const isoBytes = bytesFromLatin1(
                    '<meta charset="iso-8859-1">caf' + WIN1252_E_ACUTE
                );
                const latin1Bytes = bytesFromLatin1(
                    '<meta charset="latin1">caf' + WIN1252_E_ACUTE
                );
                expect(EncodingDetector.detectEncodingFromBytes("html", isoBytes, SUPPORTED)).toBe("windows1252");
                expect(EncodingDetector.detectEncodingFromBytes("html", latin1Bytes, SUPPORTED)).toBe("windows1252");
            });

            it("should trust valid UTF-8 content over a stale/incorrect meta declaration", function () {
                // declares windows-1252, but the bytes are actually well-formed utf-8 - keep utf-8.
                const bytes = bytesFromUTF8('<meta charset="windows-1252">café supermarché');
                expect(EncodingDetector.detectEncodingFromBytes("html", bytes, SUPPORTED)).toBeNull();
            });

            it("should return null when the declared charset is utf-8 but the bytes aren't valid utf-8", function () {
                const bytes = bytesFromLatin1(
                    '<meta charset="utf-8">caf' + WIN1252_E_ACUTE
                );
                expect(EncodingDetector.detectEncodingFromBytes("html", bytes, SUPPORTED)).toBeNull();
            });

            it("should return null when no charset is declared at all", function () {
                const bytes = bytesFromLatin1('<html><body>caf' + WIN1252_E_ACUTE + '</body></html>');
                expect(EncodingDetector.detectEncodingFromBytes("html", bytes, SUPPORTED)).toBeNull();
            });

            it("should return null when the declared charset isn't in the supported encodings list", function () {
                const bytes = bytesFromLatin1(
                    '<meta charset="made-up-charset-xyz">caf' + WIN1252_E_ACUTE
                );
                expect(EncodingDetector.detectEncodingFromBytes("html", bytes, SUPPORTED)).toBeNull();
            });

            it("should fall back to the global fs.SUPPORTED_ENCODINGS when none is passed in", function () {
                const bytes = bytesFromLatin1(
                    '<meta charset="windows-1252">caf' + WIN1252_E_ACUTE
                );
                // running inside the real Phoenix shell, `fs.SUPPORTED_ENCODINGS` genuinely lists
                // windows-1252 (backed by the bundled iconv-lite codec table).
                expect(EncodingDetector.detectEncodingFromBytes("html", bytes)).toBe("windows1252");
            });

            it("should honor a BOM even on a non-sniffable extension, and take precedence over any meta tag", function () {
                const utf16leBOM = new Uint8Array([0xFF, 0xFE, 0x61, 0x00]); // BOM + 'a'
                expect(EncodingDetector.detectEncodingFromBytes("txt", utf16leBOM, SUPPORTED)).toBe("utf16le");

                const utf16beBOM = new Uint8Array([0xFE, 0xFF, 0x00, 0x61]);
                expect(EncodingDetector.detectEncodingFromBytes("html", utf16beBOM, SUPPORTED)).toBe("utf16be");

                const utf32leBOM = new Uint8Array([0xFF, 0xFE, 0x00, 0x00, 0x61, 0x00, 0x00, 0x00]);
                expect(EncodingDetector.detectEncodingFromBytes("txt", utf32leBOM, SUPPORTED)).toBe("utf32le");

                const utf32beBOM = new Uint8Array([0x00, 0x00, 0xFE, 0xFF, 0x00, 0x00, 0x00, 0x61]);
                expect(EncodingDetector.detectEncodingFromBytes("txt", utf32beBOM, SUPPORTED)).toBe("utf32be");
            });

            it("should return null for a utf-8 BOM since that's already the default", function () {
                const utf8BOM = new Uint8Array([0xEF, 0xBB, 0xBF, 0x61]);
                expect(EncodingDetector.detectEncodingFromBytes("html", utf8BOM, SUPPORTED)).toBeNull();
            });

        });

        describe("detectFileEncoding", function () {

            function makeMockFile(fullPath, readResult) {
                let readCalled = false;
                return {
                    fullPath: fullPath,
                    _readCalled: function () {
                        return readCalled;
                    },
                    read: function (options, callback) {
                        readCalled = true;
                        if (readResult.err) {
                            callback(readResult.err);
                        } else {
                            callback(null, readResult.content);
                        }
                    }
                };
            }

            it("should resolve the detected encoding for a sniffable file with a declared charset", async function () {
                const bytes = bytesFromLatin1(
                    '<meta http-equiv="Content-Type" content="text/html; charset=windows-1252">caf' +
                        WIN1252_E_ACUTE
                );
                const file = makeMockFile("/proj/eu_format_test.html", {content: bytes.buffer});
                let detected;
                await awaitsForDone(
                    EncodingDetector.detectFileEncoding(file).done(function (result) {
                        detected = result;
                    })
                );
                expect(detected).toBe("windows1252");
            });

            it("should resolve null without reading the file for a binary extension", async function () {
                const file = makeMockFile("/proj/photo.png", {content: new ArrayBuffer(0)});
                let detected = "unset";
                await awaitsForDone(
                    EncodingDetector.detectFileEncoding(file).done(function (result) {
                        detected = result;
                    })
                );
                expect(detected).toBeNull();
                expect(file._readCalled()).toBe(false);
            });

            it("should still detect a BOM on a non-markup (but non-binary) extension like .txt/.js", async function () {
                // Regression test: a BOM is unambiguous and extension-independent, unlike the
                // <meta charset> scan which only makes sense for markup files - a plain .txt or .js
                // file with a real UTF-16 BOM must still be auto-detected correctly.
                const utf16beBOM = new Uint8Array([0xFE, 0xFF, 0x00, 0x61]);
                const txtFile = makeMockFile("/proj/notes.txt", {content: utf16beBOM.buffer});
                const jsFile = makeMockFile("/proj/script.js", {content: utf16beBOM.buffer});

                let txtDetected, jsDetected;
                await awaitsForDone(
                    EncodingDetector.detectFileEncoding(txtFile).done(function (result) {
                        txtDetected = result;
                    })
                );
                await awaitsForDone(
                    EncodingDetector.detectFileEncoding(jsFile).done(function (result) {
                        jsDetected = result;
                    })
                );

                expect(txtDetected).toBe("utf16be");
                expect(jsDetected).toBe("utf16be");
                expect(txtFile._readCalled()).toBe(true);
                expect(jsFile._readCalled()).toBe(true);
            });

            it("should NOT scan for a <meta charset> declaration on a non-markup extension", async function () {
                // a declared charset only makes sense for markup files - a .js/.txt file that
                // happens to contain a "charset=windows-1252"-looking string (eg inside a comment
                // or string literal) must not be reinterpreted based on it.
                const bytes = bytesFromLatin1(
                    '// <meta charset="windows-1252"> not real markup, just a comment: caf' +
                        WIN1252_E_ACUTE
                );
                const file = makeMockFile("/proj/script.js", {content: bytes.buffer});
                let detected;
                await awaitsForDone(
                    EncodingDetector.detectFileEncoding(file).done(function (result) {
                        detected = result;
                    })
                );
                expect(detected).toBeNull();
                expect(file._readCalled()).toBe(true);
            });

            it("should resolve null (not reject) when the file read fails", async function () {
                const file = makeMockFile("/proj/broken.html", {err: "NotFound"});
                let detected = "unset", rejected = false;
                await awaitsForDone(
                    EncodingDetector.detectFileEncoding(file)
                        .done(function (result) {
                            detected = result;
                        })
                        .fail(function () {
                            rejected = true;
                        })
                );
                expect(detected).toBeNull();
                expect(rejected).toBe(false);
            });

            it("should resolve null for well-formed utf-8 html regardless of a stale meta charset", async function () {
                const bytes = bytesFromUTF8('<meta charset="windows-1252">café');
                const file = makeMockFile("/proj/modern.html", {content: bytes.buffer});
                let detected;
                await awaitsForDone(
                    EncodingDetector.detectFileEncoding(file).done(function (result) {
                        detected = result;
                    })
                );
                expect(detected).toBeNull();
            });

        });
    });
});
