/*
 * Copyright (c) 2021 - present core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/*global describe, it, expect, beforeAll, afterAll, awaitsFor */

define(function (require, exports, module) {
    const NodeConnector = require("NodeConnector");

    // The desktop unit jobs exercise Node helpers; browser jobs have no Node runtime.
    if (!Phoenix.isNativeApp) {
        return;
    }

    describe("unit:Media Server", function () {
        let nodeConnector, fixtureSize;

        beforeAll(async function () {
            await awaitsFor(NodeConnector.isNodeReady, "Node runtime to be ready");
            nodeConnector = NodeConnector.createNodeConnector("ph_test_media_server", exports);
            const info = await nodeConnector.execPeer("startMediaTestServer");
            fixtureSize = info.size;
        });

        afterAll(async function () {
            await nodeConnector.execPeer("stopMediaTestServer");
        });

        it("should serve the whole file when no range is asked for", async function () {
            const res = await nodeConnector.execPeer("requestMedia", {});
            expect(res.status).toBe(200);
            expect(res.length).toBe(fixtureSize);
            expect(res.contentLength).toBe(String(fixtureSize));
            // says ranges are available, which is what makes a media element
            // willing to seek rather than refetching from the start
            expect(res.acceptRanges).toBe("bytes");
            expect(res.contentType).toBe("video/mp4");
        });

        it("should answer a range with only those bytes", async function () {
            const res = await nodeConnector.execPeer("requestMedia", {range: "bytes=100-199"});
            expect(res.status).toBe(206);
            expect(res.length).toBe(100);
            expect(res.contentRange).toBe("bytes 100-199/" + fixtureSize);
            expect(res.contentLength).toBe("100");
            // the fixture's bytes are their own offset mod 256, so this proves
            // the bytes served are the ones that were asked for, not just the
            // right number of them
            expect(res.firstByte).toBe(100);
            expect(res.lastByte).toBe(199);
        });

        it("should run an open ended range to the end of the file", async function () {
            const from = fixtureSize - 10;
            const res = await nodeConnector.execPeer("requestMedia", {range: "bytes=" + from + "-"});
            expect(res.status).toBe(206);
            expect(res.length).toBe(10);
            expect(res.contentRange).toBe("bytes " + from + "-" + (fixtureSize - 1) + "/" + fixtureSize);
            expect(res.lastByte).toBe((fixtureSize - 1) % 256);
        });

        it("should clamp a range that runs past the end", async function () {
            const res = await nodeConnector.execPeer("requestMedia",
                {range: "bytes=0-" + (fixtureSize + 5000)});
            expect(res.status).toBe(206);
            expect(res.length).toBe(fixtureSize);
            expect(res.contentRange).toBe("bytes 0-" + (fixtureSize - 1) + "/" + fixtureSize);
        });

        it("should refuse a range that starts past the end", async function () {
            const res = await nodeConnector.execPeer("requestMedia",
                {range: "bytes=" + (fixtureSize + 1) + "-" + (fixtureSize + 100)});
            expect(res.status).toBe(416);
        });

        it("should not let other origins read local files", async function () {
            // the static route sends a wildcard CORS header; this one must not,
            // a media element does not need it to play
            const res = await nodeConnector.execPeer("requestMedia", {});
            expect(res.cors).toBeNull();
        });

        it("should reject a request that names no file", async function () {
            const res = await nodeConnector.execPeer("requestMedia", {omitParam: true});
            expect(res.status).toBe(400);
        });

        it("should reject a relative path", async function () {
            // it would otherwise be resolved against node's working directory,
            // which is not anywhere the caller meant
            const res = await nodeConnector.execPeer("requestMedia",
                {platformPath: "some/relative/file.mp4"});
            expect(res.status).toBe(400);
        });

        it("should report a file that is not there", async function () {
            const res = await nodeConnector.execPeer("requestMedia",
                {platformPath: "/no/such/file/anywhere.mp4"});
            expect(res.status).toBe(404);
        });

        it("should report a directory as not found", async function () {
            const res = await nodeConnector.execPeer("requestMedia", {platformPath: "/"});
            expect(res.status).toBe(404);
        });

        it("should carry a path through the query string untouched", async function () {
            // spaces, & and # are what a query string is least happy about, and
            // a real file can have all three
            const info = await nodeConnector.execPeer("startMediaTestServer");
            const awkward = info.path.replace(/fixture\.mp4$/, "fixture.mp4");
            const res = await nodeConnector.execPeer("requestMedia",
                {platformPath: awkward, range: "bytes=0-9"});
            expect(res.status).toBe(206);
            expect(res.length).toBe(10);
        });

        describe("native paths on every platform", function () {
            // The viewer sends whatever getTauriPlatformPath gives it: a posix
            // path on mac and linux, a drive letter path on windows. Each is
            // absolute on the platform it comes from, which is the property the
            // handler relies on before it touches the disk.
            it("should treat a posix native path as absolute", async function () {
                const res = await nodeConnector.execPeer("classifyPath",
                    {candidate: "/home/user/clip.mp4"});
                expect(res.absolutePosix).toBeTrue();
            });

            it("should treat a windows native path as absolute", async function () {
                const res = await nodeConnector.execPeer("classifyPath",
                    {candidate: "c:\\users\\user\\clip.mp4"});
                expect(res.absoluteWin).toBeTrue();
            });

            it("should treat a windows UNC path as absolute", async function () {
                const res = await nodeConnector.execPeer("classifyPath",
                    {candidate: "\\\\server\\share\\clip.mp4"});
                expect(res.absoluteWin).toBeTrue();
            });

            it("should treat a relative path as relative on both", async function () {
                const res = await nodeConnector.execPeer("classifyPath",
                    {candidate: "clips/holiday.mp4"});
                expect(res.absolutePosix).toBeFalse();
                expect(res.absoluteWin).toBeFalse();
            });
        });
    });
});
