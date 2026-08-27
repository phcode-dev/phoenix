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

    const Constants = require("extensionsIntegrated/MigrateAssist/constants"),
        ZipUtils = require("utils/ZipUtils");

    describe("unit:MigrateAssist", function () {

        const DAY = 24 * 60 * 60 * 1000;

        describe("constants", function () {

            describe("daysToSunset", function () {

                it("should count whole days remaining", function () {
                    expect(Constants.daysToSunset(Constants.SUNSET_DATE - (10 * DAY))).toBe(10);
                    expect(Constants.daysToSunset(Constants.SUNSET_DATE - DAY)).toBe(1);
                });

                it("should round a part day up, so the last day never reads as zero", function () {
                    expect(Constants.daysToSunset(Constants.SUNSET_DATE - 1)).toBe(1);
                    expect(Constants.daysToSunset(Constants.SUNSET_DATE - (DAY + 1))).toBe(2);
                });

                it("should floor at zero on and after the sunset date", function () {
                    expect(Constants.daysToSunset(Constants.SUNSET_DATE)).toBe(0);
                    expect(Constants.daysToSunset(Constants.SUNSET_DATE + DAY)).toBe(0);
                });
            });

            describe("isPastSunset", function () {

                it("should be false before the date and true on or after it", function () {
                    expect(Constants.isPastSunset(Constants.SUNSET_DATE - 1)).toBe(false);
                    expect(Constants.isPastSunset(Constants.SUNSET_DATE)).toBe(true);
                    expect(Constants.isPastSunset(Constants.SUNSET_DATE + DAY)).toBe(true);
                });
            });

            describe("origins", function () {

                it("should ignore the dev override inside test windows", function () {
                    // The override exists so the flow can be exercised locally. It must never apply in
                    // a test window, otherwise a stray localStorage value could repoint a real
                    // migration.
                    expect(Constants.getLegacyOrigin()).toBe("https://staging.phcode.dev");
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
                    {type: "MIGRATE_BUNDLE", id: "/fs/local"}
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

            it("should report a scan describing the projects, prefs and extensions", async function () {
                const helper = openHelper(location.origin);
                await helper.ready;
                send(helper, {type: "MIGRATE_SCAN"});
                await awaitsFor(function () {
                    return !!lastOfType(helper.received, "MIGRATE_SCAN_RESULT");
                }, "scan result", 20000);

                const scan = lastOfType(helper.received, "MIGRATE_SCAN_RESULT");
                expect(typeof scan.hasData).toBe("boolean");
                expect(Array.isArray(scan.bundles)).toBe(true);
                for (const bundle of scan.bundles) {
                    // Every bundle must name a real destination and be one of the roots we allow.
                    expect(typeof bundle.dest).toBe("string");
                    expect(bundle.dest.startsWith("/fs/")).toBe(true);
                    expect(bundle.fileCount).toBeGreaterThan(0);
                }
            });

            it("should refuse to zip anything outside the migratable roots", async function () {
                const helper = openHelper(location.origin);
                await helper.ready;
                const escapes = [
                    "/mnt",
                    "/fs/app",
                    "/fs/local/../../mnt",
                    "/fs/app/extensions/user/../../aiHistory",
                    OUTSIDE_ROOTS,
                    `${SEEDED_PROJECT}/nested`
                ];
                escapes.forEach((id) => send(helper, {type: "MIGRATE_BUNDLE", id: id}));
                await awaitsFor(function () {
                    return helper.received.filter((m) => m.type === "MIGRATE_ERROR").length === escapes.length;
                }, "every escaping path to be rejected", 10000);
                expect(lastOfType(helper.received, "MIGRATE_CHUNK")).toBe(null);
            });

            it("should round trip a real folder, overwriting collisions and keeping extras", async function () {
                const helper = openHelper(location.origin);
                await helper.ready;
                send(helper, {type: "MIGRATE_SCAN"});
                await awaitsFor(function () {
                    return !!lastOfType(helper.received, "MIGRATE_SCAN_RESULT");
                }, "scan result", 20000);

                const scan = lastOfType(helper.received, "MIGRATE_SCAN_RESULT");
                // Our own seeded project, not whatever happened to be lying around. It also counts as
                // real user data, so the helper must report there is something worth migrating.
                expect(scan.hasData).toBe(true);
                const bundle = scan.bundles.find((b) => b.dest === SEEDED_PROJECT);
                expect(bundle).toBeTruthy();
                expect(bundle.fileCount).toBe(3);

                send(helper, {type: "MIGRATE_BUNDLE", id: bundle.id});
                await awaitsFor(function () {
                    const last = lastOfType(helper.received, "MIGRATE_CHUNK");
                    return !!last && last.last === true;
                }, "all chunks to arrive", 60000);

                const chunks = helper.received.filter((m) => m.type === "MIGRATE_CHUNK" && m.id === bundle.id);
                const meta = lastOfType(helper.received, "MIGRATE_BUNDLE_META");
                expect(chunks.length).toBe(meta.chunkCount);

                const total = chunks.reduce((sum, c) => sum + c.chunk.byteLength, 0);
                expect(total).toBe(meta.totalBytes);
                const merged = new Uint8Array(total);
                let offset = 0;
                chunks.sort((a, b) => a.index - b.index).forEach((c) => {
                    merged.set(new Uint8Array(c.chunk), offset);
                    offset = offset + c.chunk.byteLength;
                });

                // Pre-seed the destination the way the receiving origin would already look: one file
                // that collides with the incoming bundle, and one that exists only here.
                const dest = `${SANDBOX}/restored`;
                await Phoenix.VFS.ensureExistsDirAsync(dest);
                await Phoenix.VFS.writeFileAsync(`${dest}/index.html`, "I am the stale local copy", "utf8");
                await Phoenix.VFS.writeFileAsync(`${dest}/only-here.txt`, "keep me", "utf8");

                const ticks = [];
                await ZipUtils.unzipBinDataToLocation(merged.buffer, dest, false, function (done, totalCount) {
                    ticks.push({done, totalCount});
                    return true;
                });

                expect(ticks.length).toBeGreaterThan(0);
                expect(ticks[ticks.length - 1].done).toBe(ticks[ticks.length - 1].totalCount);

                // Source wins on a collision, and a file only present on the receiving side survives.
                expect(await Phoenix.VFS.readFileAsync(`${dest}/index.html`, "utf8")).toBe(TEXT_CONTENT);
                expect(await Phoenix.VFS.readFileAsync(`${dest}/only-here.txt`, "utf8")).toBe("keep me");
                // Nested paths keep their shape.
                expect(await Phoenix.VFS.readFileAsync(`${dest}/nested/deep.txt`, "utf8")).toBe(TEXT_CONTENT);
                // Binary survives byte for byte, NUL and high bytes included.
                const restoredBytes = new Uint8Array(
                    await Phoenix.VFS.readFileAsync(`${dest}/image.bin`, window.fs.BYTE_ARRAY_ENCODING));
                expect(Array.from(restoredBytes)).toEqual(Array.from(BINARY_BYTES));
            });
        });
    });
});
