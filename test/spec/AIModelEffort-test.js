/*
 * Copyright (c) 2021 - present core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/*global describe, it, expect, beforeAll, awaitsFor */

define(function (require, exports, module) {
    const NodeConnector = require("NodeConnector");

    // The check runs in PhNode; browser jobs have no Node runtime.
    if (!Phoenix.isNativeApp) {
        return;
    }

    // SDK supportedModels() rows, as the AI panel's queries see them.
    const MODELS = [
        { value: "default", resolvedModel: "claude-fable-5-1", supportsEffort: true,
            supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"] },
        { value: "opus", resolvedModel: "claude-opus-5-5", supportsEffort: true,
            supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"] },
        { value: "sonnet", resolvedModel: "claude-sonnet-5", supportsEffort: true,
            supportedEffortLevels: ["low", "medium", "high"] },
        { value: "haiku", resolvedModel: "claude-haiku-4-5", supportsEffort: false }
    ];

    describe("unit:AI Model Effort", function () {
        let nodeConnector;

        beforeAll(async function () {
            await awaitsFor(NodeConnector.isNodeReady, "Node runtime to be ready");
            nodeConnector = NodeConnector.createNodeConnector("ph_test_ai_model_effort", exports);
        });

        async function effortFor(request) {
            return (await nodeConnector.execPeer("effortForQuery", request)).effort;
        }

        it("sends no effort when none is asked for, so the system default applies", async function () {
            expect(await effortFor({ model: "opus", models: MODELS })).toBe(null);
            expect(await effortFor({ models: MODELS, resolvedDefaultModel: "claude-opus-5-5" })).toBe(null);
        });

        it("sends a level the model reports, matched by alias or resolved id", async function () {
            expect(await effortFor({ effort: "max", model: "opus", models: MODELS })).toBe("max");
            expect(await effortFor({ effort: "low", model: "claude-sonnet-5", models: MODELS })).toBe("low");
        });

        it("drops a level the model does not report, or any level for a model without effort", async function () {
            expect(await effortFor({ effort: "xhigh", model: "sonnet", models: MODELS })).toBe(null);
            expect(await effortFor({ effort: "low", model: "haiku", models: MODELS })).toBe(null);
            expect(await effortFor({ effort: "ultra", model: "opus", models: MODELS })).toBe(null);
        });

        it("drops any level for a model the list does not describe", async function () {
            expect(await effortFor({ effort: "high", model: "custom-model-7", models: MODELS })).toBe(null);
        });

        it("checks the default model against the model it resolved to, not the list's default row", async function () {
            expect(await effortFor({ effort: "max", models: MODELS,
                resolvedDefaultModel: "claude-sonnet-5" })).toBe(null);
            expect(await effortFor({ effort: "high", models: MODELS,
                resolvedDefaultModel: "claude-sonnet-5" })).toBe("high");
            expect(await effortFor({ effort: "high", models: MODELS,
                resolvedDefaultModel: "claude-unlisted-9" })).toBe(null);
        });

        it("keeps a level the panel checked when this process has no model list yet", async function () {
            expect(await effortFor({ effort: "high", model: "opus" })).toBe("high");
            expect(await effortFor({ effort: "high", models: MODELS })).toBe("high");
        });

        it("never sends Anthropic effort levels to a custom endpoint", async function () {
            expect(await effortFor({ effort: "high", model: "opus", models: MODELS,
                customEndpoint: true })).toBe(null);
            expect(await effortFor({ effort: "high", model: "opus", customEndpoint: true })).toBe(null);
        });
    });
});
