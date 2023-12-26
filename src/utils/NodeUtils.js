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
    if(!Phoenix.browser.isTauri) {
        // node not available in browser builds, return
        return;
    }
    const UTILS_NODE_CONNECTOR = "ph_utils";
    const NodeConnector = require('NodeConnector');
    const utilsConnector = NodeConnector.createNodeConnector(UTILS_NODE_CONNECTOR, exports);

    async function fetchURLText(url, encoding) {
        const {buffer} = await utilsConnector.execPeer("getURLContent", {url});
        return iconv.decode(Buffer.from(buffer), encoding);
    }

    exports.fetchURLText = fetchURLText;
});
