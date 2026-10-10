/*
 * Copyright (c) 2021 - present core.ai
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/*global describe, it, expect, beforeAll, awaitsFor */

define(function (require, exports, module) {
    const NodeConnector = require("NodeConnector");

    // Native unit jobs run the isolated Node fixture; browsers have no SDK host.
    if (!Phoenix.isNativeApp) { return; }

    describe("unit:AI File Permissions", function () {
        let connector;
        beforeAll(async function () {
            await awaitsFor(NodeConnector.isNodeReady, "Node runtime to be ready");
            connector = NodeConnector.createNodeConnector("ph_test_ai_file_permissions", exports);
        });

        /**
         * Run one isolated real-agent permission scenario.
         * @param {Object} params Mode, tool and optional user response.
         * @return {Promise<Object>} Observed decisions and browser operations.
         */
        function exercise(params) {
            return connector.execPeer("exercise", params);
        }

        ["Edit", "Write"].forEach(function (tool) {
            it("Auto leaves outside-project " + tool + " to the SDK without a manual prompt", async function () {
                const result = await exercise({tool, mode: "auto"});
                expect(result.decision).toEqual({});
                expect(result.events).toEqual([]);
                expect(result.allowedTools).not.toContain(tool);
                expect(result.operations.map(op => op.name)).toEqual(["saveBufferToDisk", "captureFileContent"]);
            });

            it("AI Edit Mode denies outside-project " + tool + " before preparation", async function () {
                const result = await exercise({tool, mode: "acceptEdits"});
                expect(result.decision.hookSpecificOutput.permissionDecision).toBe("deny");
                expect(result.events.length).toBe(1);
                expect(result.events[0].name).toBe("aiBashConfirm");
                expect(result.operations).toEqual([]);
            });

            it("AI Edit Mode permits an explicitly approved outside-project " + tool, async function () {
                const result = await exercise({tool, mode: "acceptEdits", allow: true});
                expect(result.decision.hookSpecificOutput.permissionDecision).toBe("allow");
                expect(result.events.length).toBe(1);
            });

            it("switching AI Edit Mode to Auto sends " + tool + " through the SDK", async function () {
                const result = await exercise({tool, mode: "acceptEdits", switchTo: "auto"});
                expect(result.modeChanges).toEqual(["auto"]);
                expect(result.decision).toEqual({});
                expect(result.events).toEqual([]);
            });

            it("switching Auto to AI Edit Mode restores the outside-project " + tool + " prompt", async function () {
                const result = await exercise({tool, mode: "auto", switchTo: "acceptEdits"});
                expect(result.modeChanges).toEqual(["acceptEdits"]);
                expect(result.decision.hookSpecificOutput.permissionDecision).toBe("deny");
                expect(result.events.length).toBe(1);
                expect(result.operations).toEqual([]);
            });

            it("does not pre-approve " + tool + " when mode changes during preparation", async function () {
                const result = await exercise({tool, mode: "auto", switchDuringPrep: "acceptEdits"});
                expect(result.modeChanges).toEqual(["acceptEdits"]);
                expect(result.decision).toEqual({});
            });

            it("denies " + tool + " if switching out of Plan Mode fails", async function () {
                const result = await exercise({tool, mode: "plan", allow: true, modeFailure: true});
                expect(result.decision.hookSpecificOutput.permissionDecision).toBe("deny");
                expect(result.aborted).toBe(true);
                expect(result.operations).toEqual([]);
            });

            it("reports a saved plan " + tool + " as handled despite the SDK denial wrapper", async function () {
                const result = await exercise({tool, mode: "plan", location: "plan", emitResult: true});
                expect(result.toolResults.length).toBe(1);
                expect(result.toolResults[0].planFileSaved).toBe(true);
                expect(result.toolResults[0].isError).toBe(false);
                expect(result.operations.map(op => op.name)).toEqual(["writeFileSync"]);
            });

            it("keeps a failed plan " + tool + " visible as an error", async function () {
                const result = await exercise({tool, mode: "plan", location: "plan",
                    emitResult: true, planWriteFailure: true});
                expect(result.decision.hookSpecificOutput.permissionDecisionReason).toContain("fixture write failed");
                expect(result.toolResults.length).toBe(1);
                expect(result.toolResults[0].planFileSaved).toBe(false);
                expect(result.toolResults[0].isError).toBe(true);
            });

            it("Plan Mode rejects unapproved " + tool + " without an outside-root prompt", async function () {
                const result = await exercise({tool, mode: "plan"});
                expect(result.decision.hookSpecificOutput.permissionDecision).toBe("deny");
                expect(result.events.map(event => event.name)).toEqual(["aiPlanModeWriteConfirm"]);
                expect(result.operations).toEqual([]);
            });

            it("approving a plan-mode " + tool + " allows only that call before switching to Auto", async function () {
                const result = await exercise({tool, mode: "plan", allow: true, followup: true});
                expect(result.modeChanges).toEqual(["auto"]);
                expect(result.decision.hookSpecificOutput.permissionDecision).toBe("allow");
                expect(result.nextDecision).toEqual({});
                expect(result.events.map(event => event.name)).toEqual(["aiPlanModeWriteConfirm"]);
            });
        });

        ["project", "attached", "temp", "scratch"].forEach(function (location) {
            it("AI Edit Mode writes in " + location + " without a manual prompt", async function () {
                const result = await exercise({mode: "acceptEdits", location});
                expect(result.events).toEqual([]);
                expect(result.decision.hookSpecificOutput.permissionDecision).toBe("allow");
            });
        });

        it("Auto lets an SDK permission request reach the user and returns their denial", async function () {
            const result = await exercise({mode: "auto", sdkAsk: true});
            expect(result.decision).toEqual({});
            expect(result.events.map(event => event.name)).toEqual(["aiBashConfirm"]);
            expect(result.sdkAsk.behavior).toBe("deny");
        });

        it("approved ExitPlanMode leaves subsequent writes under Auto's SDK decision", async function () {
            const result = await exercise({mode: "plan", approvePlan: true, allow: true});
            expect(result.planDecision.behavior).toBe("allow");
            expect(result.modeChanges).toEqual(["auto", "auto"]);
            expect(result.decision).toEqual({});
            expect(result.events.map(event => event.name)).toEqual(["aiPlanProposed"]);
        });

        it("Allow Everything keeps its existing unrestricted behavior", async function () {
            const result = await exercise({mode: "bypassPermissions"});
            expect(result.permissionMode).toBe("bypassPermissions");
            expect(result.events).toEqual([]);
            expect(result.decision).toEqual({});
        });

        it("failed SDK mode changes abort rather than continuing under a stale mode", async function () {
            const result = await exercise({mode: "acceptEdits", switchTo: "auto", modeFailure: true});
            expect(result.aborted).toBe(true);
            expect(result.modeError).toContain("fixture mode update failed");
            expect(result.decision.hookSpecificOutput.permissionDecision).toBe("deny");
            expect(result.operations).toEqual([]);
        });

        it("aborts and denies when the SDK never acknowledges a mode change", async function () {
            const result = await exercise({mode: "acceptEdits", switchTo: "auto", modeTimeout: true});
            expect(result.aborted).toBe(true);
            expect(result.modeError).toContain("timed out");
            expect(result.decision.hookSpecificOutput.permissionDecision).toBe("deny");
            expect(result.operations).toEqual([]);
        });

        it("denies ExitPlanMode if the SDK mode update fails", async function () {
            const result = await exercise({mode: "plan", approvePlan: true, allow: true, modeFailure: true});
            expect(result.planDecision.behavior).toBe("deny");
            expect(result.aborted).toBe(true);
            expect(result.operations).toEqual([]);
        });

        it("text-only prompts use streaming input so SDK mode changes are available", async function () {
            const result = await exercise({mode: "auto"});
            expect(result.streamingInput).toBe(true);
            expect(result.promptMessages[0].message.content).toEqual([{type: "text", text: "fixture"}]);
        });

        it("image prompts preserve both text and image content", async function () {
            const result = await exercise({mode: "auto", image: true});
            expect(result.streamingInput).toBe(true);
            expect(result.promptMessages[0].message.content.map(item => item.type)).toEqual(["text", "image"]);
        });

        ["\n", "\r\n"].forEach(function (lineEnding) {
            it("accepts a multiline edit read from a " + (lineEnding === "\n" ? "LF" : "CRLF") +
                " file", async function () {
                const result = await exercise({mode: "auto", tool: "Edit",
                    fileContent: ["body {", "    background: #000a2e;", "    overflow: hidden;", "}"].join(lineEnding),
                    oldString: "body {\n    background: #000a2e;\n    overflow: hidden;"});
                expect(result.decision).toEqual({});
                expect(result.events).toEqual([]);
            });
        });

        it("accepts CRLF edit text when the file uses LF", async function () {
            const result = await exercise({mode: "auto", tool: "Edit",
                fileContent: "body {\n    color: red;\n}\n", oldString: "body {\r\n    color: red;\r\n}"});
            expect(result.decision).toEqual({});
        });

        it("still rejects changed text in a CRLF file instead of overlooking whitespace changes", async function () {
            const result = await exercise({mode: "auto", tool: "Edit",
                fileContent: "body {\r\n  color: red;\r\n}\r\n", oldString: "body {\n    color: red;\n}"});
            expect(result.decision.hookSpecificOutput.permissionDecision).toBe("deny");
            expect(result.decision.hookSpecificOutput.permissionDecisionReason).toContain("modified by the user");
        });

        it("Auto still rejects an edit that no longer matches the current buffer", async function () {
            const result = await exercise({mode: "auto", tool: "Edit", stale: true});
            expect(result.decision.hookSpecificOutput.permissionDecision).toBe("deny");
            expect(result.decision.hookSpecificOutput.permissionDecisionReason).toContain("modified by the user");
            expect(result.events).toEqual([]);
        });
    });
});
