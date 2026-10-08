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

/*
 * Which thinking effort, if any, a query from the AI panel sends. The panel offers only the levels the
 * SDK reports for the selected model; this checks the request again against the model list this
 * process has, so a level the model does not support is never sent. No effort at all is the default:
 * the SDK then applies the user's saved setting or the model's own default.
 */

const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"];

/**
 * The effort to set on a query's options, or undefined to send none.
 *
 * Before the first query of this process the model list is not known yet; the panel has checked the
 * level against the list it kept from an earlier run, so it is sent rather than silently dropped. A
 * custom endpoint's models are not Anthropic's, so their capabilities are unknown and nothing is sent.
 *
 * @param {Object} request
 * @param {string} [request.effort] - The level the panel asked for.
 * @param {string} [request.model] - The model the query names; none for the default model.
 * @param {Array<Object>} [request.models] - The SDK's supportedModels() list, when this process has it.
 * @param {string} [request.resolvedDefaultModel] - The model the default resolved to last, when known.
 * @param {boolean} [request.customEndpoint] - Whether the query goes to a custom endpoint.
 * @return {string|undefined} A level the model supports, or undefined.
 */
function effortForQuery(request) {
    const { effort, model, models, resolvedDefaultModel, customEndpoint } = request || {};
    if (!EFFORT_LEVELS.includes(effort) || customEndpoint) {
        return undefined;
    }
    const target = model || resolvedDefaultModel;
    if (!Array.isArray(models) || !models.length || !target) {
        return effort;
    }
    const entry = models.find(function (m) {
        return m && (m.value === target || m.resolvedModel === target);
    });
    if (!entry || !entry.supportsEffort || !Array.isArray(entry.supportedEffortLevels)) {
        return undefined;
    }
    return entry.supportedEffortLevels.includes(effort) ? effort : undefined;
}

exports.EFFORT_LEVELS = EFFORT_LEVELS;
exports.effortForQuery = effortForQuery;
