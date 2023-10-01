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

/*global describe, beforeEach, afterEach, it, runs, waitsForDone, jsPromise */

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

    describe("performance: Performance Tests", function () {

        // Note: this tests assumes that the "brackets-scenario" repo is in the same folder
        //       as the "brackets-app"
        //
        // TODO: these tests rely on real world example files that cannot be on open source.
        // We should replace these with test files that can be in the public repro.
        var testPath = SpecRunnerUtils.getTestPath("/perf/OpenFile-perf-files/"),
            testWindow;

        async function openFile(path) {
            let fullPath = testPath + path;
            await jsPromise(CommandManager.execute(Commands.FILE_OPEN, {fullPath: fullPath}));
            let reporter = UnitTestReporter.getActiveReporter();
            reporter.logTestWindow(/Open File:\t,*/, path);
            reporter.clearTestWindow();
        }

        beforeEach(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
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
        }, 30000);

        afterEach(async function () {
            testWindow              = null;
            CommandManager          = null;
            Commands                = null;
            DocumentCommandHandlers = null;
            DocumentManager         = null;
            PerfUtils               = null;
            await SpecRunnerUtils.closeTestWindow();
        }, 30000);


        // TODO: right now these are in a single test because performance results are
        // tied to a window, so we need one window for all the tests. Need to think
        // more about how performance tests should ultimately work.
        it("File open performance", async function () {
            await openFile("brackets-concat.js"); // 4.1MB
            await openFile("jquery_ui_index.html");
            await openFile("blank.js");
            await openFile("InlineWidget.js");
            await openFile("quiet-scrollbars.css");
            await openFile("England(Chinese).htm");
            await openFile("jquery.mobile-1.1.0.css");
            await openFile("jquery.mobile-1.1.0.min.css");
            await openFile("jquery.mobile-1.1.0.js");
            await openFile("jquery.mobile-1.1.0.min.js");
        });
    });
});
