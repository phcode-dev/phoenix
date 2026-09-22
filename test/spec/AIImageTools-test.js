/*
 * Copyright (c) 2021 - present core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/*global describe, it, expect, beforeAll, awaitsFor */
define(function (require, exports, module) {
    const NodeConnector = require("NodeConnector");

    if (!Phoenix.isNativeApp) { return; }

    describe("unit:AI Image Tools", function () {
        let connector;
        beforeAll(async function () {
            await awaitsFor(NodeConnector.isNodeReady, "Node runtime to be ready");
            connector = NodeConnector.createNodeConnector("ph_test_ai_image_tools", exports);
        });

        it("registers image search, preview and selection tools with the editor MCP server", async function () {
            const value = await connector.execPeer("exercise", {scenario: "plain"});
            expect(value.tools).toContain("searchImages");
            expect(value.tools).toContain("useImage");
            expect(value.tools).toContain("previewImages");
            expect(value.calls[0].name).toBe("searchImages");
        });

        it("returns a real MCP image block for a requested collage", async function () {
            const value = await connector.execPeer("exercise", {scenario: "visual"});
            expect(value.result.content[1]).toEqual({type: "image", mimeType: "image/jpeg", data: "cHJldmlldw=="});
            expect(value.result.content[0].text).not.toContain("base64");
        });

        it("keeps URL metadata for the correct result card and replay", async function () {
            const value = await connector.execPeer("exercise", {scenario: "plain"});
            expect(value.result.content.length).toBe(1);
            expect(value.restored.photos[0].url).toBe("https://images.unsplash.com/a");
            expect(value.restored.query).toBe("interior");
        });

        it("propagates backend failure and retry details as a tool error", async function () {
            const value = await connector.execPeer("exercise", {scenario: "error"});
            expect(value.result.isError).toBe(true);
            expect(JSON.parse(value.result.content[0].text).retryAfterSeconds).toBe(75);
            expect(value.restored.error).toBe("Rate limited");
        });

        it("tracks a selected image without running another search", async function () {
            const value = await connector.execPeer("exercise", {scenario: "use"});
            expect(value.calls.length).toBe(1);
            expect(value.calls[0].name).toBe("useImage");
            expect(JSON.parse(value.result.content[0].text).success).toBe(true);
            expect(value.restored.kind).toBe("imageSelection");
            expect(value.restored.photos[0].url).toBe("https://images.unsplash.com/a");
        });

        it("previews mixed local and remote URLs as a visual collage", async function () {
            const value = await connector.execPeer("exercise", {scenario: "preview"});
            expect(value.calls[0].name).toBe("previewImages");
            expect(value.restored.kind).toBe("imagePreview");
            expect(value.restored.photos.length).toBe(3);
            expect(value.result.content[1].type).toBe("image");
        });

        it("accepts a batch selection in one bridge call and retains every photo for the UI", async function () {
            const value = await connector.execPeer("exercise", {scenario: "useBatch"});
            expect(value.calls.length).toBe(1);
            expect(value.calls[0].name).toBe("useImage");
            expect(value.calls[0].args.downloadTracker.length).toBe(2);
            expect(value.restored.photos.map(p => p.id)).toEqual(["a", "b"]);
            expect(value.result.isError).toBe(false);
        });

        it("reads a local file URL containing spaces and a hash character", async function () {
            const value = await connector.execPeer("readFixture", {kind: "file"});
            expect(value.dataUrl).toContain("data:image/gif;base64,");
        });

        it("reads a remote image without relying on browser CORS", async function () {
            const value = await connector.execPeer("readFixture", {kind: "remote"});
            expect(value.dataUrl).toContain("data:image/gif;base64,");
        });

        it("recognises an SVG behind an XML prolog and comments", async function () {
            const value = await connector.execPeer("readFixture", {kind: "svg"});
            expect(value.dataUrl).toContain("data:image/svg+xml;base64,");
        });

        ["text", "commentFlood", "large", "directory"].forEach(function (kind) {
            it("rejects an invalid image input: " + kind, async function () {
                const value = await connector.execPeer("readFixture", {kind: kind});
                expect(value.error).toBeDefined();
                expect(value.dataUrl).toBeUndefined();
            });
        });
    });
});
