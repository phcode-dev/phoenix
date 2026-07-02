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
 * npm-intel - node-side helper for npm security-advisory lookups. The registry's bulk advisory
 * endpoint is POST-only without CORS headers, so the browser context cannot call it directly;
 * the JSONSupport extension routes the request here on desktop builds.
 *
 * Lazy-loaded via NodeUtils._loadNodeExtensionModule("./npm-intel") on first use - keep this
 * module free of heavyweight requires so it adds nothing to node boot.
 */

const ADVISORY_BULK_URL = "https://registry.npmjs.org/-/npm/v1/security/advisories/bulk";

/**
 * POST the bulk advisory query to the npm registry.
 * @param {Object} params
 * @param {Object<string, string[]>} params.body - map of package name -> array of exact versions
 * @returns {Promise<Object>} the registry's response: package name -> advisory array
 */
async function fetchAdvisoriesBulk({ body }) {
    const response = await fetch(ADVISORY_BULK_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        throw new Error(`advisory fetch failed: ${response.status}`);
    }
    return response.json();
}

exports.fetchAdvisoriesBulk = fetchAdvisoriesBulk;

global.createNodeConnector("ph-npm-intel", exports);
