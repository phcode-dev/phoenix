/*
 * GNU AGPL-3.0 License
 *
 * Modified Work Copyright (c) 2021 - present core.ai . All rights reserved.
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

/*global jasmine, describe, beforeEach, it, expect, spyOn */

define(function (require, exports, module) {


    var EventDispatcher = require("utils/EventDispatcher");

    describe("EventDispatcher", function () {
        var dispatcher,
            fn1,
            fn2,
            fn3,
            fn4;

        beforeEach(function () {
            dispatcher = {};
            EventDispatcher.makeEventDispatcher(dispatcher);

            fn1 = jasmine.createSpy();
            fn2 = jasmine.createSpy();
            fn3 = jasmine.createSpy();
            fn4 = jasmine.createSpy();
        });

        it("should dispatch when no handlers for any event", function () {
            dispatcher.trigger("foo");  // shouldn't throw
        });

        it("should dispatch when no handlers for this event", function () {
            dispatcher.on("bar", fn1);
            dispatcher.trigger("foo");  // shouldn't throw
        });

        it("should attach handlers that receive events", function () {
            dispatcher.on("foo", fn1).on("foo", fn2);
            dispatcher.trigger("foo");
            expect(fn1).toHaveBeenCalled();
            expect(fn2).toHaveBeenCalled();

            expect(fn1.mostRecentCall.args[0]).toEqual({ type: "foo", target: dispatcher });
        });

        it("should receive events with arguments", function () {
            dispatcher.on("foo", fn1).on("foo", fn2);
            dispatcher.trigger("foo", 42, "bar");
            expect(fn1).toHaveBeenCalledWith(jasmine.any(Object), 42, "bar");
            expect(fn2).toHaveBeenCalledWith(jasmine.any(Object), 42, "bar");
        });

        it("should separate handlers by event", function () {
            dispatcher.on("foo", fn1).on("bar", fn2);
            dispatcher.trigger("foo");
            expect(fn1).toHaveBeenCalled();
            expect(fn2).not.toHaveBeenCalled();

            fn1.reset();
            fn2.reset();
            dispatcher.trigger("bar");
            expect(fn1).not.toHaveBeenCalled();
            expect(fn2).toHaveBeenCalled();
        });

        it("should call handlers in the order added", function () {
            var order = 1;
            dispatcher.on("foo", function () { expect(order).toBe(1); order++; });
            dispatcher.on("foo", function () { expect(order).toBe(2); order++; });
            dispatcher.on("foo", function () { expect(order).toBe(3); order++; });
            dispatcher.on("foo", function () { expect(order).toBe(4); order++; });
            dispatcher.trigger("foo");
        });


        it("should detach handlers by function", function () {
            dispatcher.on("foo", fn1).on("foo", fn2).on("foo", fn3).on("foo", fn4);

            dispatcher.off("foo", fn2).off("foo", fn4);
            dispatcher.trigger("foo");
            expect(fn1).toHaveBeenCalled();
            expect(fn2).not.toHaveBeenCalled();
            expect(fn3).toHaveBeenCalled();
            expect(fn4).not.toHaveBeenCalled();
        });

        it("should detach handlers by event alone", function () {
            dispatcher.on("foo", fn1).on("bar", fn2);
            dispatcher.off("foo");

            dispatcher.trigger("foo");
            expect(fn1).not.toHaveBeenCalled();
            expect(fn2).not.toHaveBeenCalled();

            dispatcher.trigger("bar");
            expect(fn1).not.toHaveBeenCalled();
            expect(fn2).toHaveBeenCalled();
        });

        it("should detach handlers by namespace alone", function () {
            dispatcher.on("foo.1", fn1).on("foo.2", fn2).on("foo", fn3).on("bar.1", fn4);
            dispatcher.off(".1");

            dispatcher.trigger("foo");
            expect(fn1).not.toHaveBeenCalled();
            expect(fn2).toHaveBeenCalled();
            expect(fn3).toHaveBeenCalled();

            dispatcher.trigger("bar");
            expect(fn4).not.toHaveBeenCalled();
        });

        it("should detach handlers by event.namespace", function () {
            dispatcher.on("foo.1", fn1).on("foo.2", fn2).on("bar", fn3).on("bar.2", fn4);
            dispatcher.off("bar.2");

            dispatcher.trigger("foo");
            expect(fn1).toHaveBeenCalled();
            expect(fn2).toHaveBeenCalled();

            dispatcher.trigger("bar");
            expect(fn3).toHaveBeenCalled();
            expect(fn4).not.toHaveBeenCalled();
        });

        it("should detach by .namespace when no listeners present (and still chain)", function () {
            dispatcher.off(".1").on("foo.1", fn1);
            dispatcher.trigger("foo");
            expect(fn1).toHaveBeenCalled();
        });

        it("should no-op detach by event alone when no handlers for any event", function () {
            dispatcher.off("foo");  // shouldn't throw
        });

        it("should no-op detach by event alone when no handlers for this event", function () {
            dispatcher.on("foo", fn1);
            dispatcher.off("bar");  // shouldn't throw
        });

        it("should no-op detach by function when that function not attached", function () {
            dispatcher.on("foo", fn1);
            dispatcher.off("foo", fn2);  // shouldn't throw

            dispatcher.trigger("foo");
            expect(fn1).toHaveBeenCalled();
        });

        it("should no-op detach by namespace alone when that namespace not used", function () {
            dispatcher.on("foo.1", fn1);
            dispatcher.off(".2");  // shouldn't throw

            dispatcher.trigger("foo");
            expect(fn1).toHaveBeenCalled();
        });

        it("should no-op detach by event.namespace when that pairing not used", function () {
            dispatcher.on("foo.1", fn1);
            dispatcher.off("bar.1");  // shouldn't throw

            dispatcher.trigger("foo");
            expect(fn1).toHaveBeenCalled();

            fn1.reset();
            dispatcher.off("foo.4");  // shouldn't throw
            dispatcher.trigger("foo");
            expect(fn1).toHaveBeenCalled();
        });

        it("should dispatch when no handlers after removing handlers", function () {
            dispatcher.on("foo", fn1).on("foo", fn2);
            dispatcher.off("foo", fn1).off("foo", fn2);

            dispatcher.trigger("foo");  // shouldn't throw
        });


        it("should attach to multiple space-separated events", function () {
            dispatcher.on("foo bar", fn1);
            dispatcher.trigger("foo");
            expect(fn1).toHaveBeenCalled();

            fn1.reset();
            dispatcher.trigger("bar");
            expect(fn1).toHaveBeenCalled();
        });

        it("should attach to multiple space-separated events with namespaces", function () {
            dispatcher.on("foo.1 bar.2", fn1);
            dispatcher.trigger("foo");
            expect(fn1).toHaveBeenCalled();

            fn1.reset();
            dispatcher.trigger("bar");
            expect(fn1).toHaveBeenCalled();

            fn1.reset();
            dispatcher.off(".1");
            dispatcher.trigger("foo");
            expect(fn1).not.toHaveBeenCalled();
            dispatcher.trigger("bar");
            expect(fn1).toHaveBeenCalled();
        });

        it("should detach from multiple space-separated events", function () {
            dispatcher.on("foo", fn1).on("bar", fn1);
            dispatcher.off("foo bar", fn1);
            dispatcher.trigger("foo");
            dispatcher.trigger("bar");
            expect(fn1).not.toHaveBeenCalled();
        });

        it("should detach from multiple space-separated namespaces", function () {
            dispatcher.on("foo.1", fn1).on("bar.2", fn1);
            dispatcher.off(".1 .2", fn1);
            dispatcher.trigger("foo");
            dispatcher.trigger("bar");
            expect(fn1).not.toHaveBeenCalled();
        });

        it("should detach from multiple space-separated events with namespaces", function () {
            dispatcher.on("foo.1", fn1).on("bar.2", fn1);
            dispatcher.off("foo.1 bar.2", fn1);
            dispatcher.trigger("foo");
            dispatcher.trigger("bar");
            expect(fn1).not.toHaveBeenCalled();
        });


        it("handlers should be independent per-instance even when attached to prototype", function () {
            function SomeClass() {}
            EventDispatcher.makeEventDispatcher(SomeClass.prototype);

            var sc1 = new SomeClass();
            var sc2 = new SomeClass();
            sc1.on("foo", fn1);
            sc2.on("foo", fn2);

            sc1.trigger("foo");
            expect(fn1).toHaveBeenCalled();
            expect(fn2).not.toHaveBeenCalled();

            fn1.reset();
            fn2.reset();
            sc1.off("foo");
            sc2.trigger("foo");
            expect(fn1).not.toHaveBeenCalled();
            expect(fn2).toHaveBeenCalled();
        });


        it("attaching handler multiple times should call it multiple times", function () {
            dispatcher.on("foo", fn1).on("foo", fn1);
            dispatcher.trigger("foo");
            expect(fn1.callCount).toBe(2);
        });

        it("duplicate handlers should all be detached at once", function () {
            dispatcher.on("foo", fn1).on("foo", fn1);
            dispatcher.off("foo", fn1);
            dispatcher.trigger("foo");
            expect(fn1).not.toHaveBeenCalled();
        });

        it("namespaces let duplicate handlers be detached separately", function () {
            dispatcher.on("foo.1", fn1).on("foo.2", fn1);
            dispatcher.off("foo.1", fn1);
            dispatcher.trigger("foo");
            expect(fn1.callCount).toBe(1);
        });

        it("concurrent removals don't break trigger()", function () {
            dispatcher.on("foo", function () {
                dispatcher.off("foo", fn1).off("foo", fn2);
            });
            dispatcher.on("foo", fn1).on("foo", fn2);

            dispatcher.trigger("foo");
            expect(fn1).toHaveBeenCalled();
            expect(fn2).toHaveBeenCalled();

            fn1.reset();
            fn2.reset();
            dispatcher.trigger("foo");
            expect(fn1).not.toHaveBeenCalled();
            expect(fn2).not.toHaveBeenCalled();
        });

        it("concurrent additions don't break trigger()", function () {
            dispatcher.on("foo", function () {
                dispatcher.on("foo", fn3);
            });
            dispatcher.on("foo", fn1).on("foo", fn2);

            dispatcher.trigger("foo");
            expect(fn1).toHaveBeenCalled();
            expect(fn2).toHaveBeenCalled();
            expect(fn3).not.toHaveBeenCalled();

            fn1.reset();
            fn2.reset();
            fn3.reset();
            dispatcher.trigger("foo");
            expect(fn1).toHaveBeenCalled();
            expect(fn2).toHaveBeenCalled();
            expect(fn3).toHaveBeenCalled();
        });


        it("handlers attached with one() are only called once", function () {
            dispatcher.on("foo", fn1).one("foo", fn2).on("foo", fn3);
            dispatcher.trigger("foo");
            expect(fn1).toHaveBeenCalled();
            expect(fn2).toHaveBeenCalled();
            expect(fn3).toHaveBeenCalled();

            fn1.reset();
            fn2.reset();
            fn3.reset();
            dispatcher.trigger("foo");
            expect(fn1).toHaveBeenCalled();
            expect(fn2).not.toHaveBeenCalled();
            expect(fn3).toHaveBeenCalled();
        });

        it("one() is independent per event", function () {
            dispatcher.one("foo bar", fn1);

            dispatcher.trigger("foo");
            expect(fn1).toHaveBeenCalled();
            fn1.reset();
            dispatcher.trigger("foo");
            expect(fn1).not.toHaveBeenCalled();

            fn1.reset();
            dispatcher.trigger("bar");
            expect(fn1).toHaveBeenCalled();
            fn1.reset();
            dispatcher.trigger("bar");
            expect(fn1).not.toHaveBeenCalled();
        });

        it("one() is independent per dispatcher", function () {
            var dispatcher1 = {}, dispatcher2 = {};
            EventDispatcher.makeEventDispatcher(dispatcher1);
            EventDispatcher.makeEventDispatcher(dispatcher2);

            dispatcher1.one("foo", fn1);
            dispatcher2.one("foo", fn1);

            dispatcher1.trigger("foo");
            expect(fn1).toHaveBeenCalled();
            fn1.reset();
            dispatcher1.trigger("foo");
            expect(fn1).not.toHaveBeenCalled();

            fn1.reset();
            dispatcher2.trigger("foo");
            expect(fn1).toHaveBeenCalled();
            fn1.reset();
            dispatcher2.trigger("foo");
            expect(fn1).not.toHaveBeenCalled();
        });

        it("duplicate one() listeners both run and both detach first time", function () {
            dispatcher.one("foo", fn1).one("foo", fn1);

            dispatcher.trigger("foo");
            expect(fn1.callCount).toBe(2);
            dispatcher.trigger("foo");
            expect(fn1.callCount).toBe(2);
        });

        it("off() given a function should work with one()", function () {
            dispatcher.one("foo", fn1).one("foo", fn2);
            dispatcher.off("foo", fn1);
            dispatcher.trigger("foo");
            expect(fn1).not.toHaveBeenCalled();
            expect(fn2).toHaveBeenCalled();  // ensure other fn's one() wrappers remain unaffected
        });

        it("off() given a namespace should work with one()", function () {
            dispatcher.one("foo.1", fn1);
            dispatcher.off(".1");
            dispatcher.trigger("foo");
            expect(fn1).not.toHaveBeenCalled();
        });


        it("triggerWithArray() util accepts an array of event arguments", function () {
            dispatcher.on("foo", fn1);
            EventDispatcher.triggerWithArray(dispatcher, "foo", [42, "bar"]);
            expect(fn1).toHaveBeenCalledWith(jasmine.any(Object), 42, "bar");
        });

        it("on_duringInit() attaches listeners before makeEventDispatcher()", function () {
            dispatcher = {};
            EventDispatcher.on_duringInit(dispatcher, "foo", fn1);

            EventDispatcher.makeEventDispatcher(dispatcher);
            dispatcher.trigger("foo");
            expect(fn1).toHaveBeenCalled();

            fn1.reset();
            dispatcher.on("foo", fn2);  // add 2nd listener the normal way - shouldn't disrupt original listener
            dispatcher.trigger("foo");
            expect(fn1).toHaveBeenCalled();
            expect(fn2).toHaveBeenCalled();
        });


        it("on() should print warnings when too many listeners attached", function () {
            function makeStubListener() {  // avoids JSLint "don't make functions in a loop" complaint
                return function () {};
            }

            spyOn(console, "error");
            var i;
            for (i = 0; i < 15; i++) {
                dispatcher.on("foo", makeStubListener());
            }
            expect(console.error).not.toHaveBeenCalled();

            // Prints warnings when number of listeners exceeds 15
            dispatcher.on("foo", fn1);
            expect(console.error).toHaveBeenCalled();

            // ...but still attaches listener anyway
            dispatcher.trigger("foo");
            expect(fn1).toHaveBeenCalled();
        });
    });
});
