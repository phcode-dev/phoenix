/* Copyright (c) 2026 core.ai; SPDX-License-Identifier: AGPL-3.0-or-later */

const {z} = require("zod");
const bundledPricing = require("./external-model-pricing.json");

// API-equivalent USD per million tokens, not subscription charges or regional premiums.
// Bundled prices checked 2026-10-09:
// https://developers.openai.com/api/docs/pricing
// https://developers.openai.com/api/docs/models/gpt-6-sol
// https://developers.openai.com/api/docs/guides/fast-mode
// Unknown model/tier combinations stay unpriced; no universal premium is assumed.
const MAX_CATALOG_BYTES = 256 * 1024;
const price = z.number().finite().min(0).max(1000000).nullable();
const ratesSchema = z.object({input: price, cacheRead: price, cacheWrite: price, output: price}).strict();
const tiers = {standard: ratesSchema, fast: ratesSchema.optional(), ultrafast: ratesSchema.optional()};
const modelSchema = z.object(Object.assign({}, tiers, {
    longContext: z.object(Object.assign({aboveInputTokens: z.number().int().positive().max(100000000)}, tiers))
        .strict().optional()
})).strict();
const catalogSchema = z.object({
    version: z.literal(1),
    updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    currency: z.literal("USD"),
    unit: z.literal("million_tokens"),
    models: z.record(z.string().min(1).max(200).regex(/^[a-zA-Z0-9][a-zA-Z0-9._:/@\[\]-]*$/), modelSchema)
        .refine(models => Object.keys(models).length > 0 && Object.keys(models).length <= 500)
}).strict();
const TOKEN_KINDS = ["input", "cacheRead", "cacheWrite", "output"];

/**
 * Validate and copy a downloaded or cached price catalog before making any of it active.
 * @param {*} catalog Candidate version-1 USD catalog.
 * @return {?Object} Validated catalog, or null without modifying the active prices.
 */
function validateCatalog(catalog) {
    try {
        if (JSON.stringify(catalog).length > MAX_CATALOG_BYTES) { return null; }
        const result = catalogSchema.safeParse(catalog);
        return result.success ? result.data : null;
    } catch (error) {
        return null;
    }
}

/**
 * Create an isolated estimator with bundled prices and atomic, validated catalog updates.
 * @return {{update: function(Object): boolean, estimate: function(?string, Object, string=): ?number}}
 */
function createPricing() {
    let catalog = catalogSchema.parse(bundledPricing);
    return {
        update(candidate) {
            const next = validateCatalog(candidate);
            if (!next || next.updatedAt < catalog.updatedAt) { return false; }
            catalog = next;
            return true;
        },
        estimate(model, usage, serviceTier = "default") {
            if (!Object.hasOwn(catalog.models, model)) { return null; }
            const entry = catalog.models[model];
            const tier = serviceTier === "default" ? "standard" : serviceTier;
            if (!["standard", "fast", "ultrafast"].includes(tier)) { return null; }
            const inclusiveInput = usage.input + usage.cacheRead + usage.cacheWrite;
            const table = entry.longContext && inclusiveInput > entry.longContext.aboveInputTokens ?
                entry.longContext : entry;
            const rates = table[tier];
            if (!rates) { return null; }
            let total = 0;
            for (const kind of TOKEN_KINDS) {
                if (usage[kind] > 0 && rates[kind] === null) { return null; }
                total += usage[kind] * (rates[kind] || 0);
            }
            return total / 1000000;
        }
    };
}

const pricing = createPricing();

/**
 * Estimate one Codex response using its exact model, normalized tier and disjoint token counts.
 * Output already includes reasoning. Missing tier metadata retains the standard estimate.
 * @param {?string} model Exported model ID.
 * @param {{input: number, output: number, cacheRead: number, cacheWrite: number}} usage
 * @param {string} [serviceTier="default"] Normalized per-response tier.
 * @return {?number} API-equivalent USD, or null if a model/tier rate is unavailable.
 */
function estimateCodexCost(model, usage, serviceTier = "default") {
    return pricing.estimate(model, usage, serviceTier);
}

exports.estimateCodexCost = estimateCodexCost;
exports.updatePricing = pricing.update;
exports.validateCatalog = validateCatalog;
exports.createPricing = createPricing;
