/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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
 * Generic node util APIs connector. see `src-node/utils.js` for node peer
 */

define(function (require, exports, module) {
    const Strings             = require("strings"),
        NodeConnector = require('NodeConnector');
    const UTILS_NODE_CONNECTOR = "ph_utils";

    let utilsConnector;
    if(Phoenix.browser.isTauri) {
        // node not available in browser builds!
        utilsConnector = NodeConnector.createNodeConnector(UTILS_NODE_CONNECTOR, exports);
    }

    async function fetchURLText(url, encoding) {
        if(!Phoenix.browser.isTauri) {
            throw new Error("node not available in browser");
        }
        const {buffer} = await utilsConnector.execPeer("getURLContent", {url});
        return iconv.decode(Buffer.from(buffer), encoding);
    }

    /**
     * updates the localized strings in brackets `Strings` to node.
     * @return {Promise<boolean>} Promise resolves to true if strings was updated in node, else false(in browser.)
     */
    async function updateNodeLocaleStrings() {
        if(!Phoenix.browser.isTauri) {
            // this does nothing in browser builds.
            return false;
        }
        await utilsConnector.execPeer("setLocaleStrings", Strings);
        return true;
    }

    async function getPhoenixBinaryVersion() {
        if(!Phoenix.browser.isTauri) {
            throw new Error("getPhoenixBinaryVersion not available in browser");
        }
        const cliArgs = await window.__TAURI__.invoke('_get_commandline_args');
        const phoenixBinPath = cliArgs[0];
        return utilsConnector.execPeer("getPhoenixBinaryVersion", phoenixBinPath);
    }

    if(NodeConnector.isNodeAvailable()) {
        // todo we need to update the strings if a user extension adds its translations. Since we dont support
        // node extensions for now, should consider when we support node extensions.
        updateNodeLocaleStrings();
    }

    exports.fetchURLText = fetchURLText;
    exports.updateNodeLocaleStrings = updateNodeLocaleStrings;
    exports.getPhoenixBinaryVersion = getPhoenixBinaryVersion;
    exports.isNodeReady = NodeConnector.isNodeReady;

    window.NodeUtils = exports;
});
