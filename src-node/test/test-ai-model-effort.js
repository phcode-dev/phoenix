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

// Test-only connector for the thinking effort a query sends; the check is pure, so it runs in place.
const NodeConnector = require("../node-connector");
const ModelEffort = require("../ai-model-effort");

/**
 * @param {Object} request - As ai-model-effort's effortForQuery takes.
 * @return {Promise<{effort: (string|null)}>} The level a query would send, or null for none.
 */
async function effortForQuery(request) {
    const effort = ModelEffort.effortForQuery(request);
    return { effort: effort === undefined ? null : effort };
}

exports.effortForQuery = effortForQuery;
NodeConnector.createNodeConnector("ph_test_ai_model_effort", exports);
