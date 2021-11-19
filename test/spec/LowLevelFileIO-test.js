/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*global describe, it, expect, beforeEach, afterEach, waitsFor, waitsForDone, runs */

define(function (require, exports, module) {


    require("utils/Global");

    // Load dependent modules
    var SpecRunnerUtils     = require("spec/SpecRunnerUtils");

    var UTF8 = "utf8",
        UTF16 = "utf16";

    // These are tests for the low-level file io routines in brackets-app. Make sure
    // you have the latest brackets-app before running.

    describe("LowLevelFileIO", function () {

        var baseDir = SpecRunnerUtils.getTempDirectory();

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

        beforeEach(function () {
            SpecRunnerUtils.createTempDirectory();

            runs(function () {
                // create the test folder and init the test files
                var testFiles = SpecRunnerUtils.getTestPath("/spec/LowLevelFileIO-test-files");
                waitsForDone(SpecRunnerUtils.copy(testFiles, baseDir), "copy temp files");
            });
        });

        afterEach(function () {
            SpecRunnerUtils.removeTempDirectory();
        });

        it("should have a brackets.fs namespace", function () {
            expect(brackets.fs).toBeTruthy();
        });

        describe("readdir", function () {

            it("should read a directory from disk", function () {
                var cb = readdirSpy();

                runs(function () {
                    brackets.fs.readdir(baseDir, cb);
                });

                waitsFor(function () { return cb.wasCalled; }, "readdir to finish", 1000);

                runs(function () {
                    expect(cb.error).toBeFalsy();

                    // Look for known files
                    expect(cb.content.indexOf("file_one.txt")).not.toBe(-1);
                    expect(cb.content.indexOf("file_two.txt")).not.toBe(-1);
                    expect(cb.content.indexOf("file_three.txt")).not.toBe(-1);

                    // Make sure '.' and '..' are omitted
                    expect(cb.content.indexOf(".")).toBe(-1);
                    expect(cb.content.indexOf("..")).toBe(-1);
                });
            });

            it("should return an error if the directory doesn't exist", function () {
                var cb = readdirSpy();

                runs(function () {
                    brackets.fs.readdir("/This/directory/doesnt/exist", cb);
                });

                waitsFor(function () { return cb.wasCalled; }, "readdir to finish", 1000);

                runs(function () {
                    expect(cb.error.code).toBe(brackets.fs.ERR_NOT_FOUND);
                });
            });

            it("should return an error if the directory can't be read (Mac only)", function () {
                if (brackets.platform === "mac") {
                    var cb = readdirSpy();

                    runs(function () {
                        brackets.fs.readdir(baseDir + "/cant_read_here", cb);
                    });

                    waitsFor(function () { return cb.wasCalled; }, "readdir to finish", 1000);

                    runs(function () {
                        expect(cb.error).toBe(brackets.fs.ERR_CANT_READ);
                    });
                }

            });

            it("should return an error if invalid parameters are passed", function () {
                var cb = readdirSpy();

                expect(function () {
                    brackets.fs.readdir(42, cb);
                }).toThrow();
            });
        }); // describe("readdir")

        describe("stat", function () {

            it("should return correct information for a directory", function () {
                var cb = statSpy();

                runs(function () {
                    brackets.fs.stat(baseDir, cb);
                });

                waitsFor(function () { return cb.wasCalled; }, 1000);

                runs(function () {
                    expect(cb.error).toBeFalsy();
                    expect(cb.stat.isDirectory()).toBe(true);
                    expect(cb.stat.isFile()).toBe(false);
                });
            });

            it("should return correct information for a file", function () {
                var cb = statSpy();

                runs(function () {
                    brackets.fs.stat(baseDir + "/file_one.txt", cb);
                });

                waitsFor(function () { return cb.wasCalled; }, "stat to finish", 1000);

                runs(function () {
                    expect(cb.error).toBeFalsy();
                    expect(cb.stat.isDirectory()).toBe(false);
                    expect(cb.stat.isFile()).toBe(true);
                });
            });

            it("should return an error if the file/directory doesn't exist", function () {
                var cb = statSpy();

                runs(function () {
                    brackets.fs.stat("/This/directory/doesnt/exist", cb);
                });

                waitsFor(function () { return cb.wasCalled; }, "stat to finish", 1000);

                runs(function () {
                    expect(cb.error.code).toBe(brackets.fs.ERR_NOT_FOUND);
                });
            });

            it("should return an error if incorrect parameters are passed", function () {
                var cb = statSpy();

                expect(function () {
                    brackets.fs.stat(42, cb);
                }).toThrow();
            });

        }); // describe("stat")

        describe("readFile", function () {

            it("should read a text file", function () {
                var cb = readFileSpy();

                runs(function () {
                    brackets.fs.readFile(baseDir + "/file_one.txt", UTF8, cb);
                });

                waitsFor(function () { return cb.wasCalled; }, "readFile to finish", 1000);

                runs(function () {
                    expect(cb.error).toBeFalsy();
                    expect(cb.content).toBe("Hello world");
                });
            });

            it("should return an error if trying to read a non-existent file", function () {
                var cb = readFileSpy();

                runs(function () {
                    brackets.fs.readFile("/This/file/doesnt/exist.txt", UTF8, cb);
                });

                waitsFor(function () { return cb.wasCalled; }, "readFile to finish", 1000);

                runs(function () {
                    expect(cb.error.code).toBe(brackets.fs.ERR_NOT_FOUND);
                });
            });

            it("should return an error if trying to use an unsppported encoding", function () {
                var cb = readFileSpy();

                runs(function () {
                    brackets.fs.readFile(baseDir + "/file_one.txt", UTF16, cb);
                });

                waitsFor(function () { return cb.wasCalled; }, "readFile to finish",  1000);

                runs(function () {
                    expect(cb.error).toBe(brackets.fs.ERR_UNSUPPORTED_ENCODING);
                });
            });

            it("should return an error if called with invalid parameters", function () {
                var cb = readFileSpy();

                expect(function () {
                    brackets.fs.readFile(42, [], cb);
                }).toThrow();
            });

            it("should return an error if trying to read a directory", function () {
                var cb = readFileSpy();

                runs(function () {
                    brackets.fs.readFile(baseDir, UTF8, cb);
                });

                waitsFor(function () { return cb.wasCalled; }, 1000);

                runs(function () {
                    expect(cb.error.code).toBe(brackets.fs.ERR_EISDIR);
                });
            });

            it("should return an error trying to read a binary file", function () {
                var cb = readFileSpy();

                runs(function () {
                    brackets.fs.readFile(baseDir + "/tree.jpg", UTF8, cb);
                });

                waitsFor(function () { return cb.wasCalled; }, "readFile to finish",  1000);

                runs(function () {
                    expect(cb.error).toBe(brackets.fs.ERR_UNSUPPORTED_ENCODING);
                });
            });

            it("should be able to quickly determine if a large file is UTF-8", function () {
                var cb = readFileSpy();

                runs(function () {
                    brackets.fs.readFile(baseDir + "/ru_utf8.html", UTF8, cb);
                });

                waitsFor(function () { return cb.wasCalled; }, "readFile to finish", 1000);

                runs(function () {
                    expect(cb.error).toBe(null);
                });
            });

            it("should be able to quickly read a small UTF-8 file", function () {
                var cb = readFileSpy();

                runs(function () {
                    brackets.fs.readFile(baseDir + "/es_small_utf8.html", UTF8, cb);
                });

                waitsFor(function () { return cb.wasCalled; }, "readFile to finish", 1000);

                runs(function () {
                    expect(cb.error).toBe(null);
                });
            });


           it("should be able to read a zero-length file", function () {
               var cb = readFileSpy();

               runs(function () {
                   brackets.fs.readFile(baseDir + "/emptyfile.txt", UTF8, cb);
               });

               waitsFor(function () { return cb.wasCalled; }, "readFile to finish", 1000);

               runs(function () {
                   expect(cb.error).toBe(null);
               });
           });

            it("should not be able to read a UTF-8 file with malformed continuation bytes", function () {
                var cb = readFileSpy();

                runs(function () {
                    brackets.fs.readFile(baseDir + "/ru_bad_utf8.html", UTF8, cb);
                });

                waitsFor(function () { return cb.wasCalled; }, 1000);

                runs(function () {
                    expect(cb.error).toBe(brackets.fs.ERR_UNSUPPORTED_ENCODING);
                });
            });

            it("should be able to read a UTF-8 file with a BOM", function () {
                var cb = readFileSpy();

                runs(function () {
                    brackets.fs.readFile(baseDir + "/ru_utf8_wBOM.html", UTF8, cb);
                });

                waitsFor(function () { return cb.wasCalled; }, "readFile to finish", 1000);

                runs(function () {
                    expect(cb.error).toBe(null);
                    expect(cb.content[0]).toBe("<");  // should not have BOM
                });
            });

            it("should return an error trying to read a UTF16 file", function () {
                var cb = readFileSpy();

                runs(function () {
                    brackets.fs.readFile(baseDir + "/ru_utf16.html", UTF8, cb);
                });

                waitsFor(function () { return cb.wasCalled; }, "readFile to finish",  1000);

                runs(function () {
                    expect(cb.error).toBe(brackets.fs.ERR_UNSUPPORTED_ENCODING);
                });
            });

// FIXME: This test does not work on Linux or Mac
//            it("should return an error trying to read a UTF16 file w/o BOM ", function () {
//                var cb = readFileSpy();
//
//                runs(function () {
//                    brackets.fs.readFile(baseDir + "/ru_utf16_noBOM.html", UTF8, cb);
//                });
//
//                waitsFor(function () { return cb.wasCalled; }, "readFile to finish", 1000);
//
//                runs(function () {
//                    expect(cb.error).toBe(brackets.fs.ERR_UNSUPPORTED_ENCODING);
//                });
//            });

            it("should return an error trying to read a UTF32 file", function () {
                var cb = readFileSpy();

                runs(function () {
                    brackets.fs.readFile(baseDir + "/ru_utf32.html", UTF8, cb);
                });

                waitsFor(function () { return cb.wasCalled; }, "readFile to finish", 1000);

                runs(function () {
                    expect(cb.error).toBe(brackets.fs.ERR_UNSUPPORTED_ENCODING);
                });
            });
// FIXME: This test does not work on Linux or Mac
//            it("should return an error trying to read a UTF32 file w/o BOM ", function () {
//                var cb = readFileSpy();
//
//                runs(function () {
//                    brackets.fs.readFile(baseDir + "/ru_utf32_noBOM.html", UTF8, cb);
//                });
//
//                waitsFor(function () { return cb.wasCalled; }, "readFile to finish", 1000);
//
//                runs(function () {
//                    expect(cb.error).toBe(brackets.fs.ERR_UNSUPPORTED_ENCODING);
//                });
//            });


        }); // describe("readFile")

        describe("writeFile", function () {

            var contents = "This content was generated from LowLevelFileIO-test.js";

            it("should write the entire contents of a file", function () {
                var cb = errSpy(),
                    readFileCB = readFileSpy();

                runs(function () {
                    brackets.fs.writeFile(baseDir + "/write_test.txt", contents, UTF8, cb);
                });

                waitsFor(function () { return cb.wasCalled; }, "writeFile to finish", 1000);

                runs(function () {
                    expect(cb.error).toBeFalsy();
                });

                // Read contents to verify
                runs(function () {
                    brackets.fs.readFile(baseDir + "/write_test.txt", UTF8, readFileCB);
                });

                waitsFor(function () { return readFileCB.wasCalled; }, 1000);

                runs(function () {
                    expect(readFileCB.error).toBeFalsy();
                    expect(readFileCB.content).toBe(contents);
                });
            });

            it("should return an error if the file can't be written (Mac only)", function () {
                if (brackets.platform === "mac") {
                    var cb = errSpy();

                    runs(function () {
                        brackets.fs.writeFile(baseDir + "/cant_write_here/write_test.txt", contents, UTF8, cb);
                    });

                    waitsFor(function () { return cb.wasCalled; }, "writeFile to finish", 1000);

                    runs(function () {
                        expect(cb.error).toBe(brackets.fs.ERR_CANT_WRITE);
                    });
                }

            });

            it("should return an error if called with invalid parameters", function () {
                var cb = errSpy();

                expect(function () {
                    brackets.fs.writeFile(42, contents, 2, cb);
                }).toThrow();
            });

            it("should return an error if trying to write a directory", function () {
                var cb = errSpy();

                runs(function () {
                    brackets.fs.writeFile(baseDir, contents, UTF8, cb);
                });

                waitsFor(function () { return cb.wasCalled; }, "writeFile to finish", 1000);

                runs(function () {
                    // Ideally we would get ERR_CANT_WRITE, but as long as we get some sort of error it's fine.
                    expect(cb.error).toBeTruthy();
                });
            });
        }); // describe("writeFile")

        describe("unlink", function () {

            var contents = "This content was generated from LowLevelFileIO-test.js";

            it("should remove a file", function () {
                var filename    = baseDir + "/remove_me.txt",
                    writeFileCB = errSpy(),
                    readFileCB  = readFileSpy(),
                    unlinkCB    = errSpy(),
                    statCB      = statSpy();

                runs(function () {
                    brackets.fs.writeFile(filename, contents, UTF8, writeFileCB);
                });

                waitsFor(function () { return writeFileCB.wasCalled; }, "writeFile to finish", 1000);

                runs(function () {
                    expect(writeFileCB.error).toBeFalsy();
                });


                // Read contents to verify
                runs(function () {
                    brackets.fs.readFile(filename, UTF8, readFileCB);
                });

                waitsFor(function () { return readFileCB.wasCalled; },  "readFile to finish", 1000);

                runs(function () {
                    expect(readFileCB.error).toBeFalsy();
                    expect(readFileCB.content).toBe(contents);
                });

                // Remove the file
                runs(function () {
                    brackets.fs.unlink(filename, unlinkCB);
                });

                waitsFor(function () { return unlinkCB.wasCalled; },  "unlink to finish", 1000);

                runs(function () {
                    expect(unlinkCB.error).toBeFalsy();
                });

                // Verify it is gone
                runs(function () {
                    brackets.fs.stat(filename, statCB);
                });

                waitsFor(function () { return statCB.wasCalled; },  "stat to finish", 1000);

                runs(function () {
                    expect(statCB.error.code).toBe(brackets.fs.ERR_NOT_FOUND);
                });
            });

            it("should return an error if the file doesn't exist", function () {
                var cb = errSpy();

                runs(function () {
                    brackets.fs.unlink("/This/file/doesnt/exist.txt", cb);
                });

                waitsFor(function () { return cb.wasCalled; },  "unlink to finish",  1000);

                runs(function () {
                    expect(cb.error.code).toBe(brackets.fs.ERR_NOT_FOUND);
                });
            });

            it("should return an error if called with invalid parameters", function () {
                var cb = errSpy();

                runs(function () {
                    brackets.fs.unlink(42, cb);
                });

                waitsFor(function () { return cb.wasCalled; }, "unlink to finish", 1000);

                runs(function () {
                    expect(cb.error.code).toBe(brackets.fs.ERR_EINVAL);
                });
            });

            it("should remove a directory", function () {
                var delDirName  = baseDir + "/unlink_dir",
                    cb          = errSpy(),
                    statCB      = statSpy(),
                    unlinkCB    = errSpy();

                runs(function () {
                    brackets.fs.mkdir(delDirName, parseInt("777", 0), cb);
                });

                waitsFor(function () { return cb.wasCalled; }, "makeDir to finish");

                runs(function () {
                    expect(cb.error).toBe(null);
                });

                // Verify directory was created
                runs(function () {
                    brackets.fs.stat(delDirName, statCB);
                });

                waitsFor(function () { return statCB.wasCalled; }, "stat to finish");

                runs(function () {
                    expect(statCB.error).toBe(null);
                    expect(statCB.stat.isDirectory()).toBe(true);
                });

                // Delete the directory
                runs(function () {
                    brackets.fs.unlink(delDirName, unlinkCB);
                });

                waitsFor(function () { return unlinkCB.wasCalled; });

                runs(function () {
                    expect(cb.error).toBe(null);
                });

                // Verify it is gone
                runs(function () {
                    statCB = statSpy();
                    brackets.fs.stat(delDirName, statCB);
                });

                waitsFor(function () { return statCB.wasCalled; }, 1000, "stat to finish");

                runs(function () {
                    expect(statCB.error.code).toBe(brackets.fs.ERR_NOT_FOUND);
                });
            });
        }); // describe("unlink")

        describe("makedir", function () {

            it("should make a new directory", function () {
                var newDirName  = baseDir + "/brackets_unittests_new_dir",
                    cb          = errSpy(),
                    statCB      = statSpy(),
                    trashCB     = errSpy();

                runs(function () {
                    brackets.fs.mkdir(newDirName, parseInt("777", 0), cb);
                });

                waitsFor(function () { return cb.wasCalled; }, "makedir to finish");

                runs(function () {
                    expect(cb.error).toBe(null);
                });

                // Verify directory was created
                runs(function () {
                    brackets.fs.stat(newDirName, statCB);
                });

                waitsFor(function () { return statCB.wasCalled; }, "stat to finish");

                runs(function () {
                    expect(statCB.error).toBe(null);
                    expect(statCB.stat.isDirectory()).toBe(true);
                });

                // Delete the directory
                runs(function () {
                    brackets.fs.unlink(newDirName, trashCB);
                });

                waitsFor(function () { return trashCB.wasCalled; }, "moveToTrash to finish");

                runs(function () {
                    expect(trashCB.error).toBe(null);
                });
            });
        });

        describe("rename", function () {
            var complete;

            it("should rename a file", function () {
                var oldName     = baseDir + "/file_one.txt",
                    newName     = baseDir + "/file_one_renamed.txt",
                    renameCB    = errSpy(),
                    statCB      = statSpy();

                complete = false;

                runs(function () {
                    brackets.fs.rename(oldName, newName, renameCB);
                });

                waitsFor(function () { return renameCB.wasCalled; }, "rename to finish", 1000);

                runs(function () {
                    expect(renameCB.error).toBe(null);
                });

                // Verify new file is found and old one is missing
                runs(function () {
                    brackets.fs.stat(oldName, statCB);
                });

                waitsFor(function () { return statCB.wasCalled; }, "stat to finish", 1000);

                runs(function () {
                    expect(statCB.error.code).toBe(brackets.fs.ERR_NOT_FOUND);
                });

                runs(function () {
                    statCB = statSpy();
                    brackets.fs.stat(newName, statCB);
                });

                waitsFor(function () { return statCB.wasCalled; }, "stat to finish", 1000);

                runs(function () {
                    expect(statCB.error).toBe(null);
                });

                // Rename the file back to the old name
                runs(function () {
                    renameCB = errSpy();
                    brackets.fs.rename(newName, oldName, renameCB);
                });

                waitsFor(function () { return renameCB.wasCalled; }, "rename to finish", 1000);

                runs(function () {
                    expect(renameCB.error).toBe(null);
                });

            });
            it("should rename a folder", function () {
                var oldName     = baseDir + "/rename_me",
                    newName     = baseDir + "/renamed_folder",
                    renameCB    = errSpy(),
                    statCB      = statSpy();

                complete = false;

                runs(function () {
                    brackets.fs.rename(oldName, newName, renameCB);
                });

                waitsFor(function () { return renameCB.wasCalled; }, "rename to finish", 1000);

                runs(function () {
                    expect(renameCB.error).toBe(null);
                });

                // Verify new folder is found and old one is missing
                runs(function () {
                    brackets.fs.stat(oldName, statCB);
                });

                waitsFor(function () { return statCB.wasCalled; }, "stat to finish", 1000);

                runs(function () {
                    expect(statCB.error.code).toBe(brackets.fs.ERR_NOT_FOUND);
                });

                runs(function () {
                    statCB = statSpy();
                    brackets.fs.stat(newName, statCB);
                });

                waitsFor(function () { return statCB.wasCalled; }, "stat to finish", 1000);

                runs(function () {
                    expect(statCB.error).toBe(null);
                });

                // Rename the folder back to the old name
                runs(function () {
                    renameCB = errSpy();
                    brackets.fs.rename(newName, oldName, renameCB);
                });

                waitsFor(function () { return renameCB.wasCalled; }, "rename to finish", 1000);

                runs(function () {
                    expect(renameCB.error).toBe(null);
                });
            });
            it("should return an error if the new name already exists", function () {
                var oldName = baseDir + "/file_one.txt",
                    newName = baseDir + "/file_two.txt",
                    cb      = errSpy();

                complete = false;

                runs(function () {
                    brackets.fs.rename(oldName, newName, cb);
                });

                waitsFor(function () { return cb.wasCalled; }, "rename to finish", 1000);

                runs(function () {
                    expect(cb.error.code).toBe(brackets.fs.ERR_FILE_EXISTS);
                });
            });
            it("should return an error if the parent folder is read only (Mac only)", function () {
                if (brackets.platform === "mac") {
                    var oldName = baseDir + "/cant_write_here/readme.txt",
                        newName = baseDir + "/cant_write_here/readme_renamed.txt",
                        cb      = errSpy();

                    complete = false;

                    runs(function () {
                        brackets.fs.rename(oldName, newName, cb);
                    });

                    waitsFor(function () { return cb.wasCalled; }, "rename to finish", 1000);

                    runs(function () {
                        expect(cb.error).toBe(brackets.fs.ERR_CANT_WRITE);
                    });
                }
            });
            // TODO: More testing of error cases?
        });

        describe("copyFile", function () {
            var complete;

            it("should copy a file", function () {
                var fileName     = baseDir + "/file_one.txt",
                    copyName     = baseDir + "/file_one_copy.txt",
                    copyCB       = errSpy(),
                    unlinkCB     = errSpy(),
                    statCB       = statSpy(),
                    statCBsrc    =statSpy();

                complete = false;

                // Verify new file does not exist
                runs(function () {
                    brackets.fs.stat(copyName, statCB);
                });

                waitsFor(function () { return statCB.wasCalled; }, "stat to finish", 1000);

                runs(function () {
                    expect(statCB.error.code).toBe(brackets.fs.ERR_NOT_FOUND);
                });

                // Verify src file exist
                runs(function () {
                    brackets.fs.stat(fileName, statCBsrc);
                });

                waitsFor(function () { return statCBsrc.wasCalled; }, "stat to finish", 1000);

                runs(function () {
                    expect(statCBsrc.error).toBe(null);
                });

                // make the copy
                runs(function () {
                    brackets.fs.copyFile(fileName, copyName, copyCB);
                });

                waitsFor(function () { return copyCB.wasCalled; }, "copyFile to finish", 1000);

                runs(function () {
                    expect(copyCB.error).toBe(null);
                });

                // Verify new file is found
                runs(function () {
                    statCB = statSpy();
                    brackets.fs.stat(copyName, statCB);
                });

                waitsFor(function () { return statCB.wasCalled; }, "stat to finish", 1000);

                runs(function () {
                    expect(statCB.error).toBe(null);
                });

                // Verify the origin file still exists
                runs(function () {
                    statCB = statSpy();
                    brackets.fs.stat(fileName, statCB);
                });

                waitsFor(function () { return statCB.wasCalled; }, "stat to finish", 1000);

                runs(function () {
                    expect(statCB.error).toBe(null);
                });

                // Delete the copy
                runs(function () {
                    brackets.fs.unlink(copyName, unlinkCB);
                });

                waitsFor(function () { return unlinkCB.wasCalled; }, "unlink to finish", 1000);

                runs(function () {
                    expect(unlinkCB.error).toBe(null);
                });

            });
        });

        describe("specialDirectories", function () {
            it("should have an application support directory", function () {
                runs(function () {
                    expect(brackets.app.getApplicationSupportDirectory().length).toNotBe(0);
                });
            });
            it("should have a user documents directory", function () {
                runs(function () {
                    expect(brackets.app.getUserDocumentsDirectory().length).toNotBe(0);
                });
            });
        });

        describe("moveToTrash", function () {
            it("should move a file to the trash", function () {
                var newFileName = baseDir + "/brackets_unittests_delete_me.txt",
                    writeFileCB = errSpy(),
                    trashCB     = errSpy();

                // Create a file
                runs(function () {
                    brackets.fs.writeFile(newFileName, "", UTF8, writeFileCB);
                });

                waitsFor(function () { return writeFileCB.wasCalled; }, "writeFile to finish");

                runs(function () {
                    expect(writeFileCB.error).toBe(null);
                });

                // Move it to the trash
                runs(function () {
                    brackets.fs.moveToTrash(newFileName, trashCB);
                });

                waitsFor(function () { return trashCB.wasCalled; }, "moveToTrash to finish");

                runs(function () {
                    expect(trashCB.error).toBe(null);
                });

                // Make sure it's gone
                runs(function () {
                    trashCB = errSpy();
                    brackets.fs.moveToTrash(newFileName, trashCB);
                });

                waitsFor(function () { return trashCB.wasCalled; }, "moveToTrash to finish");

                runs(function () {
                    expect(trashCB.error.code).toBe(brackets.fs.ERR_NOT_FOUND);
                });
            });

            it("should move a folder to the trash", function () {
                var newDirName  = baseDir + "/brackets_unittests_dir_to_delete",
                    makedirCB   = errSpy(),
                    trashCB     = errSpy();

                // Create a file
                runs(function () {
                    brackets.fs.makedir(newDirName, parseInt("777", 8), makedirCB);
                });

                waitsFor(function () { return makedirCB.wasCalled; }, "makedir to finish");

                runs(function () {
                    expect(makedirCB.error).toBe(null);
                });

                // Move it to the trash
                runs(function () {
                    brackets.fs.moveToTrash(newDirName, trashCB);
                });

                waitsFor(function () { return trashCB.wasCalled; }, "moveToTrash to finish");

                runs(function () {
                    expect(trashCB.error).toBe(null);
                });

                // Make sure it's gone
                runs(function () {
                    trashCB = errSpy();
                    brackets.fs.moveToTrash(newDirName, trashCB);
                });

                waitsFor(function () { return trashCB.wasCalled; }, "moveToTrash to finish");

                runs(function () {
                    expect(trashCB.error.code).toBe(brackets.fs.ERR_NOT_FOUND);
                });
            });

            it("should return an error if the item doesn't exsit", function () {
                var cb = errSpy();

                // Move it to the trash
                runs(function () {
                    brackets.fs.moveToTrash(baseDir + "/doesnt_exist", cb);
                });

                waitsFor(function () { return cb.wasCalled; }, "moveToTrash to finish");

                runs(function () {
                    expect(cb.error.code).toBe(brackets.fs.ERR_NOT_FOUND);
                });
            });
        }); // moveToTrash
    });
});
