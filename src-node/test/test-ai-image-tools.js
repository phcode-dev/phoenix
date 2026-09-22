/*
 * Copyright (c) 2021 - present core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/** Bounded, offline MCP image tool exercises; assertions live in the Jasmine suite. */
const NodeConnector = require("../node-connector");
const ImageTools = require("../mcp-editor-tools");
const ImagePreview = require("../ai-image-preview");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const {pathToFileURL} = require("url");

NodeConnector.createNodeConnector("ph_test_ai_image_tools", exports);

/**
 * Run the actual MCP callbacks against a deterministic browser response.
 * @param {{scenario: string}} params - Named test fixture, never executable code.
 * @return {Promise<Object>} MCP response and metadata forwarded to the UI.
 */
exports.exercise = async function (params) {
    const tools = {};
    const schemas = {};
    const calls = [];
    const metadata = {kind: "imageSearch", query: "interior", photos: [{id: "a", url: "https://images.unsplash.com/a"}]};
    const server = {
        tool: function (name, _description, schema, callback) {
            tools[name] = callback;
            schemas[name] = schema;
            return {name: name};
        },
        createSdkMcpServer: function (config) { return config; }
    };
    const connector = {execPeer: async function (name, args) {
        calls.push({name: name, args: args});
        if (params.scenario === "error") { return {error: "Rate limited", retryAfterSeconds: 75}; }
        if (params.scenario === "use" || params.scenario === "useBatch") {
            return {success: true, kind: "imageSelection", photos: params.scenario === "useBatch" ?
                [metadata.photos[0], {id: "b", url: "https://images.unsplash.com/b"}] : metadata.photos};
        }
        if (name === "previewImages") {
            return {kind: "imagePreview", query: args.title,
                photos: args.urls.map(function (url, index) { return {url: url, number: index + 1}; }),
                collage: "data:image/jpeg;base64,cHJldmlldw=="};
        }
        return Object.assign({}, metadata, params.scenario === "visual" ?
            {collage: "data:image/jpeg;base64,cHJldmlldw=="} : {});
    }};
    const config = ImageTools.createEditorMcpServer(server, connector);
    const result = params.scenario === "preview" ?
        await tools.previewImages({urls: ["file:///tmp/a.png", "https://example.com/b.png", "https://example.com/c.png"],
            title: "Three options"}) : params.scenario === "use" ?
        await tools.useImage({downloadTracker: "unsplash:https://api.unsplash.com/photos/a/download"}) :
        params.scenario === "useBatch" ? await tools.useImage({downloadTracker: schemas.useImage.downloadTracker.parse([
            "unsplash:https://api.unsplash.com/photos/a/download", "unsplash:https://api.unsplash.com/photos/b/download"
        ])}) :
        await tools.searchImages({query: "interior", includePreview: params.scenario === "visual"});
    return {result: result, calls: calls, tools: config.tools.map(function (tool) { return tool.name; }),
        restored: ImageTools.getImageSearchResult(result.content)};
};

/** @return {Promise<Object>} Exercise native image reads using disposable local files and a loopback server. */
exports.readFixture = async function (params) {
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "phoenix-image-preview-"));
    const file = path.join(root, "image # one.gif");
    const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
    const contents = {
        text: "this is not an image",
        svg: "<?xml version=\"1.0\"?>\n<!-- drawn by hand -->\n<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>",
        // Many comments and no <svg>: seconds of backtracking for the old sniffing pattern.
        commentFlood: "<!---->".repeat(30) + "x"
    };
    let server;
    try {
        await fs.promises.writeFile(file, contents[params.kind] || gif);
        if (params.kind === "large") { await fs.promises.truncate(file, 8 * 1024 * 1024 + 1); }
        if (params.kind === "remote") {
            server = http.createServer(function (_request, response) {
                response.writeHead(200, {"Content-Type": "image/gif"});
                response.end(gif);
            });
            await new Promise(function (resolve) { server.listen(0, "127.0.0.1", resolve); });
            return await ImagePreview.readImage({url: "http://127.0.0.1:" + server.address().port + "/image.gif"});
        }
        const target = params.kind === "directory" ? root : file;
        return await ImagePreview.readImage({url: pathToFileURL(target).href});
    } finally {
        if (server) { await new Promise(function (resolve) { server.close(resolve); }); }
        await fs.promises.rm(root, {recursive: true, force: true});
    }
};
