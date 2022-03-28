/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2012 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global describe, beforeEach, afterEach, it, runs, waitsForDone */

// TODO: Eventually we should have a brackets performance test suite that is separate from the unit tests

define(function (require, exports, module) {


    // Load dependent modules
    var CommandManager,             // loaded from brackets.test
        Commands,                   // loaded from brackets.test
        DocumentCommandHandlers,    // loaded from brackets.test
        PerfUtils,                  // loaded from brackets.test
        DocumentManager,            // loaded from brackets.test
        SpecRunnerUtils             = require("spec/SpecRunnerUtils"),
        UnitTestReporter            = require("test/UnitTestReporter");

    var jsLintCommand, jsLintPrevSetting;

    describe("Performance Tests", function () {

        this.category = "performance";

        // Note: this tests assumes that the "brackets-scenario" repo is in the same folder
        //       as the "brackets-app"
        //
        // TODO: these tests rely on real world example files that cannot be on open source.
        // We should replace these with test files that can be in the public repro.
        var testPath = SpecRunnerUtils.getTestPath("/perf/OpenFile-perf-files/"),
            testWindow;

        function openFile(path) {
            var fullPath = testPath + path;
            runs(function () {
                var promise = CommandManager.execute(Commands.FILE_OPEN, {fullPath: fullPath});
                waitsForDone(promise);
            });

            runs(function () {
                var reporter = UnitTestReporter.getActiveReporter();
                reporter.logTestWindow(/Open File:\t,*/, path);
                reporter.clearTestWindow();
            });
        }

        beforeEach(function () {
            SpecRunnerUtils.createTestWindowAndRun(this, function (w) {
                testWindow = w;

                // Load module instances from brackets.test
                CommandManager      = testWindow.brackets.test.CommandManager;
                Commands            = testWindow.brackets.test.Commands;
                DocumentCommandHandlers = testWindow.brackets.test.DocumentCommandHandlers;
                DocumentManager     = testWindow.brackets.test.DocumentManager;
                PerfUtils           = testWindow.brackets.test.PerfUtils;

                jsLintCommand = CommandManager.get("jslint.toggleEnabled");
                if (jsLintCommand) {
                    jsLintPrevSetting = jsLintCommand.getChecked();
                    if (jsLintPrevSetting) {
                        jsLintCommand.execute();
                    }
                }
            });
        });

        afterEach(function () {
            testWindow              = null;
            CommandManager          = null;
            Commands                = null;
            DocumentCommandHandlers = null;
            DocumentManager         = null;
            PerfUtils               = null;
            SpecRunnerUtils.closeTestWindow();
        });


        // TODO: right now these are in a single test because performance results are
        // tied to a window, so we need one window for all the tests. Need to think
        // more about how performance tests should ultimately work.
        it("File open performance", function () {
            openFile("brackets-concat.js"); // 3.4MB
            openFile("jquery_ui_index.html");
            openFile("blank.js");
            openFile("InlineWidget.js");
            openFile("quiet-scrollbars.css");
            openFile("England(Chinese).htm");
            openFile("jquery.mobile-1.1.0.css");
            openFile("jquery.mobile-1.1.0.min.css");
            openFile("jquery.mobile-1.1.0.js");
            openFile("jquery.mobile-1.1.0.min.js");
        });
    });
});
