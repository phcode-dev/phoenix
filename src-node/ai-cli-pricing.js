/* Copyright (c) 2026 core.ai; SPDX-License-Identifier: AGPL-3.0-or-later */

// Standard API USD per million tokens, checked 2026-10-05. These are API-equivalent
// estimates, not subscription charges, and exclude service-tier and regional premiums.
// https://developers.openai.com/api/docs/pricing
// https://developers.openai.com/api/docs/models/gpt-6-sol
// https://developers.openai.com/api/docs/models/gpt-5.6-sol (also the gpt-5.6 alias)
// https://developers.openai.com/api/docs/models/gpt-5.6-terra
// https://developers.openai.com/api/docs/models/gpt-5.6-luna
// https://developers.openai.com/api/docs/models/gpt-5.3-codex
// Fields: uncached input, cached input, cache write, output. null means unpublished.
const RATES = new Map([
    ["gpt-6-astra", [10, 1, 12.5, 50]],
    ["gpt-6.1-sol", [2, 0.10, 2.5, 10]],
    ["gpt-6-sol", [2, 0.20, 2.5, 10]],
    ["gpt-6-luna", [0.10, 0.01, 0.125, 0.50]],
    ["gpt-5.6-sol", [4, 0.40, 5, 20]],
    ["gpt-5.6", [4, 0.40, 5, 20]],
    ["gpt-5.6-terra", [2, 0.20, 2.5, 12]],
    ["gpt-5.6-luna", [0.20, 0.02, 0.25, 1.20]],
    ["gpt-5.3-codex", [1.75, 0.175, null, 14]]
]);

/**
 * Estimate one Codex response using its exact reported model and disjoint token counts.
 * Output already includes reasoning. Unknown models/rates stay unpriced, never guessed.
 * @param {?string} model Exported model ID.
 * @param {{input: number, output: number, cacheRead: number, cacheWrite: number}} usage
 * @return {?number} Standard API-equivalent USD, or null if a rate is unavailable.
 */
function estimateCodexCost(model, usage) {
    const rates = RATES.get(model);
    if (!rates || (usage.cacheWrite > 0 && rates[2] === null)) { return null; }
    // These models charge long-context rates for the entire request beyond 272k input.
    const longContext = model !== "gpt-5.3-codex" &&
        usage.input + usage.cacheRead + usage.cacheWrite > 272000;
    const inputCost = usage.input * rates[0] + usage.cacheRead * rates[1] + usage.cacheWrite * (rates[2] || 0);
    return (inputCost * (longContext ? 2 : 1) + usage.output * rates[3] * (longContext ? 1.5 : 1)) / 1000000;
}

exports.estimateCodexCost = estimateCodexCost;
