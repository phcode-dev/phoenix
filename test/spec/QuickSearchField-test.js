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

/*global jasmine, describe, it, expect, beforeEach, afterEach, awaitsFor */

define(function (require, exports, module) {


    var QuickSearchField    = require("search/QuickSearchField").QuickSearchField,
        KeyEvent            = require("utils/KeyEvent"),
        SpecRunnerUtils     = require("spec/SpecRunnerUtils");

    describe("QuickSearchField", function () {
        var $mockInput,
            searchField,
            provider,
            mockResults,
            onCommit;

        beforeEach(function () {
            $mockInput = $("<input>");
            SpecRunnerUtils.createMockElement().append($mockInput);

            // Create a QuickSearchField that proxies to these function references, which each
            // testcase can set to whatever mock implementation is needed
            provider = null;
            onCommit = null;

            var options = {
                formatter: function (item) { return "<li>" + item + "</li>"; },
                resultProvider: function (query) { return provider(query); },
                onCommit: function (item, query) { return onCommit(item, query); },
                onHighlight: jasmine.createSpy(),
                firstHighlightIndex: 0
            };
            searchField = new QuickSearchField($mockInput, options);

            // Many tests start from this results template, but they can modify it to customize
            mockResults = {
                "f": ["one", "two", "three", "four"],
                "foo": ["one", "two", "three"],
                "foobar": ["three"],
                "bar": ["five"]
            };
            mockResults.fo = mockResults.f;
            mockResults.foob = mockResults.foo;
            mockResults.fooba = mockResults.foo;
        });

        afterEach(function () {
            searchField.destroy();
            $mockInput.parent().remove();
        });


        /** Sets provider to a function that synchronously returns results from mockResults */
        function makeSyncProvider() {
            provider = jasmine.createSpy().and.callFake(function (query) {
                return mockResults[query || "<blank>"];
            });
        }

        /**
         * Sets provider to a function that returns Promises, and can be triggered to resolve them later with
         * results from mockResults, by calling finishAsync().
         */
        function makeAsyncProvider() {
            provider = jasmine.createSpy().and.callFake(function (query) {
                var promise = new $.Deferred();
                provider.futures.push(function () {
                    promise.resolve(mockResults[query || "<blank>"]);
                });
                return promise;
            });
            provider.futures = [];
        }

        /** Resolve the Nth call to the async provider now (1st call is index 0) */
        function finishAsync(i) {
            provider.futures[i]();
        }


        function enterSearchText(str) {
            $mockInput.val(str);
            $mockInput.trigger("input");
        }

        function pressEnter() {
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keydown", $mockInput[0]);
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keypress", $mockInput[0]);
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_RETURN, "keyup", $mockInput[0]);
        }

        function pressDownArow() {
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keydown", $mockInput[0]);
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keypress", $mockInput[0]);
            SpecRunnerUtils.simulateKeyEvent(KeyEvent.DOM_VK_DOWN, "keyup", $mockInput[0]);
        }

        function expectListContents(list) {
            var $items = $(".quick-search-container li");
            expect($items.length).toBe(list.length);

            $items.each(function (i, item) {
                expect($(item).text()).toBe(list[i]);
            });
        }


        it("updates list on setText()", async function () {
            makeSyncProvider();

            enterSearchText("foo");
            await awaitsFor(function () { return provider.calls.count() === 1; });
            expect(provider).toHaveBeenCalledWith("foo");
            expectListContents(mockResults.foo);

            searchField.setText("bar");
            await awaitsFor(function () { return provider.calls.count() === 2; });
            expect(provider).toHaveBeenCalledWith("bar");
            expectListContents(mockResults.bar);
        });

        it("selects first item on Enter key", async function () {
            makeSyncProvider();

            enterSearchText("foo");
            await awaitsFor(function () { return provider.calls.count() === 1; });
            onCommit = jasmine.createSpy();

            pressEnter();
            await awaitsFor(function () { return onCommit.calls.count() === 1; });
            expect(onCommit).toHaveBeenCalledWith("one", "foo");
            expect(provider.calls.count()).toBe(1);  // shouldn't need to query provider a 2nd time
        });

        it("highlights correcct item in list", async function () {
            makeSyncProvider();
            mockResults["<blank>"] = mockResults.f;

            searchField.updateResults();

            expect(provider.calls.count()).toEqual(1);
            expect(searchField.options.onHighlight.calls.count()).toEqual(1);
            expect(searchField.options.onHighlight).toHaveBeenCalledWith("one", "", false);

            pressDownArow();

            expect(provider.calls.count()).toEqual(1);
            expect(searchField.options.onHighlight.calls.count()).toEqual(2);
            expect(searchField.options.onHighlight).toHaveBeenCalledWith("two", "", true);

            provider.calls.reset();
            searchField.options.onHighlight.calls.reset();
            enterSearchText("foo");
            await awaitsFor(function () { return provider.calls.count() === 1; });
            expect(searchField.options.onHighlight.calls.count()).toEqual(1);
            expect(searchField.options.onHighlight).toHaveBeenCalledWith("two", "foo", false);
        });

        it("re-queries provider when updateResults() called", async function () {
            makeSyncProvider();

            mockResults.changeable = ["a", "b", "c"];

            enterSearchText("changeable");
            await awaitsFor(function () { return provider.calls.count() === 1; });
            expect(provider).toHaveBeenCalledWith("changeable");
            expectListContents(mockResults.changeable);

            mockResults.changeable = ["x", "y", "z"];

            searchField.updateResults();
            await awaitsFor(function () { return provider.calls.count() === 2; });
            expect(provider).toHaveBeenCalledWith("changeable");
            expectListContents(mockResults.changeable);
        });

        it("throttles updates when provider slow to respond", async function () {
            makeSyncProvider();

            enterSearchText("f");
            await awaitsFor(function () { return provider.calls.count() === 1; });
            expect(provider).toHaveBeenCalledWith("f");
            expectListContents(mockResults.f);

            // This is *roughly* what happens when typing outpaces JS event servicing:
            // a string of key events arrive before any setTimeouts() set from the first
            // one will get to run
            enterSearchText("fo");
            enterSearchText("foo");
            enterSearchText("foob");
            enterSearchText("fooba");
            enterSearchText("foobar");

            await awaitsFor(function () { return provider.calls.count() > 1; });
            // The 2nd provider call skips all the intermediate fo, foo, foob, etc. states and
            // goes straight to "foobar"
            expect(provider.calls.count()).toBe(2);
            expect(provider).toHaveBeenCalledWith("foobar");
            expectListContents(mockResults.foobar);
        });

        it("updates list when async provider finally responds", async function () {
            makeAsyncProvider();

            enterSearchText("foo");
            await awaitsFor(function () { return provider.calls.count() === 1; });
            expect(provider).toHaveBeenCalledWith("foo");
            expectListContents([]);  // no results yet

            finishAsync(0);
            expectListContents(mockResults.foo);
            expect(provider.calls.count()).toBe(1);  // shouldn't query provider any extra times
        });

        it("shows latest list even when async provider responds out of order", async function () {
            makeAsyncProvider();

            enterSearchText("foo");
            await awaitsFor(function () { return provider.calls.count() === 1; });
            expect(provider).toHaveBeenCalledWith("foo");
            expectListContents([]);

            enterSearchText("bar");
            await awaitsFor(function () { return provider.calls.count() === 2; });
            expect(provider).toHaveBeenCalledWith("bar");
            expectListContents([]);

            finishAsync(1);  // respond to latest query ("bar") first
            finishAsync(0);  // respond to older query ("foo") second

            expectListContents(mockResults.bar);
            expect(provider.calls.count()).toBe(2);  // shouldn't query provider any extra times
        });

        // This was bug #1855 in the original smart-autocomplete QuickOpen implementation
        it("commits correct item when enter pressed before async provider updates", async function () {
            makeAsyncProvider();

            enterSearchText("foo");
            await awaitsFor(function () { return provider.calls.count() === 1; });
            expect(provider).toHaveBeenCalledWith("foo");

            finishAsync(0);
            expectListContents(mockResults.foo);

            enterSearchText("foobar");
            await awaitsFor(function () { return provider.calls.count() === 2; });
            expectListContents(mockResults.foo);  // still showing "foo" result since 2nd promise not resolved yet

            onCommit = jasmine.createSpy();
            pressEnter();

            expect(onCommit).not.toHaveBeenCalled();

            finishAsync(1);
            expect(onCommit).toHaveBeenCalledWith("three", "foobar");
        });

    });
});
