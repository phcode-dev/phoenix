/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global Phoenix*/

/**
 * LiveDevServerManager Overview:
 *
 * The LiveDevServerManager allows extensions to register to be Live Development
 * servers. Servers are queried for their ability to serve a page in
 * order of descending priority by way their canServe methods.
 *
 * NOTE: This API is currently experimental and intented to be internal-only.
 * It is very likely that it will be changed in the near future and/or
 * removed entirely.
 *
 *   `LiveDevServerManager.getServer(localPath)`
 *
 * Returns highest priority server (BaseServer) that can serve the local file.
 *
 * A Live Development server must implement the BaseServer API. See
 * LiveDevelopment/Servers/BaseServer base class.
 */
define(function (require, exports, module) {

    const ProjectManager      = require("project/ProjectManager");


    let _serverProviders   = [];

    /**
     * @private
     * Comparator to sort providers based on their priority
     * @param {number} a
     * @param {number} b
     */
    function _providerSort(a, b) {
        return b.priority - a.priority;
    }

    /**
     * Determines which provider can serve a file with a local path. If it cant find any, will return
     * the highest priority live preview server.
     *
     * @param {string} localPath A local path to file being served.
     * @return {?BaseServer} A server no null if no servers can serve the file
     */
    function getServer(localPath) {
        let provider, server, i, highestPriorityServer;

        for (i = 0; i < _serverProviders.length; i++) {
            provider = _serverProviders[i];
            if(!provider._createdServer ||
                (provider._createdServer.getProjectRoot() !== ProjectManager.getProjectRoot().fullPath)){
                provider._createdServer = provider.create();
            }
            server = provider._createdServer;

            if(!highestPriorityServer){
                highestPriorityServer = server;
            }

            if (server.canServe(localPath)) {
                return server;
            }
        }

        return highestPriorityServer;
    }

    /**
     * The method by which a server registers itself. It returns an
     * object handler that can be used to remove that server from the list.
     *
     * @param {BaseServer|{create: function():BaseServer}} provider
     *  The provider to be registered, described below.
     * @param {number} priority
     *  A non-negative number used to break ties among providers for a
     *  particular url. Providers that register with a higher priority will
     *  have the opportunity to provide a given url before those with a
     *  lower priority. The higher the number, the higher the priority.
     * @return {{object}}
     */
    function registerServer(provider, priority) {
        if (!provider.create) {
            console.error("Incompatible live development server provider");
            return;
        }

        var providerObj = {};

        providerObj.create = provider.create;
        providerObj.priority = priority || 0;

        _serverProviders.push(providerObj);
        _serverProviders.sort(_providerSort);

        return providerObj;
    }

    /**
     * Remove a server from the list of the registered providers.
     *
     * @param {{object}} provider The provider to be removed.
     */
    function removeServer(provider) {
        var i;
        for (i = 0; i < _serverProviders.length; i++) {
            if (provider === _serverProviders[i]) {
                _serverProviders.splice(i, 1);
            }
        }
    }

    // Backwards compatibility
    exports.getProvider         = getServer;
    exports.registerProvider    = registerServer;

    // Define public API
    exports.getServer           = getServer;
    exports.registerServer      = registerServer;
    exports.removeServer        = removeServer;
});
