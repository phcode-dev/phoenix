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

/**
 * NpmRegistry - the npm registry / security-advisory client behind package.json intelligence.
 *
 * - searchPackages(query): package NAME suggestions (registry search API, CORS-open GET).
 * - getVersions(name): version list + dist-tags (abbreviated registry doc, CORS-open GET).
 * - getAdvisoriesBulk(pairs): security advisories for exact name@version pairs. The bulk endpoint
 *   is POST-only WITHOUT CORS headers (verified), so the browser build cannot reach it directly:
 *   transport is tiered - browser fetch first (in case CORS opens up), then the ph-npm-intel node
 *   connector on desktop, else advisories are unavailable (empty results).
 *
 * All results are TTL-cached (session-scoped). Network and clock are injectable for tests.
 *
 * @module extensionsIntegrated/JSONSupport/NpmRegistry
 */
define(function (require, exports, module) {


    const NodeUtils = require("utils/NodeUtils"),
        NodeConnector = require("NodeConnector");

    const SEARCH_URL = "https://registry.npmjs.org/-/v1/search";
    const PACKAGE_URL = "https://registry.npmjs.org/";
    const ADVISORY_BULK_URL = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk";

    const NODE_NPM_INTEL_MODULE = "./npm-intel";
    const NPM_INTEL_CONNECTOR_ID = "ph-npm-intel";

    const SEARCH_TTL_MS = 5 * 60 * 1000;
    const VERSIONS_TTL_MS = 10 * 60 * 1000;
    const ADVISORY_TTL_MS = 60 * 60 * 1000;
    const SEARCH_CACHE_MAX = 50;
    const SEARCH_RESULT_SIZE = 20;

    // Injectable for tests: _fetchJson(url, options) -> Promise<parsed JSON>. The default goes
    // over window.fetch (cached reference, matching the security-conscious pattern used elsewhere).
    const realFetch = window.fetch.bind(window);
    let _fetchJson = function (url, options) {
        return realFetch(url, options).then(function (response) {
            if (!response.ok) {
                throw new Error("npm registry request failed: " + response.status);
            }
            return response.json();
        });
    };
    let _now = function () {
        return Date.now();
    };
    let _fetcherInjected = false;   // tests inject a fake fetcher - it must own ALL transports

    const _searchCache = new Map();     // query -> {ts, results}
    const _versionsCache = new Map();   // name -> {ts, result}
    const _advisoryCache = new Map();   // "name@version" -> {ts, advisories[]} (empty = negative)

    function _cacheGet(cache, key, ttl) {
        const entry = cache.get(key);
        if (entry && (_now() - entry.ts) < ttl) {
            return entry.value;
        }
        cache.delete(key);
        return null;
    }

    function _cacheSet(cache, key, value, maxEntries) {
        if (maxEntries && cache.size >= maxEntries) {
            // drop the oldest entry (Map preserves insertion order)
            cache.delete(cache.keys().next().value);
        }
        cache.set(key, { ts: _now(), value: value });
    }

    /**
     * Search the npm registry for package names. Results keep the registry's relevance order.
     * @param {string} query - at least one character
     * @return {Promise<Array<{name: string, version: string, description: string}>>}
     */
    function searchPackages(query) {
        const cached = _cacheGet(_searchCache, query, SEARCH_TTL_MS);
        if (cached) {
            return Promise.resolve(cached);
        }
        const url = SEARCH_URL + "?text=" + encodeURIComponent(query) + "&size=" + SEARCH_RESULT_SIZE;
        return _fetchJson(url).then(function (json) {
            const results = ((json && json.objects) || []).map(function (entry) {
                return {
                    name: entry.package.name,
                    version: entry.package.version,
                    description: entry.package.description || ""
                };
            });
            _cacheSet(_searchCache, query, results, SEARCH_CACHE_MAX);
            return results;
        });
    }

    /**
     * Fetch the version list + dist-tags of a package (abbreviated registry document).
     * @param {string} name - the exact package name
     * @return {Promise<{versions: string[], latest: ?string}>} versions in registry order
     */
    function getVersions(name) {
        const cached = _cacheGet(_versionsCache, name, VERSIONS_TTL_MS);
        if (cached) {
            return Promise.resolve(cached);
        }
        // scoped names keep their "@" but the "/" must be encoded per registry URL rules
        const url = PACKAGE_URL + encodeURIComponent(name).replace(/^%40/, "@");
        return _fetchJson(url, {
            headers: { "Accept": "application/vnd.npm.install-v1+json" }
        }).then(function (json) {
            const result = {
                versions: Object.keys((json && json.versions) || {}),
                latest: (json && json["dist-tags"] && json["dist-tags"].latest) || null
            };
            _cacheSet(_versionsCache, name, result);
            return result;
        });
    }

    const _packageInfoCache = new Map();    // name -> {ts, info}

    /**
     * Fetch a package's latest-version summary (small document: name, version, description,
     * homepage, license) - powers the dependency hover.
     * @param {string} name - the exact package name
     * @return {Promise<{name, version, description, homepage, license}>}
     */
    function getPackageInfo(name) {
        const cached = _cacheGet(_packageInfoCache, name, VERSIONS_TTL_MS);
        if (cached) {
            return Promise.resolve(cached);
        }
        const url = PACKAGE_URL + encodeURIComponent(name).replace(/^%40/, "@") + "/latest";
        return _fetchJson(url).then(function (json) {
            const info = {
                name: (json && json.name) || name,
                version: (json && json.version) || "",
                description: (json && json.description) || "",
                homepage: (json && json.homepage) || "",
                license: (json && typeof json.license === "string" && json.license) || ""
            };
            _cacheSet(_packageInfoCache, name, info);
            return info;
        });
    }

    // ----- advisories -----------------------------------------------------------------------------

    let _nodeConnectorPromise = null;

    function _getNodeIntelConnector() {
        if (!_nodeConnectorPromise) {
            _nodeConnectorPromise = (async function () {
                await NodeUtils._loadNodeExtensionModule(NODE_NPM_INTEL_MODULE);
                return NodeConnector.createNodeConnector(NPM_INTEL_CONNECTOR_ID, {});
            }());
        }
        return _nodeConnectorPromise;
    }

    // The bulk endpoint sends no CORS headers (verified), so a browser fetch ALWAYS fails - and
    // Chromium logs the preflight failure to the console regardless of our catch, which reads as an
    // alarming error on every scan. Desktop therefore goes straight to the node helper; browser
    // builds still try fetch (their only option - degrades quietly, and starts working by itself
    // if the registry ever opens up CORS). Injected test fetchers take the fetch path everywhere.
    function _browserFetchAdvisories(body) {
        return _fetchJson(ADVISORY_BULK_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body)
        });
    }

    function _fetchAdvisoriesRaw(body) {
        if (_fetcherInjected || !Phoenix.isNativeApp) {
            return _browserFetchAdvisories(body);
        }
        return _getNodeIntelConnector().then(function (conn) {
            return conn.execPeer("fetchAdvisoriesBulk", { body: body });
        });
    }

    /**
     * Look up security advisories for exact package versions.
     * @param {Array<{name: string, version: string}>} pairs - resolved name@version pairs
     * @return {Promise<Object<string, Array>>} map of package name -> advisories affecting the
     *   given version ({id, url, title, severity, vulnerable_versions, ...}); resolves {} when the
     *   advisory data source is unreachable (browser build without CORS) - callers degrade quietly.
     */
    function getAdvisoriesBulk(pairs) {
        const result = {};
        const uncached = [];
        pairs.forEach(function (pair) {
            const key = pair.name + "@" + pair.version;
            const cached = _cacheGet(_advisoryCache, key, ADVISORY_TTL_MS);
            if (cached) {
                if (cached.length) {
                    result[pair.name] = cached;
                }
            } else {
                uncached.push(pair);
            }
        });
        if (!uncached.length) {
            return Promise.resolve(result);
        }
        const body = {};
        uncached.forEach(function (pair) {
            body[pair.name] = (body[pair.name] || []).concat(pair.version);
        });
        return _fetchAdvisoriesRaw(body).then(function (json) {
            uncached.forEach(function (pair) {
                const advisories = (json && json[pair.name]) || [];
                _cacheSet(_advisoryCache, pair.name + "@" + pair.version, advisories);
                if (advisories.length) {
                    result[pair.name] = advisories;
                }
            });
            return result;
        }).catch(function () {
            // advisory data unavailable - not an error state for the editor
            return result;
        });
    }

    // ----- test hooks -----------------------------------------------------------------------------

    function _setFetcherForTests(fetchJsonFn) {
        _fetchJson = fetchJsonFn;
        _fetcherInjected = true;
        _searchCache.clear();
        _versionsCache.clear();
        _advisoryCache.clear();
        _packageInfoCache.clear();
    }

    function _setNowForTests(nowFn) {
        _now = nowFn;
    }

    exports.searchPackages = searchPackages;
    exports.getVersions = getVersions;
    exports.getPackageInfo = getPackageInfo;
    exports.getAdvisoriesBulk = getAdvisoriesBulk;
    exports._setFetcherForTests = _setFetcherForTests;
    exports._setNowForTests = _setNowForTests;
});
