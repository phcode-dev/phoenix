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

// Test-runner-specific MCP WebSocket handlers.
// Loaded as a plain script (non-AMD) in SpecRunner.html after phoenix-builder-boot.js.
// Registers handlers for run_tests_request and get_test_results_request.

(function () {

    var builder = window._phoenixBuilder;
    if (!builder) {
        // MCP not enabled — nothing to do
        return;
    }

    // --- screenshot_request ---
    // Handles screenshot capture in the test runner window.
    // Reuses Phoenix.app.screenShotBinary which works on Tauri, Electron, and browser (with extension).
    builder.registerHandler("screenshot_request", function (msg) {
        if (!Phoenix || !Phoenix.app || !Phoenix.app.screenShotBinary) {
            builder.sendMessage({
                type: "error",
                id: msg.id,
                message: "Screenshot API not available"
            });
            return;
        }

        Phoenix.app.screenShotBinary(msg.selector || undefined)
            .then(function (bytes) {
                var binary = "";
                var chunkSize = 8192;
                for (var i = 0; i < bytes.length; i += chunkSize) {
                    var chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
                    binary += String.fromCharCode.apply(null, chunk);
                }
                var base64 = btoa(binary);
                builder.sendMessage({
                    type: "screenshot_response",
                    id: msg.id,
                    data: base64
                });
            })
            .catch(function (err) {
                builder.sendMessage({
                    type: "error",
                    id: msg.id,
                    message: err.message || "Screenshot failed"
                });
            });
    });

    // --- run_tests_request ---
    // Reloads SpecRunner with the requested category and/or spec URL params.
    builder.registerHandler("run_tests_request", function (msg) {
        var category = msg.category || "unit";
        var spec = msg.spec || null;

        // Respond before reloading so the MCP server gets the ack
        builder.sendMessage({
            type: "run_tests_response",
            id: msg.id,
            success: true,
            message: "Reloading test runner with category=" + category + (spec ? ", spec=" + spec : "")
        });

        // Build the new URL and reload.
        // Construct the query string manually with encodeURIComponent so spaces
        // become %20 (not +). The SpecRunner UrlParams parser uses decodeURIComponent
        // which only decodes %20, not +.
        var base = window.location.href.split("?")[0];
        var qs = "category=" + encodeURIComponent(category) +
            "&spec=" + encodeURIComponent(spec || "all");

        setTimeout(function () {
            window.location.href = base + "?" + qs;
        }, 100);
    });

    // --- get_test_results_request ---
    // Returns structured test results from the live reporter and window.testResults.
    builder.registerHandler("get_test_results_request", function (msg) {
        var results = _gatherTestResults();
        results.type = "get_test_results_response";
        results.id = msg.id;
        builder.sendMessage(results);
    });

    function _gatherTestResults() {
        var testResults = window.testResults || {};
        var completed = !!window.playWrightRunComplete;

        // Try to access the reporter via the global that SpecRunner sets up.
        // The reporter is attached to the BootstrapReporterView which reads from UnitTestReporter.
        // We get what we can from the DOM and globals.
        var reporter = window._unitTestReporter || null;

        var totalSpecCount = 0;
        var totalPassedCount = 0;
        var totalFailedCount = 0;
        var activeSpecCompleteCount = 0;
        var currentSpec = "";
        var activeSuite = null;
        var categories = [];
        var running = false;
        var passed = !!testResults.passed;
        var failures = [];

        if (reporter) {
            totalSpecCount = reporter.totalSpecCount || 0;
            totalPassedCount = reporter.totalPassedCount || 0;
            totalFailedCount = reporter.totalFailedCount || 0;
            activeSpecCompleteCount = reporter.activeSpecCompleteCount || 0;
            activeSuite = reporter.activeSuite || null;
            categories = reporter.selectedCategories || [];
            passed = !!reporter.passed;

            // If tests started but haven't completed, they're running
            running = !!activeSuite && !completed;

            // Current spec from the info element
            var infoEl = document.querySelector(".alert-info");
            if (infoEl && infoEl.textContent && infoEl.textContent.indexOf("Running ") === 0) {
                currentSpec = infoEl.textContent.substring("Running ".length);
            }

            // Gather failures from reporter suites
            var suiteNames = Object.keys(reporter.suites || {});
            for (var i = 0; i < suiteNames.length; i++) {
                var suite = reporter.suites[suiteNames[i]];
                if (suite && suite.specs) {
                    for (var j = 0; j < suite.specs.length; j++) {
                        var spec = suite.specs[j];
                        if (spec && !spec.passed) {
                            var msgs = [];
                            if (spec.messages && spec.messages.length) {
                                for (var k = 0; k < spec.messages.length; k++) {
                                    var m = spec.messages[k];
                                    msgs.push(m.message || String(m));
                                }
                            }
                            failures.push({
                                suite: suite.name,
                                spec: spec.name,
                                messages: msgs
                            });
                        }
                    }
                }
            }
        } else {
            // No reporter yet — tests haven't loaded
            running = false;
        }

        return {
            running: running,
            completed: completed,
            passed: passed,
            totalSpecCount: totalSpecCount,
            totalPassedCount: totalPassedCount,
            totalFailedCount: totalFailedCount,
            activeSpecCompleteCount: activeSpecCompleteCount,
            failures: failures,
            currentSpec: currentSpec,
            categories: categories,
            activeSuite: activeSuite
        };
    }

}());
