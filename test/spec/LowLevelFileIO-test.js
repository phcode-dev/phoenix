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

/*global describe, it, expect, beforeEach, afterEach, awaitsFor, awaitsForDone*/

define(function (require, exports, module) {


    require("utils/Global");

    // Load dependent modules
    const SpecRunnerUtils     = require("spec/SpecRunnerUtils"),
        Strings     = require("strings");

    var UTF8 = "utf8",
        UTF16 = "utf16";

    // These are tests for the low-level file io routines in brackets-app. Make sure
    // you have the latest brackets-app before running.

    describe("LowLevelFileIO", function () {

        var baseDir = SpecRunnerUtils.getTempDirectory(),
            testDir;

        function readdirSpy() {
            var callback = function (err, content) {
                callback.error = err;
                callback.content = content;
                callback.wasCalled = true;
            };

            callback.wasCalled = false;

            return callback;
        }

        function statSpy() {
            var callback = function (err, stat) {
                callback.error = err;
                callback.stat = stat;
                callback.wasCalled = true;
            };

            callback.wasCalled = false;

            return callback;
        }

        function readFileSpy() {
            var callback = function (err, content) {
                callback.error = err;
                callback.content = content;
                callback.wasCalled = true;
            };

            callback.wasCalled = false;

            return callback;
        }

        function errSpy() {
            var callback = function (err) {
                callback.error = err;
                callback.wasCalled = true;
            };

            callback.wasCalled = false;

            return callback;
        }

        beforeEach(async function () {
            await SpecRunnerUtils.createTempDirectory();

            // create the test folder and init the test files
            var testFiles = SpecRunnerUtils.getTestPath("/spec/LowLevelFileIO-test-files");
            await awaitsForDone(SpecRunnerUtils.copy(testFiles, baseDir), "copy temp files");
            testDir = `${baseDir}/LowLevelFileIO-test-files`;
        });

        afterEach(async function () {
            await SpecRunnerUtils.removeTempDirectory();
        });

        it("should have a brackets.fs namespace", function () {
            expect(brackets.fs).toBeTruthy();
        });

        it("should getDisplayLocation return correct path in browsers", function () {
            // mount paths
            expect(brackets.app.getDisplayLocation("/mnt/apple")).toBe("apple");
            expect(brackets.app.getDisplayLocation("/mnt/apple/x/")).toBe("apple/x/");
            // filer paths
            expect(brackets.app.getDisplayLocation("/x/apple")).toBe(Strings.STORED_IN_YOUR_BROWSER);
            expect(brackets.app.getDisplayLocation("/y/apple/x/")).toBe(Strings.STORED_IN_YOUR_BROWSER);
        });

        it("should getDisplayLocation return correct path in tauri", function () {
            if(!Phoenix.browser.isTauri) {
                return;
            }
            // tauri paths
            if(brackets.platform === "win"){
                expect(brackets.app.getDisplayLocation("/tauri/x")).toBe("x:\\");
                expect(brackets.app.getDisplayLocation("/tauri/x/y")).toBe("x:\\y");
                expect(brackets.app.getDisplayLocation("/tauri/x/y/d.txt")).toBe("x:\\y\\d.txt");
            } else {
                expect(brackets.app.getDisplayLocation("/tauri/apple")).toBe("/apple");
                expect(brackets.app.getDisplayLocation("/tauri/apple/x/")).toBe("/apple/x/");
            }
        });

        describe("readdir", function () {

            it("should read a directory from disk", async function () {
                var cb = readdirSpy();

                brackets.fs.readdir(testDir, cb);

                await awaitsFor(function () { return cb.wasCalled; }, "readdir to finish", 1000);

                expect(cb.error).toBeFalsy();

                // Look for known files
                expect(cb.content.indexOf("file_one.txt")).not.toBe(-1);
                expect(cb.content.indexOf("file_two.txt")).not.toBe(-1);
                expect(cb.content.indexOf("file_three.txt")).not.toBe(-1);

                // Make sure '.' and '..' are omitted
                expect(cb.content.indexOf(".")).toBe(-1);
                expect(cb.content.indexOf("..")).toBe(-1);
            });

            it("should return an error if the directory doesn't exist", async function () {
                var cb = readdirSpy();

                brackets.fs.readdir("/This/directory/doesnt/exist", cb);

                await awaitsFor(function () { return cb.wasCalled; }, "readdir to finish");

                expect(cb.error.code).toBe(brackets.fs.ERR_CODES.ENOENT);
            });

            it("should return an error if invalid parameters are passed", function () {
                var cb = readdirSpy();

                expect(function () {
                    brackets.fs.readdir(42, cb);
                }).toThrow();
            });
        }); // describe("readdir")

        describe("stat", function () {

            it("should return correct information for a directory", async function () {
                var cb = statSpy();

                brackets.fs.stat(baseDir, cb);

                await awaitsFor(function () { return cb.wasCalled; }, 1000);

                expect(cb.error).toBeFalsy();
                expect(cb.stat.isDirectory()).toBe(true);
                expect(cb.stat.isFile()).toBe(false);
            });

            it("should return correct information for a file", async function () {
                var cb = statSpy();

                brackets.fs.stat(testDir + "/file_one.txt", cb);

                await awaitsFor(function () { return cb.wasCalled; }, "stat to finish", 1000);

                expect(cb.error).toBeFalsy();
                expect(cb.stat.isDirectory()).toBe(false);
                expect(cb.stat.isFile()).toBe(true);
            });

            it("should return an error if the file/directory doesn't exist", async function () {
                var cb = statSpy();

                brackets.fs.stat("/This/directory/doesnt/exist", cb);

                await awaitsFor(function () { return cb.wasCalled; }, "stat to finish");

                expect(cb.error.code).toBe(brackets.fs.ERR_CODES.ENOENT);
            });

            it("should return an error if incorrect parameters are passed", async function () {
                var cb = statSpy();

                brackets.fs.stat(42, cb);

                await awaitsFor(function () { return cb.wasCalled; }, "stat to finish", 1000);

                expect(cb.error.code).toBe(brackets.fs.ERR_CODES.EINVAL);
            });

        }); // describe("stat")

        describe("readFile", function () {

            it("should read a text file", async function () {
                var cb = readFileSpy();

                brackets.fs.readFile(testDir + "/file_one.txt", UTF8, cb);

                await awaitsFor(function () { return cb.wasCalled; }, "readFile to finish", 1000);

                expect(cb.error).toBeFalsy();
                expect(cb.content).toBe("Hello world");
            });

            it("should return an error if trying to read a non-existent file", async function () {
                var cb = readFileSpy();

                brackets.fs.readFile("/This/file/doesnt/exist.txt", UTF8, cb);

                await awaitsFor(function () { return cb.wasCalled; }, "readFile to finish");

                expect(cb.error.code).toBe(brackets.fs.ERR_CODES.ENOENT);
            });

            it("should return an error if trying to use an unsppported encoding", function () {
                brackets.fs.readFile(testDir + "/file_one.txt", "NOT_AN_ENCODING", (e, c)=>{
                    expect(e.code).toBe(brackets.fs.ERR_CODES.ECHARSET);
                    expect(c).toBeUndefined();
                });
            });

            it("should readFile error if called with invalid parameters", async function () {
                let cb = readFileSpy();

                brackets.fs.readFile(42, [], cb);

                await awaitsFor(function () { return cb.wasCalled; },  "readFile to finish",  1000);

                expect(cb.error.code).toBeDefined();
            });

            it("should return an error if trying to read a directory", async function () {
                var cb = readFileSpy();

                brackets.fs.readFile(baseDir, UTF8, cb);

                await awaitsFor(function () { return cb.wasCalled; }, 1000);

                expect(cb.error.code).toBe(brackets.fs.ERR_CODES.EISDIR);
            });

            it("should return an error trying to read a binary file", function () {
                brackets.fs.readFile(testDir + "/tree.jpg", "binary", (a, c)=> {
                    expect(ArrayBuffer.isView(c)).toBe(true);
                });
            });

            it("should be able to quickly determine if a large file is UTF-8", async function () {
                var cb = readFileSpy();

                brackets.fs.readFile(testDir + "/ru_utf8.html", UTF8, cb);

                await awaitsFor(function () { return cb.wasCalled; }, "readFile to finish", 1000);

                expect(cb.error).toBe(null);
            });

            it("should be able to quickly read a small UTF-8 file", async function () {
                var cb = readFileSpy();

                brackets.fs.readFile(testDir + "/es_small_utf8.html", UTF8, cb);

                await awaitsFor(function () { return cb.wasCalled; }, "readFile to finish", 1000);

                expect(cb.error).toBe(null);
            });


            it("should be able to read a zero-length file", async function () {
                var cb = readFileSpy();

                brackets.fs.readFile(testDir + "/emptyfile.txt", UTF8, cb);

                await awaitsFor(function () { return cb.wasCalled; }, "readFile to finish", 1000);

                expect(cb.error).toBe(null);
            });

            it("should be able to read a UTF-8 file with a BOM", async function () {
                var cb = readFileSpy();

                brackets.fs.readFile(testDir + "/ru_utf8_wBOM.html", UTF8, cb);

                await awaitsFor(function () { return cb.wasCalled; }, "readFile to finish", 1000);

                expect(cb.error).toBe(null);
                expect(cb.content[0]).toBe("<");  // should not have BOM
            });

        }); // describe("readFile")

        describe("writeFile", function () {

            var contents = "This content was generated from LowLevelFileIO-test.js";

            it("should write the entire contents of a file", async function () {
                var cb = errSpy(),
                    readFileCB = readFileSpy();

                brackets.fs.writeFile(baseDir + "/write_test.txt", contents, UTF8, cb);

                await awaitsFor(function () { return cb.wasCalled; }, "writeFile to finish", 1000);

                expect(cb.error).toBeFalsy();

                // Read contents to verify
                brackets.fs.readFile(baseDir + "/write_test.txt", UTF8, readFileCB);

                await awaitsFor(function () { return readFileCB.wasCalled; }, 1000);

                expect(readFileCB.error).toBeFalsy();
                expect(readFileCB.content).toBe(contents);
            });

            it("should writeFile return an error if called with invalid parameters", async function () {
                var cb = errSpy();

                brackets.fs.writeFile(42, contents, "utf8", cb);

                await awaitsFor(function () { return cb.wasCalled; },  "writeFile to finish",  1000);

                expect(cb.error.code).toBeDefined();
            });

            it("should return an error if trying to write a directory", async function () {
                var cb = errSpy();

                brackets.fs.writeFile(baseDir, contents, UTF8, cb);

                await awaitsFor(function () { return cb.wasCalled; }, "writeFile to finish", 1000);

                // Ideally we would get ERR_CANT_WRITE, but as long as we get some sort of error it's fine.
                expect(cb.error).toBeTruthy();
            });
        }); // describe("writeFile")

        describe("unlink", function () {

            var contents = "This content was generated from LowLevelFileIO-test.js";

            it("should remove a file", async function () {
                var filename    = baseDir + "/remove_me.txt",
                    writeFileCB = errSpy(),
                    readFileCB  = readFileSpy(),
                    unlinkCB    = errSpy(),
                    statCB      = statSpy();

                brackets.fs.writeFile(filename, contents, UTF8, writeFileCB);

                await awaitsFor(function () { return writeFileCB.wasCalled; }, "writeFile to finish", 1000);

                expect(writeFileCB.error).toBeFalsy();

                brackets.fs.readFile(filename, UTF8, readFileCB);

                await awaitsFor(function () { return readFileCB.wasCalled; },  "readFile to finish", 1000);

                expect(readFileCB.error).toBeFalsy();
                expect(readFileCB.content).toBe(contents);

                // Remove the file
                brackets.fs.unlink(filename, unlinkCB);

                await awaitsFor(function () { return unlinkCB.wasCalled; },  "unlink to finish", 1000);

                expect(unlinkCB.error).toBeFalsy();

                // Verify it is gone
                brackets.fs.stat(filename, statCB);

                await awaitsFor(function () { return statCB.wasCalled; },  "stat to finish", 1000);

                expect(statCB.error.code).toBe(brackets.fs.ERR_CODES.ENOENT);
            });

            it("should return an error if the file doesn't exist", async function () {
                var cb = errSpy();

                brackets.fs.unlink("/This/file/doesnt/exist.txt", cb);

                await awaitsFor(function () { return cb.wasCalled; },  "unlink to finish");

                expect(cb.error.code).toBe(brackets.fs.ERR_CODES.ENOENT);
            });

            it("should unlink return an error if called with invalid parameters", async function () {
                var cb = errSpy();

                brackets.fs.unlink(42, cb);

                await awaitsFor(function () { return cb.wasCalled; }, "unlink to finish", 1000);

                expect(cb.error.code).toBe(brackets.fs.ERR_CODES.EINVAL);
            });

            it("should remove a directory", async function () {
                var delDirName  = baseDir + "/unlink_dir",
                    cb          = errSpy(),
                    statCB      = statSpy(),
                    unlinkCB    = errSpy();

                brackets.fs.mkdir(delDirName, 0o777, cb);

                await awaitsFor(function () { return cb.wasCalled; }, "makeDir to finish");

                expect(cb.error).toBe(null);

                // Verify directory was created
                brackets.fs.stat(delDirName, statCB);

                await awaitsFor(function () { return statCB.wasCalled; }, "stat to finish");

                expect(statCB.error).toBe(null);
                expect(statCB.stat.isDirectory()).toBe(true);

                // Delete the directory
                brackets.fs.unlink(delDirName, unlinkCB);

                await awaitsFor(function () { return unlinkCB.wasCalled; });

                expect(cb.error).toBe(null);

                // Verify it is gone
                statCB = statSpy();
                brackets.fs.stat(delDirName, statCB);

                await awaitsFor(function () { return statCB.wasCalled; }, 1000, "stat to finish");

                expect(statCB.error.code).toBe(brackets.fs.ERR_CODES.ENOENT);
            });
        }); // describe("unlink")

        describe("makedir", function () {

            it("should make a new directory", async function () {
                var newDirName  = baseDir + "/brackets_unittests_new_dir",
                    cb          = errSpy(),
                    statCB      = statSpy(),
                    trashCB     = errSpy();

                brackets.fs.mkdir(newDirName, 0o777, cb);

                await awaitsFor(function () { return cb.wasCalled; }, "makedir to finish");

                expect(cb.error).toBe(null);

                // Verify directory was created
                brackets.fs.stat(newDirName, statCB);

                await awaitsFor(function () { return statCB.wasCalled; }, "stat to finish");

                expect(statCB.error).toBe(null);
                expect(statCB.stat.isDirectory()).toBe(true);

                // Delete the directory
                brackets.fs.unlink(newDirName, trashCB);

                await awaitsFor(function () { return trashCB.wasCalled; }, "moveToTrash to finish");

                expect(trashCB.error).toBe(null);
            });
        });

        describe("rename", function () {
            var complete;

            it("should rename a file", async function () {
                var oldName     = testDir + "/file_one.txt",
                    newName     = testDir + "/file_one_renamed.txt",
                    renameCB    = errSpy(),
                    statCB      = statSpy();

                complete = false;

                brackets.fs.rename(oldName, newName, renameCB);

                await awaitsFor(function () { return renameCB.wasCalled; }, "rename to finish", 1000);

                expect(renameCB.error).toBe(null);

                // Verify new file is found and old one is missing
                brackets.fs.stat(oldName, statCB);

                await awaitsFor(function () { return statCB.wasCalled; }, "stat to finish", 1000);

                expect(statCB.error.code).toBe(brackets.fs.ERR_CODES.ENOENT);

                statCB = statSpy();
                brackets.fs.stat(newName, statCB);

                await awaitsFor(function () { return statCB.wasCalled; }, "stat to finish", 1000);

                expect(statCB.error).toBe(null);

                // Rename the file back to the old name
                renameCB = errSpy();
                brackets.fs.rename(newName, oldName, renameCB);

                await awaitsFor(function () { return renameCB.wasCalled; }, "rename to finish", 1000);

                expect(renameCB.error).toBe(null);

            });
            it("should rename a folder", async function () {
                var oldName     = testDir + "/rename_me",
                    newName     = testDir + "/renamed_folder",
                    renameCB    = errSpy(),
                    statCB      = statSpy();

                complete = false;

                brackets.fs.rename(oldName, newName, renameCB);

                await awaitsFor(function () { return renameCB.wasCalled; }, "rename to finish", 1000);

                expect(renameCB.error).toBe(null);

                // Verify new folder is found and old one is missing
                brackets.fs.stat(oldName, statCB);

                await awaitsFor(function () { return statCB.wasCalled; }, "stat to finish", 1000);

                expect(statCB.error.code).toBe(brackets.fs.ERR_CODES.ENOENT);

                statCB = statSpy();
                brackets.fs.stat(newName, statCB);

                await awaitsFor(function () { return statCB.wasCalled; }, "stat to finish", 1000);

                expect(statCB.error).toBe(null);

                // Rename the folder back to the old name
                renameCB = errSpy();
                brackets.fs.rename(newName, oldName, renameCB);

                await awaitsFor(function () { return renameCB.wasCalled; }, "rename to finish", 1000);

                expect(renameCB.error).toBe(null);
            });
            it("should rename return an error if the new name already exists", async function () {
                var oldName = testDir + "/file_one.txt",
                    newName = testDir + "/file_two.txt",
                    cb      = errSpy();

                complete = false;

                brackets.fs.rename(oldName, newName, cb);

                await awaitsFor(function () { return cb.wasCalled; }, "rename to finish", 1000);

                expect(cb.error.code).toBe(brackets.fs.ERR_CODES.EEXIST);
            });
            // TODO: More testing of error cases?
        });

        describe("copyFile", function () {
            var complete;

            it("should copy a file", async function () {
                var fileName     = testDir + "/file_one.txt",
                    copyName     = testDir + "/file_one_copy.txt",
                    copyCB       = errSpy(),
                    unlinkCB     = errSpy(),
                    statCB       = statSpy(),
                    statCBsrc    =statSpy();

                complete = false;

                // Verify new file does not exist
                brackets.fs.stat(copyName, statCB);

                await awaitsFor(function () { return statCB.wasCalled; }, "stat to finish", 1000);

                expect(statCB.error.code).toBe(brackets.fs.ERR_CODES.ENOENT);

                // Verify src file exist
                brackets.fs.stat(fileName, statCBsrc);

                await awaitsFor(function () { return statCBsrc.wasCalled; }, "stat to finish", 1000);

                expect(statCBsrc.error).toBe(null);

                // make the copy
                brackets.fs.copyFile(fileName, copyName, copyCB);

                await awaitsFor(function () { return copyCB.wasCalled; }, "copyFile to finish", 1000);

                expect(copyCB.error).toBe(null);

                // Verify new file is found
                statCB = statSpy();
                brackets.fs.stat(copyName, statCB);

                await awaitsFor(function () { return statCB.wasCalled; }, "stat to finish", 1000);

                expect(statCB.error).toBe(null);

                // Verify the origin file still exists
                statCB = statSpy();
                brackets.fs.stat(fileName, statCB);

                await awaitsFor(function () { return statCB.wasCalled; }, "stat to finish", 1000);

                expect(statCB.error).toBe(null);

                // Delete the copy
                brackets.fs.unlink(copyName, unlinkCB);

                await awaitsFor(function () { return unlinkCB.wasCalled; }, "unlink to finish", 1000);

                expect(unlinkCB.error).toBe(null);

            });
        });

        describe("specialDirectories", function () {
            it("should have an application support directory", async function () {
                // these tests are here as these are absolute unchanging dir convention used by phoenix.
                if(window.__TAURI__){
                    const appSupportDIR = window.fs.getTauriVirtualPath(window._tauriBootVars.appLocalDir);
                    expect(brackets.app.getApplicationSupportDirectory().startsWith("/tauri/")).toBeTrue();
                    expect(brackets.app.getApplicationSupportDirectory()).toBe(appSupportDIR);
                } else {
                    expect(brackets.app.getApplicationSupportDirectory()).toBe('/fs/app/');
                }
            });
            it("should have a user documents directory", function () {
                // these tests are here as these are absolute unchanging dir convention used by phoenix.
                if(window.__TAURI__){
                    const documentsDIR = window.fs.getTauriVirtualPath(window._tauriBootVars.documentDir);
                    expect(brackets.app.getUserDocumentsDirectory().startsWith("/tauri/")).toBeTrue();
                    expect(brackets.app.getUserDocumentsDirectory()).toBe(documentsDIR);
                } else {
                    expect(brackets.app.getUserDocumentsDirectory()).toBe('/fs/local/');
                }
            });
            it("should have a user projects directory", function () {
                // these tests are here as these are absolute unchanging dir convention used by phoenix.
                if(window.__TAURI__){
                    const documentsDIR = window.fs.getTauriVirtualPath(window._tauriBootVars.documentDir);
                    const appName = window._tauriBootVars.appname;
                    const userProjectsDir = `${documentsDIR}${appName}/`;
                    expect(brackets.app.getUserProjectsDirectory().startsWith("/tauri/")).toBeTrue();
                    expect(brackets.app.getUserProjectsDirectory()).toBe(userProjectsDir);
                } else {
                    expect(brackets.app.getUserProjectsDirectory()).toBe('/fs/local/');
                }
            });
            it("should have a temp directory", function () {
                // these tests are here as these are absolute unchanging dir convention used by phoenix.
                if(window.__TAURI__){
                    let tempDIR = window.fs.getTauriVirtualPath(window._tauriBootVars.tempDir);
                    if(!tempDIR.endsWith("/")){
                        tempDIR = `${tempDIR}/`;
                    }
                    const appName = window._tauriBootVars.appname;
                    tempDIR = `${tempDIR}${appName}/`;
                    expect(brackets.app.getTempDirectory().startsWith("/tauri/")).toBeTrue();
                    expect(brackets.app.getTempDirectory()).toBe(tempDIR);
                } else {
                    expect(brackets.app.getTempDirectory()).toBe('/temp/');
                }
            });
            it("should have extensions directory", function () {
                // these tests are here as these are absolute unchanging dir convention used by phoenix.
                if(window.__TAURI__){
                    const appSupportDIR = window.fs.getTauriVirtualPath(window._tauriBootVars.appLocalDir);
                    const extensionsDir = `${appSupportDIR}assets/extensions/`;
                    expect(brackets.app.getExtensionsDirectory().startsWith("/tauri/")).toBeTrue();
                    expect(brackets.app.getExtensionsDirectory()).toBe(extensionsDir);
                } else {
                    expect(brackets.app.getExtensionsDirectory()).toBe('/fs/app/extensions/');
                }
            });

            it("should get virtual serving directory from virtual serving URL in browser", async function () {
                if(window.__TAURI__){
                    return;
                }
                expect(brackets.VFS.getPathForVirtualServingURL(`${window.fsServerUrl}blinker`)).toBe("/blinker");
                expect(brackets.VFS.getPathForVirtualServingURL(`${window.fsServerUrl}path/to/file_x.mp3`))
                    .toBe("/path/to/file_x.mp3");
                expect(brackets.VFS.getPathForVirtualServingURL("/some/path")).toBe(null);
                expect(brackets.VFS.getPathForVirtualServingURL("/fs")).toBe(null);
            });

            it("should not get virtual serving directory from virtual serving URL in tauri", async function () {
                if(!window.__TAURI__){
                    return;
                }
                expect(window.fsServerUrl).not.toBeDefined();
                expect(brackets.VFS.getPathForVirtualServingURL("/some/path")).toBe(null);
                expect(brackets.VFS.getPathForVirtualServingURL("/fs")).toBe(null);
            });
        });
    });
});
