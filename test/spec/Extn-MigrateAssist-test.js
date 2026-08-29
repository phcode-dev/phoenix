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

/*global describe, it, expect, beforeAll, afterAll, afterEach, awaitsFor */

define(function (require, exports, module) {

    // The migration off the legacy web origin is browser only. The desktop app never runs any of it,
    // and its origin is phtauri://localhost, which migrateAssist.html refuses by design since a
    // native shell has no business reading a web origin's filesystem. Nothing here is meaningful in
    // the desktop test runner, so the whole suite sits this one out.
    if (Phoenix.isNativeApp) {
        return;
    }

    const Constants = require("extensionsIntegrated/MigrateAssist/constants");

    describe("unit:MigrateAssist", function () {

        describe("constants", function () {

            describe("origins", function () {

                it("should ignore the dev override inside test windows", function () {
                    // The override exists so the flow can be exercised locally. It must never apply in
                    // a test window, otherwise a stray localStorage value could repoint a real
                    // migration. Pinning the literals also catches a staging origin being shipped to
                    // production, which would point the migration at the wrong storage.
                    expect(Constants.getLegacyOrigin()).toBe("https://phcode.dev");
                    expect(Constants.getNewOrigin()).toBe("https://web.phcode.dev");
                });

                it("should not treat the spec runner as either migration origin", function () {
                    expect(Constants.isLegacyOrigin()).toBe(false);
                    expect(Constants.isNewOrigin()).toBe(false);
                });
            });

            describe("getMigrateAssistURL", function () {

                it("should point at the legacy origin", function () {
                    expect(Constants.getMigrateAssistURL().startsWith(Constants.getLegacyOrigin())).toBe(true);
                });

                it("should mirror the current path prefix rather than assuming the origin root", function () {
                    // Production serves the app at "/", but the dev server serves it under "/src/" and
                    // the spec runner under "/test/". Hardcoding "/" would 404 in both of those.
                    const pathname = location.pathname;
                    const prefix = pathname.substring(0, pathname.lastIndexOf("/") + 1);
                    expect(Constants.getMigrateAssistURL())
                        .toBe(`${Constants.getLegacyOrigin()}${prefix}migrateAssist.html`);
                });
            });

            describe("browser support", function () {

                it("should exclude Safari and iOS and include everything else", function () {
                    const expected = !(Phoenix.browser.desktop.isSafari || Phoenix.browser.mobile.isIos);
                    expect(Constants.isMigrationSupportedBrowser()).toBe(expected);
                });
            });
        });

        // migrateAssist.html is the half of the migration that runs on the origin being retired. It
        // is a standalone page rather than part of the app, so the only way to test it honestly is to
        // load it and speak the real protocol to it. The iframe here is that page, not an embedded
        // Phoenix instance, so this belongs in the unit category.
        describe("helper page", function () {

            const HELPER_URL = `${Phoenix.baseURL}migrateAssist.html`;
            const SANDBOX = "/temp/migrate-assist-spec";
            const OUTSIDE_ROOTS = `${SANDBOX}/not-a-migratable-root`;

            // A project of our own under /fs/local, which is one of the roots the helper serves. The
            // suite must not depend on whatever projects happen to already exist: a fresh CI checkout
            // has none, so reading bundles[0] there found nothing at all.
            const SEEDED_PROJECT = "/fs/local/__migrate_assist_spec__";
            const TEXT_CONTENT = "hello from the old origin\n";
            // Includes NUL and 0xFF so a byte exact copy can be told apart from a text round trip.
            const BINARY_BYTES = new Uint8Array([0x00, 0x01, 0xFF, 0xFE, 0x7F, 0x80, 0x00, 0x42]);

            let frames = [];

            /**
             * Loads the helper page and collects everything it posts back.
             */
            function openHelper(parentOrigin) {
                const received = [];
                const iframe = document.createElement("iframe");
                iframe.style.display = "none";
                const ready = new Promise((resolve) => {
                    function onMessage(event) {
                        if (event.source !== iframe.contentWindow) {
                            return;
                        }
                        received.push(event.data);
                        if (event.data && event.data.type === "MIGRATE_READY") {
                            resolve();
                        }
                    }
                    window.addEventListener("message", onMessage);
                    iframe._cleanup = function () {
                        window.removeEventListener("message", onMessage);
                        iframe.remove();
                    };
                });
                iframe.src = `${HELPER_URL}?parentOrigin=${encodeURIComponent(parentOrigin)}`;
                document.body.appendChild(iframe);
                frames.push(iframe);
                return { iframe, received, ready };
            }

            function send(helper, message) {
                helper.iframe.contentWindow.postMessage(message, location.origin);
            }

            function lastOfType(received, type) {
                for (let i = received.length - 1; i >= 0; i--) {
                    if (received[i] && received[i].type === type) {
                        return received[i];
                    }
                }
                return null;
            }

            beforeAll(async function () {
                await Phoenix.VFS.unlinkAsync(SANDBOX).catch(() => {});
                await Phoenix.VFS.unlinkAsync(SEEDED_PROJECT).catch(() => {});
                await Phoenix.VFS.ensureExistsDirAsync(`${SEEDED_PROJECT}/nested`);
                await Phoenix.VFS.ensureExistsDirAsync(OUTSIDE_ROOTS);
                await Phoenix.VFS.writeFileAsync(`${SEEDED_PROJECT}/index.html`, TEXT_CONTENT, "utf8");
                await Phoenix.VFS.writeFileAsync(`${SEEDED_PROJECT}/nested/deep.txt`, TEXT_CONTENT, "utf8");
                await Phoenix.VFS.writeFileAsync(`${SEEDED_PROJECT}/image.bin`,
                    window.Filer.Buffer.from(BINARY_BYTES), window.fs.BYTE_ARRAY_ENCODING);
            });

            afterAll(async function () {
                await Phoenix.VFS.unlinkAsync(SANDBOX).catch(() => {});
                await Phoenix.VFS.unlinkAsync(SEEDED_PROJECT).catch(() => {});
            });

            afterEach(function () {
                frames.forEach((frame) => frame._cleanup && frame._cleanup());
                frames = [];
            });

            /**
             * Proving a negative needs a bound on "long enough". Rather than sleeping for an arbitrary
             * period, run a trusted helper alongside the untrusted one and wait for the trusted one to
             * complete a full handshake and scan. Once that has happened, the untrusted page has
             * demonstrably had more than enough time to answer, and its silence means something.
             */
            async function expectSilenceWhile(untrusted, forgedMessages) {
                const control = openHelper(location.origin);
                await control.ready;
                forgedMessages.forEach((message) => send(untrusted, message));
                send(control, {type: "MIGRATE_SCAN"});
                await awaitsFor(function () {
                    return !!lastOfType(control.received, "MIGRATE_SCAN_RESULT");
                }, "the trusted control to finish a full exchange", 20000);
                expect(untrusted.received.length).toBe(0);
            }

            it("should hand nothing at all to an untrusted parent origin", async function () {
                const helper = openHelper("https://web.phcode.dev.evil.example");
                await expectSilenceWhile(helper, [
                    {type: "MIGRATE_SCAN"},
                    {type: "MIGRATE_READ", path: "/fs/local/anything.txt"}
                ]);
            });

            it("should refuse an origin that only shares a prefix with a trusted one", async function () {
                // A startsWith check would let this through and hand over every file the user owns.
                const helper = openHelper(`${location.origin}.evil.example`);
                await expectSilenceWhile(helper, [{type: "MIGRATE_SCAN"}]);
            });

            it("should complete the handshake for a trusted parent origin", async function () {
                const helper = openHelper(location.origin);
                await helper.ready;
                expect(lastOfType(helper.received, "MIGRATE_READY")).not.toBe(null);
            });

            it("should report a scan listing every migratable file", async function () {
                const helper = openHelper(location.origin);
                await helper.ready;
                send(helper, {type: "MIGRATE_SCAN"});
                await awaitsFor(function () {
                    return !!lastOfType(helper.received, "MIGRATE_SCAN_RESULT");
                }, "scan result", 20000);

                const scan = lastOfType(helper.received, "MIGRATE_SCAN_RESULT");
                expect(scan.hasData).toBe(true);
                expect(Array.isArray(scan.files)).toBe(true);
                scan.files.forEach(function (file) {
                    // Every path handed out must sit under one of the roots we agreed to serve.
                    expect(file.path.startsWith("/fs/local/")
                        || file.path.startsWith("/fs/app/extensions/")).toBe(true);
                });
                const seeded = scan.files.filter((f) => f.path.startsWith(`${SEEDED_PROJECT}/`));
                expect(seeded.length).toBe(3);
            });

            it("should refuse to read anything outside the migratable roots", async function () {
                const helper = openHelper(location.origin);
                await helper.ready;
                const escapes = [
                    "/mnt/somefolder/secret.txt",
                    "/fs/app/phcode.json",
                    "/fs/app/aiHistory/session.json",
                    "/fs/local/../../mnt/secret.txt",
                    `${OUTSIDE_ROOTS}/secret.txt`
                ];
                escapes.forEach((path) => send(helper, {type: "MIGRATE_READ", path: path}));
                await awaitsFor(function () {
                    return helper.received.filter((m) => m.type === "MIGRATE_ERROR").length === escapes.length;
                }, "every escaping path to be rejected", 10000);
                expect(lastOfType(helper.received, "MIGRATE_DATA")).toBe(null);
            });

            it("should stream files back byte for byte", async function () {
                const helper = openHelper(location.origin);
                await helper.ready;
                send(helper, {type: "MIGRATE_SCAN"});
                await awaitsFor(function () {
                    return !!lastOfType(helper.received, "MIGRATE_SCAN_RESULT");
                }, "scan result", 20000);

                const scan = lastOfType(helper.received, "MIGRATE_SCAN_RESULT");
                const wanted = [`${SEEDED_PROJECT}/index.html`, `${SEEDED_PROJECT}/nested/deep.txt`,
                    `${SEEDED_PROJECT}/image.bin`];
                wanted.forEach(function (path) {
                    expect(scan.files.some((f) => f.path === path)).toBe(true);
                });

                async function fetchOne(path) {
                    send(helper, {type: "MIGRATE_READ", path: path, offset: 0, length: 8 * 1024 * 1024});
                    await awaitsFor(function () {
                        return helper.received.some((m) => m.type === "MIGRATE_DATA" && m.path === path && m.eof);
                    }, `data for ${path}`, 20000);
                    const msg = helper.received.filter((m) => m.type === "MIGRATE_DATA" && m.path === path).pop();
                    return new Uint8Array(msg.chunk);
                }

                // Text survives, nested paths keep their shape.
                expect(new TextDecoder().decode(await fetchOne(wanted[0]))).toBe(TEXT_CONTENT);
                expect(new TextDecoder().decode(await fetchOne(wanted[1]))).toBe(TEXT_CONTENT);
                // Binary survives byte for byte, NUL and high bytes included, rather than being
                // mangled through a text decode.
                expect(Array.from(await fetchOne(wanted[2]))).toEqual(Array.from(BINARY_BYTES));
            });

        });
    });
});
