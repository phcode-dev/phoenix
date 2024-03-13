/*
 *  Copyright (c) 2021 - present core.ai . All rights reserved.
 *  Original work Copyright (c) 2014 - 2021 Adobe Systems Incorporated. All rights reserved.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 */

/*global describe, it, expect, beforeAll, afterAll*/
/*unittests: FileFilters*/

define(function (require, exports, module) {


    let FileFilters        = require("search/FileFilters"),
        ProjectManager      = require("project/ProjectManager");

    describe("FileFilters", function () {
        let savedIsWithinProject, savedMakeProjectRelativeIfPossible;
        beforeAll(function () {
            savedIsWithinProject = ProjectManager.isWithinProject;
            savedMakeProjectRelativeIfPossible = ProjectManager.makeProjectRelativeIfPossible;
            ProjectManager.isWithinProject = function () {
                return true;
            };
            ProjectManager.makeProjectRelativeIfPossible = function (path) {
                return path.startsWith("/") ? path.slice(1) : path;
            };
        });

        afterAll(function () {
            ProjectManager.isWithinProject = savedIsWithinProject;
            ProjectManager.makeProjectRelativeIfPossible = savedMakeProjectRelativeIfPossible;
        });
        // filterPath() == true means the path does NOT match the glob, i.e. it passes the filter
        // filterPath() == false means the path DOES match the glob, i.e. it got filtered out
        function expectMatch(compiledFilter, path) {
            FileFilters.setActiveFilter(compiledFilter, FileFilters.FILTER_TYPE_EXCLUDE);
            expect(FileFilters.filterPath(compiledFilter, path)).toBe(false);
            FileFilters.setActiveFilter(compiledFilter, FileFilters.FILTER_TYPE_INCLUDE);
            expect(FileFilters.filterPath(compiledFilter, path)).toBe(true);
            FileFilters.setActiveFilter(compiledFilter, FileFilters.FILTER_TYPE_NO_FILTER);
            expect(FileFilters.filterPath(compiledFilter, path)).toBe(true);
        }
        function expectNotMatch(compiledFilter, path) {
            FileFilters.setActiveFilter(compiledFilter, FileFilters.FILTER_TYPE_EXCLUDE);
            expect(FileFilters.filterPath(compiledFilter, path)).toBe(true);
            FileFilters.setActiveFilter(compiledFilter, FileFilters.FILTER_TYPE_INCLUDE);
            expect(FileFilters.filterPath(compiledFilter, path)).toBe(false);
            FileFilters.setActiveFilter(compiledFilter, FileFilters.FILTER_TYPE_NO_FILTER);
            expect(FileFilters.filterPath(compiledFilter, path)).toBe(true);
        }
        describe("Filter matching", function () {

            it("empty filter is undetermined behavior", function () {
                // this is never possible in the current setup.
            });

            it("should match simple substring", function () {
                let filter = FileFilters.compile("foo");
                expectMatch(filter, "/foo/bbb/file.txt");
                expectMatch(filter, "/aaa/bbb/foo.txt");
                expectMatch(filter, "/aaa/bbb/ccc.foo");
                expectMatch(filter, "/aaa/foo");
                expectMatch(filter, "/foo");
                expectMatch(filter, "/foo_bar/bbb/file.txt");
                expectMatch(filter, "/aaa/bbb/fooX.txt");
                expectMatch(filter, "/aaa/bbb/Xfoo.txt");
                expectMatch(filter, "/aaa/bbb/ccc.fooX");
                expectMatch(filter, "/aaa/bbb/ccc.Xfoo");

                expectNotMatch(filter, "/aaa/bbb/ccc.txt");
                expectNotMatch(filter, "/aaa/fo/o.txt");
            });

            it("should match file extension", function () {
                let filter = FileFilters.compile("*.css");
                expectMatch(filter,    "/file.css");
                expectMatch(filter,    "/aaa/bbb/file.css");
                expectNotMatch(filter, "/foo/bbb/file.txt");
                expectNotMatch(filter, "/aaa/bbb/file.cssX");
                expectNotMatch(filter, "/aaa/bbb/file.Xcss");
                expectNotMatch(filter, "/aaa/bbb/fileXcss");
                expectNotMatch(filter, "/aaa/bbb/file.css.min");
                expectNotMatch(filter, "/aaa/bbb/filecss");
                expectNotMatch(filter, "/aaa/bbb.css/file.txt");
                expectMatch(filter,    "/aaa/bbb.css/file.css");
                expectMatch(filter,    "/aaa/bbb/.css");
            });

            it("should match file with , in path", function () {
                let filter = FileFilters.compile("*.\\,css");
                expectMatch(filter,    "/file.,css");
                expectMatch(filter,    "/aaa/bbb/file.,css");
                expectNotMatch(filter, "/foo/bbb/file.css");
                expectNotMatch(filter, "/aaa/bbb/file.css");
            });

            it("should match multiple file extensions", function () {
                let filter = FileFilters.compile("*.css,*.txt");
                expectMatch(filter,    "/file.css");
                expectMatch(filter,    "/aaa/bbb/file.css");
                expectMatch(filter, "/foo/bbb/file.txt");
                expectNotMatch(filter, "/aaa/bbb/file.cssX");
                expectNotMatch(filter, "/aaa/bbb/file.Xcss");
                expectNotMatch(filter, "/aaa/bbb/fileXcss");
                expectNotMatch(filter, "/aaa/bbb/file.css.min");
                expectNotMatch(filter, "/aaa/bbb/filecss");
                expectMatch(filter, "/aaa/bbb.css/file.txt");
                expectMatch(filter,    "/aaa/bbb.css/file.css");
                expectMatch(filter,    "/aaa/bbb/.css");
            });

            it("should do simple string search if not glob filters", function () {
                let filter = FileFilters.compile("css,txt");
                expectMatch(filter,    "/file.css");
                expectMatch(filter,    "/aaa/bbb/file.css");
                expectMatch(filter, "/foo/bbb/file.txt");
                expectMatch(filter, "/aaa/bbb/file.cssX");
                expectMatch(filter, "/aaa/bbb/file.Xcss");
                expectMatch(filter, "/aaa/bbb/fileXcss");
                expectMatch(filter, "/aaa/bbb/file.css.min");
                expectMatch(filter, "/aaa/bbb/filecss");
                expectMatch(filter, "/aaa/bbb.css/file.txt");
                expectMatch(filter,    "/aaa/bbb.css/file.css");
                expectMatch(filter,    "/aaa/bbb/.css");
            });

            it("should match file name", function () {
                let filter = FileFilters.compile("**/jquery.js");
                expectMatch(filter,    "/jquery.js");
                expectMatch(filter,    "/aaa/bbb/jquery.js");
                expectNotMatch(filter, "/foo/bbb/jquery.js.txt");
                expectNotMatch(filter, "/foo/bbb/Xjquery.js");
                expectNotMatch(filter, "/foo/bbb/jquery.jsX");
                expectNotMatch(filter, "/aaa/jqueryXjs");
                expectNotMatch(filter, "/aaa/jquery.js/");
                expectNotMatch(filter, "/aaa/jquery.js/file.js");
                expectNotMatch(filter, "/aaa/jquery.js/file.txt");
                expectMatch(filter,    "/aaa/jquery.js/jquery.js");
            });

            it("should match folder name", function () {
                let filter = FileFilters.compile("**/node_modules/**");
                expectMatch(filter,    "/node_modules/");
                expectMatch(filter,    "/node_modules/file.js");
                expectMatch(filter,    "/node_modules/bbb/file.js");
                expectMatch(filter,    "/aaa/node_modules/file.js");
                expectNotMatch(filter, "/aaa/bbb/file.js");
                expectNotMatch(filter, "/aaa/Xnode_modules/file.js");
                expectNotMatch(filter, "/aaa/node_modulesX/file.js");
                expectNotMatch(filter, "/aaa/bbb/node_modules.js");
            });

            it("should match multi-segment path part", function () {
                let filter = FileFilters.compile("**/foo/bar/**");
                expectMatch(filter,    "/foo/bar/");
                expectMatch(filter,    "/foo/bar/file.txt");
                expectMatch(filter,    "/aaa/foo/bar/");
                expectMatch(filter,    "/aaa/foo/bar/file.txt");
                expectNotMatch(filter, "/foo/aaa/bar/");
                expectNotMatch(filter, "/foo.bar/");
                expectNotMatch(filter, "/Xfoo/bar");
                expectNotMatch(filter, "/fooX/bar");
                expectNotMatch(filter, "/foo/Xbar");
                expectNotMatch(filter, "/foo/barX");
                expectMatch(filter,    "/foo/aaa/foo/bar/file.txt");

                filter = FileFilters.compile("/foo/bar.js");
                expectNotMatch(filter, "/foo/bar");
                expectNotMatch(filter, "/foo/bar/");
                expectNotMatch(filter, "/foo/bar/file.txt");
                expectMatch(filter,    "/aaa/foo/bar.js");
                expectNotMatch(filter, "/foo/aaa/bar.js");
                expectNotMatch(filter, "/foo.bar.js");
                expectNotMatch(filter, "/Xfoo/bar.js");
                expectNotMatch(filter, "/fooX/bar.js");
                expectNotMatch(filter, "/foo/Xbar.js");
                expectNotMatch(filter, "/foo/barX.js");
                expectNotMatch(filter, "/foo/bar.Xjs");
                expectNotMatch(filter, "/foo/bar.jsX");
                expectMatch(filter,    "/foo/aaa/foo/bar.js");
            });

            it("should match * within path segment", function () {
                let filter = FileFilters.compile("**/*a*c*");
                expectMatch(filter,    "/ac");
                expectMatch(filter,    "/abc");
                expectMatch(filter,    "/a123c");
                expectMatch(filter,    "/Xac");
                expectMatch(filter,    "/Xabc");
                expectMatch(filter,    "/Xa123c");
                expectMatch(filter,    "/acX");
                expectMatch(filter,    "/abcX");
                expectMatch(filter,    "/a123cX");
                expectMatch(filter,    "/ac/");
                expectMatch(filter,    "/abc/");
                expectMatch(filter,    "/a123c/");
                expectMatch(filter,    "/ab.c/");
                expectMatch(filter,    "/Xab.c/");
                expectMatch(filter,    "/ab.cX/");
                expectNotMatch(filter, "/ab/cd");
                expectNotMatch(filter, "/ab/cd/");

                filter = FileFilters.compile("**/foo*.js");
                expectMatch(filter,    "/foo.js");
                expectMatch(filter,    "/aaa/foo.js");
                expectMatch(filter,    "/fooX.js");
                expectMatch(filter,    "/aaa/fooX.js");
                expectMatch(filter,    "/fooXYZ.js");
                expectMatch(filter,    "/aaa/fooXYZ.js");
                expectNotMatch(filter, "/foojs");
                expectNotMatch(filter, "/foo.js/bar");
                expectNotMatch(filter, "/foo/bar.js");

                filter = FileFilters.compile("foo");  // this might as well be ** on either side, since implied ones are added
                expectMatch(filter,    "/aaa/foo/ccc");
                expectMatch(filter,    "/foo/bbb/ccc");
                expectMatch(filter,    "/aaa/bbb/foo");
                expectMatch(filter,    "/aaa/bbb/foo.txt");
                expectMatch(filter,    "/aaa/bbb/Xfoo.txt");
                expectMatch(filter,    "/aaa/Xfoo/ccc");
                expectMatch(filter,    "/aaa/fooX/ccc");
                expectMatch(filter,    "/Xfoo/bbb/ccc");
                expectMatch(filter,    "/fooX/bbb/ccc");
                expectNotMatch(filter, "/aaaf/oo/bbb");

                filter = FileFilters.compile("**/*foo*/**");
                expectMatch(filter,    "/aaa/foo/ccc");
                expectMatch(filter,    "/foo/bbb/ccc");
                expectNotMatch(filter, "/aaa/bbb/foo");
                expectNotMatch(filter, "/aaa/bbb/foo.txt");
                expectMatch(filter,    "/aaa/Xfoo/ccc");
                expectMatch(filter,    "/aaa/fooX/ccc");
                expectMatch(filter,    "/Xfoo/bbb/ccc");
                expectMatch(filter,    "/fooX/bbb/ccc");
                expectNotMatch(filter, "/aaaf/oo/bbb");

                filter = FileFilters.compile("**/node_*/**,**/node_*");
                expectMatch(filter,    "/code/node_modules/foo.js");
                expectMatch(filter,    "/code/node_core/foo.js");
                expectMatch(filter,    "/code/node_foo.txt");
                expectNotMatch(filter,    "/code/Xnode_foo.txt");

                filter = FileFilters.compile("/node_*");
                expectNotMatch(filter, "/code/Xnode_foo.txt");

                filter = FileFilters.compile("**/*/**");  // remember there's an implied ** on either side of this
                expectMatch(filter,    "/aaa/bbb/ccc");
                expectMatch(filter,    "/aaa/");
                expectMatch(filter,    "/aaa/bbb/file.txt");
                expectMatch(filter,    "/aaa/file.txt");
                expectNotMatch(filter, "/file.txt");

                filter = FileFilters.compile("**/aaa/*/ccc/**");
                expectMatch(filter,    "/aaa/bbb/ccc/");
                expectMatch(filter,    "/aaa/bbb/ccc/file.txt");
                expectMatch(filter,    "/X/aaa/bbb/ccc/");
                expectNotMatch(filter, "/aaa/ccc/");
                expectNotMatch(filter, "/aaa/bbb/xxx/ccc/");
                expectNotMatch(filter, "/X/aaa/bbb/xxx/ccc/");
                expectNotMatch(filter, "/aaa/bbb/aaa/ccc/");
                expectMatch(filter,    "/aaa/aaa/bbb/ccc/");

                filter = FileFilters.compile("./aaa*/bbb/**");
                expectMatch(filter,    "/aaa/bbb/file.txt");
                expectMatch(filter,    "/aaaXYZ/bbb/");
                expectMatch(filter,    "/aaaXYZ/bbb/file.txt");
                expectNotMatch(filter, "/aaa/xxx/bbb/");
                expectNotMatch(filter, "/Xaaa/bbb/");
                expectNotMatch(filter, "/aaa/bbbX/");

                // Multiple wildcards
                filter = FileFilters.compile("**/thirdparty/*/jquery*.js");
                expectNotMatch(filter, "/thirdparty/jquery.js");
                expectNotMatch(filter, "/thirdparty/jquery-1.7.js");
                expectNotMatch(filter, "/thirdparty/jquery-2.1.0.min.js");
                expectMatch(filter,    "/thirdparty/foo/jquery.js");
                expectMatch(filter,    "/thirdparty/foo/jquery-1.7.js");
                expectMatch(filter,    "/thirdparty/foo/jquery-2.1.0.min.js");
                expectNotMatch(filter, "/thirdparty/foo/bar/jquery.js");
                expectNotMatch(filter, "/thirdparty/foo/bar/jquery-1.7.js");
                expectNotMatch(filter, "/thirdparty/foo/bar/jquery-2.1.0.min.js");
                expectNotMatch(filter, "/foo/jquery-2.1.0.min.js");
                expectNotMatch(filter, "/thirdparty/jquery-1.7.map");
                expectNotMatch(filter, "/thirdparty/jquery-1.7.js.md");
                expectNotMatch(filter, "/thirdparty/jquery-docs.js/foo.js");
            });

            it("should match ** across path segments", function () {

                let filter = FileFilters.compile("thirdparty/**/jquery*.js");
                expectMatch(filter,    "/thirdparty/jquery.js");
                expectMatch(filter,    "/thirdparty/jquery-1.7.js");
                expectMatch(filter,    "/thirdparty/jquery-2.1.0.min.js");
                expectMatch(filter,    "/thirdparty/foo/jquery.js");
                expectMatch(filter,    "/thirdparty/foo/jquery-1.7.js");
                expectMatch(filter,    "/thirdparty/foo/jquery-2.1.0.min.js");
                expectMatch(filter,    "/thirdparty/foo/bar/jquery.js");
                expectMatch(filter,    "/thirdparty/foo/bar/jquery-1.7.js");
                expectMatch(filter,    "/thirdparty/foo/bar/jquery-2.1.0.min.js");
                expectNotMatch(filter, "/foo/jquery-2.1.0.min.js");
                expectNotMatch(filter, "/thirdparty/jquery-1.7.map");
                expectNotMatch(filter, "/thirdparty/jquery-1.7.js.md");
                expectNotMatch(filter, "/thirdparty/jquery-docs.js/foo.js");
            });

            it("should match ? against single non-slash char", function () {
                let filter = FileFilters.compile("**/a?c");
                expectNotMatch(filter, "/ac");
                expectMatch(filter,    "/abc");
                expectNotMatch(filter, "/Xac");
                expectNotMatch(filter, "/acX");
                expectNotMatch(filter, "/abbc");
                expectNotMatch(filter, "/a123c");
                expectNotMatch(filter, "/ac/");
                expectNotMatch(filter, "/Xac/");

                filter = FileFilters.compile("**/jquery-1.?.js");
                expectMatch(filter,    "/foo/jquery-1.6.js");
                expectNotMatch(filter, "/foo/jquery-1.6.1.js");

                filter = FileFilters.compile("**/jquery-?.?.js");
                expectMatch(filter,    "/foo/jquery-1.6.js");
                expectMatch(filter,    "/foo/jquery-2.0.js");
                expectNotMatch(filter, "/foo/jquery-1.6.1.js");

                filter = FileFilters.compile("**/jquery-1.??.js");
                expectNotMatch(filter, "/foo/jquery-1.6.js");
                expectMatch(filter,    "/foo/jquery-1.10.js");
                expectNotMatch(filter, "/foo/jquery-1.6.1.js");
                expectNotMatch(filter, "/foo/jquery-1./a.js");

                filter = FileFilters.compile("**/jquery-1.?*.js");  // this is essentially a way of saying '1 or more chars', like regexp + quantifier
                expectMatch(filter,    "/foo/jquery-1.6.js");
                expectMatch(filter,    "/foo/jquery-1.10.js");
                expectMatch(filter,    "/foo/jquery-1.6.1.js");
                expectMatch(filter,    "/foo/jquery-1.6-min.js");
                expectNotMatch(filter, "/foo/jquery-1.6/a.js");
            });
        });

        describe("Automatic glob prefixes/suffixes", function () {

            it("should *.js match **/*.js", function () {
                let filter = FileFilters.compile("*.js");
                expectMatch(filter,    "/foo/jquery-1.6-min.js");
                expectMatch(filter,    "jquery-1.6-min.js");
            });

            it("should not ./*.js match **/*.js", function () {
                let filter = FileFilters.compile("./*.js");
                expectNotMatch(filter,    "/foo/jquery-1.6-min.js");
                expectMatch(filter,    "jquery-1.6-min.js");
            });

            it("should ?.js match **/?.js", function () {
                let filter = FileFilters.compile("?.js");
                expectMatch(filter,    "/foo/j.js");
                expectMatch(filter,    "j.js");
                expectNotMatch(filter,    "/foo/jq.js");
                expectNotMatch(filter,    "jq.js");
            });

            it("should not ./?.js match **/?.js", function () {
                let filter = FileFilters.compile("./?.js");
                expectNotMatch(filter,    "/foo/j.js");
                expectMatch(filter,    "j.js");
                expectNotMatch(filter,    "/foo/jq.js");
                expectNotMatch(filter,    "jq.js");
            });
        });
    });
});
