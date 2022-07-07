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

/*global describe, it, expect, beforeEach, afterEach, runs, waitsForDone, spyOn */

define(function (require, exports, module) {


    var SpecRunnerUtils = brackets.getModule("spec/SpecRunnerUtils"),
        FileUtils		= brackets.getModule("file/FileUtils"),
        CommandManager,
        Commands,
        Dialogs,
        EditorManager,
        DocumentManager,
        MainViewManager,
        FileSystem;

    var REMOTE_FILE_PATH = "https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0/css/bootstrap.min.css",
        INVALID_REMOTE_FILE_PATH = "https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0/css/invalid.min.css";



    describe("RemoteFileAdapter", function () {
        var testWindow,
            $,
            brackets;

        function createRemoteFile(filePath) {
            return CommandManager.execute(Commands.FILE_OPEN, {fullPath: filePath});
        }

        function deleteCurrentRemoteFile() {
            CommandManager.execute(Commands.FILE_DELETE);
        }

        function saveRemoteFile() {
            CommandManager.execute(Commands.FILE_SAVE);
        }

        function renameRemoteFile(filePath) {
            CommandManager.execute(Commands.FILE_RENAME);
        }

        function closeRemoteFile(filePath) {
            CommandManager.execute(Commands.FILE_CLOSE, {fullPath: filePath});
        }

        beforeEach(function () {
            runs(function () {
                SpecRunnerUtils.createTestWindowAndRun(this, function (w) {
                    testWindow = w;
                    $ = testWindow.$;
                    brackets		= testWindow.brackets;
                    DocumentManager = testWindow.brackets.test.DocumentManager;
                    MainViewManager = testWindow.brackets.test.MainViewManager;
                    CommandManager  = testWindow.brackets.test.CommandManager;
                    EditorManager   = testWindow.brackets.test.EditorManager;
                    Dialogs			= testWindow.brackets.test.Dialogs;
                    Commands        = testWindow.brackets.test.Commands;
                    FileSystem      = testWindow.brackets.test.FileSystem;
                });
            });
        });

        afterEach(function () {
            testWindow    = null;
            $             = null;
            brackets      = null;
            EditorManager = null;
            SpecRunnerUtils.closeTestWindow();
        });


        it("Open/close remote https file", function () {
            createRemoteFile(REMOTE_FILE_PATH).done(function () {
                expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(1);
                closeRemoteFile(REMOTE_FILE_PATH).done(function () {
                    expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(0);
                });
            });
        });

        it("Open invalid remote file", function () {
            spyOn(Dialogs, 'showModalDialog').andCallFake(function (dlgClass, title, message, buttons) {
                console.warn(title, message);
                return {done: function (callback) { callback(Dialogs.DIALOG_BTN_OK); } };
            });
            createRemoteFile(INVALID_REMOTE_FILE_PATH).always(function () {
                expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(0);
                expect(Dialogs.showModalDialog).toHaveBeenCalled();
                expect(Dialogs.showModalDialog.callCount).toBe(1);
            });
        });

        it("Save remote file", function () {
            createRemoteFile(REMOTE_FILE_PATH).done(function () {
                spyOn(Dialogs, 'showModalDialog').andCallFake(function (dlgClass, title, message, buttons) {
                    console.warn(title, message);
                    return {done: function (callback) { callback(Dialogs.DIALOG_BTN_OK); } };
                });
                saveRemoteFile();
                expect(Dialogs.showModalDialog).toHaveBeenCalled();
                expect(Dialogs.showModalDialog.callCount).toBe(1);
                closeRemoteFile(REMOTE_FILE_PATH).done(function () {
                    expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(0);
                });
            });
        });

        it("Delete remote file", function () {
            createRemoteFile(REMOTE_FILE_PATH).done(function () {
                expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(1);
                spyOn(Dialogs, 'showModalDialog').andCallFake(function (dlgClass, title, message, buttons) {
                    console.warn(title, message);
                    return {done: function (callback) { callback(Dialogs.DIALOG_BTN_OK); } };
                });
                deleteCurrentRemoteFile();
                expect(Dialogs.showModalDialog).toHaveBeenCalled();
                expect(Dialogs.showModalDialog.callCount).toBe(1);
                expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(1);
                closeRemoteFile(REMOTE_FILE_PATH).done(function () {
                    expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(0);
                });
            });
        });

        it("Rename remote file", function () {
            createRemoteFile(REMOTE_FILE_PATH).done(function () {
                expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(1);
                spyOn(Dialogs, 'showModalDialog').andCallFake(function (dlgClass, title, message, buttons) {
                    console.warn(title, message);
                    return {done: function (callback) { callback(Dialogs.DIALOG_BTN_OK); } };
                });
                renameRemoteFile();
                expect(Dialogs.showModalDialog).toHaveBeenCalled();
                expect(Dialogs.showModalDialog.callCount).toBe(1);
                expect(MainViewManager.getWorkingSet(MainViewManager.ACTIVE_PANE).length).toEqual(1);
            });
        });
    });
});
