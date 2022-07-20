/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 * Original work Copyright (c) 2013 - 2021 Adobe Systems Incorporated. All rights reserved.
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

/*global describe, it, expect, beforeEach, beforeAll, afterAll, spyOn, awaitsForDone, awaitsForFail */

define(function (require, exports, module) {


    var SpecRunnerUtils = brackets.getModule("spec/SpecRunnerUtils"),
        CommandManager,
        Commands,
        Dialogs,
        MainViewManager;

    var REMOTE_FILE_PATH = "https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0/css/bootstrap.min.css",
        INVALID_REMOTE_FILE_PATH = "https://something.not.present/a.html";



    describe("extension:RemoteFileAdapter", function () {
        var testWindow;

        function createRemoteFile(filePath) {
            return CommandManager.execute(Commands.FILE_OPEN, {fullPath: filePath});
        }

        function deleteCurrentRemoteFile() {
            return CommandManager.execute(Commands.FILE_DELETE);
        }

        function saveRemoteFile() {
            return CommandManager.execute(Commands.FILE_SAVE);
        }

        function renameRemoteFile(filePath) {
            return CommandManager.execute(Commands.FILE_RENAME);
        }

        function closeRemoteFile(filePath) {
            return CommandManager.execute(Commands.FILE_CLOSE, {fullPath: filePath});
        }

        beforeAll(async function () {
            testWindow = await SpecRunnerUtils.createTestWindowAndRun();
            MainViewManager = testWindow.brackets.test.MainViewManager;
            CommandManager  = testWindow.brackets.test.CommandManager;
            Dialogs			= testWindow.brackets.test.Dialogs;
            Commands        = testWindow.brackets.test.Commands;
            spyOn(Dialogs, 'showModalDialog').and.callFake(function (dlgClass, title, message, buttons) {
                console.warn(title, message);
                return {done: function (callback) { callback(Dialogs.DIALOG_BTN_OK); } };
            });
        }, 30000);

        beforeEach(function () {
            Dialogs.showModalDialog.calls.reset();
        });

        afterAll(async function () {
            testWindow    = null;
            await SpecRunnerUtils.closeTestWindow();
        });


        it("Open/close remote https file", async function () {
            await awaitsForDone(createRemoteFile(REMOTE_FILE_PATH));
            expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(1);
            await awaitsForDone(closeRemoteFile(REMOTE_FILE_PATH));
            expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(0);
        });

        it("Open invalid remote file", async function () {
            await awaitsForFail(createRemoteFile(INVALID_REMOTE_FILE_PATH));
            expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(0);
            expect(Dialogs.showModalDialog).toHaveBeenCalled();
            expect(Dialogs.showModalDialog.calls.count()).toBe(1);
        });

        it("Save remote file", async function () {
            await awaitsForDone(createRemoteFile(REMOTE_FILE_PATH));
            expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(1);
            await awaitsForFail(saveRemoteFile());
            await awaitsForDone(closeRemoteFile(REMOTE_FILE_PATH));
            expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(0);
        });

        it("Delete remote file", async function () {
            await awaitsForDone(createRemoteFile(REMOTE_FILE_PATH));
            expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(1);
            await awaitsForDone(deleteCurrentRemoteFile());
            expect(Dialogs.showModalDialog).toHaveBeenCalled();
            expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(1);
            await awaitsForDone(closeRemoteFile(REMOTE_FILE_PATH));
            expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(0);
        });

        it("Rename remote file", async function () {
            await awaitsForDone(createRemoteFile(REMOTE_FILE_PATH));
            expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(1);
            await awaitsForFail(renameRemoteFile());
            expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(1);
        });
    });
});
