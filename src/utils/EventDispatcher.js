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

// @INCLUDE_IN_API_DOCS

/**
 * Implements a jQuery-like event dispatch pattern for non-DOM objects (works in web workers as well):
 *  - Listeners are attached via on()/one() & detached via off()
 *  - Listeners can use namespaces for easy removal
 *  - Listeners can attach to multiple events at once via a space-separated list
 *  - Events are fired via trigger()
 *  - The same listener can be attached twice, and will be called twice; but off() will detach all
 *    duplicate copies at once ('duplicate' means '===' equality - see http://jsfiddle.net/bf4p29g5/1/)
 *
 * But it has some important differences from jQuery's non-DOM event mechanism:
 *  - More robust to listeners that throw exceptions (other listeners will still be called, and
 *    trigger() will still return control to its caller).
 *  - Events can be marked deprecated, causing on() to issue warnings
 *  - Easier to debug, since the dispatch code is much simpler
 *  - Faster, for the same reason
 *  - Uses less memory, since $(nonDOMObj).on() leaks memory in jQuery
 *  - API is simplified:
 *      - Event handlers do not have 'this' set to the event dispatcher object
 *      - Event object passed to handlers only has 'type' and 'target' fields
 *      - trigger() uses a simpler argument-list signature (like Promise APIs), rather than requiring
 *        an Array arg and ignoring additional args
 *      - trigger() does not support namespaces
 *      - For simplicity, on() does not accept a map of multiple events -> multiple handlers, nor a
 *        missing arg standing in for a bare 'return false' handler.
 *
 * For now, Brackets uses a jQuery patch to ensure $(obj).on() and obj.on() (etc.) are identical
 * for any obj that has the EventDispatcher pattern. In the future, this may be deprecated.
 *
 * To add EventDispatcher methods to any object, call EventDispatcher.makeEventDispatcher(obj).
 *
 * ## Usage
 * ### Importing from an extension
 * ```js
 * const EventDispatcher = brackets.getModule("utils/EventDispatcher");
 * ```
 * ### Using the global object
 * The EventDispatcher Object is available within the global context, be it phoenix or phoenix core web workers.
 * ```js
 * window.EventDispatcher.trigger("someEvent"); // within phoenix
 * self.EventDispatcher.trigger("someEvent"); // within web worker
 * ```
 *
 * If you wish to import event dispatcher to your custom web worker, use the following
 * ```js
 * importScripts('<relative path from your extension>/utils/EventDispatcher');
 * // this will add the global EventDispatcher to your web-worker. Note that the EventDispatcher in the web worker
 * // is a separate domain and cannot raise or listen to events in phoenix/other workers
 * self.EventDispatcher.trigger("someEvent"); // within web worker
 * ```
 * ### Sample Usage within extension
 * ```js
 * // in your extension js file.
 * define(function (require, exports, module) {
 *     const EventDispatcher     = brackets.getModule("utils/EventDispatcher");
 *     EventDispatcher.makeEventDispatcher(exports); // This extension triggers some events
 *     let eventHandler = function (event, paramObject, paramVal) {
 *         console.log(event, paramObject, paramVal);
 *     };
 *     exports.on("sampleEvent", eventHandler); // listen to our own event for demo
 *     exports.trigger("sampleEvent", { // trigger a sample event. This will activate the above listener 'on' function.
 *             param: 1,
 *             param2: "sample"
 *     }, "value");
 *     // If needed, the event listener can be removed with `off`. But it is not a requirement at shutdown.
 *     exports.off("sampleEvent", eventHandler);
 * }
 * ```
 *
 * @module utils/EventDispatcher
 */


(function () {

    let globalObject = {};
    if(typeof window !== 'undefined'){
        globalObject = window; // browser
    } else if(typeof self !== 'undefined'){
        globalObject = self; // web worker
    } else if(typeof global !== 'undefined'){
        globalObject = global; //nodejs
    }

    if(globalObject.EventDispatcher){
        // already created
        return;
    }

    let LEAK_WARNING_THRESHOLD = 15,
        eventSpecificThreshold = {};


    /**
     * Split "event.namespace" string into its two parts; both parts are optional.
     * @param {string} eventName Event name and/or trailing ".namespace"
     * @return {!{event:string, ns:string}} Uses "" for missing parts.
     * @type {function}
     */
    function splitNs(eventStr) {
        var dot = eventStr.indexOf(".");
        if (dot === -1) {
            return { eventName: eventStr };
        }
        return { eventName: eventStr.substring(0, dot), ns: eventStr.substring(dot) };

    }

    /**
     * By default, we consider any events having more than 15 listeners to be leaky. But sometimes there may be
     * genuine use cases where an event can have a large number of listeners. For those events, it is recommended
     * to increase the leaky warning threshold individually with this API.
     * @param {string} eventName
     * @param {number} threshold - The new threshold to set. Will only be set if the new threshold is greater than
     * the current threshold.
     * @type {function}
     */
    function setLeakThresholdForEvent(eventName, threshold) {
        let currentThreshold = eventSpecificThreshold[eventName] || LEAK_WARNING_THRESHOLD;
        if(threshold > currentThreshold){
            eventSpecificThreshold[eventName] = threshold;
        }
    }


    // These functions are added as mixins to any object by makeEventDispatcher()

    /**
     * Adds the given handler function to 'events': a space-separated list of one or more event names, each
     * with an optional ".namespace" (used by off() - see below). If the handler is already listening to this
     * event, a duplicate copy is added.
     * @param {string} events
     * @param {!function(!{type:string, target:!Object}, ...)} fn
     * @type {function}
     */
    var on = function (events, fn) {
        var eventsList = events.split(/\s+/).map(splitNs),
            i;

        if (!fn) {
            throw new Error("EventListener.on() called with no listener fn for event '" + events + "'");
        }

        // Check for deprecation warnings
        if (this._deprecatedEvents) {
            for (i = 0; i < eventsList.length; i++) {
                var deprecation = this._deprecatedEvents[eventsList[i].eventName];
                if (deprecation) {
                    var message = "Registering for deprecated event '" + eventsList[i].eventName + "'.";
                    if (typeof deprecation === "string") {
                        message += " Instead, use " + deprecation + ".";
                    }
                    console.warn(message, new Error().stack);
                }
            }
        }

        // Attach listener for each event clause
        for (i = 0; i < eventsList.length; i++) {
            var eventName = eventsList[i].eventName;
            if (!this._eventHandlers) {
                this._eventHandlers = {};
            }
            if (!this._eventHandlers[eventName]) {
                this._eventHandlers[eventName] = [];
            }
            eventsList[i].handler = fn;
            this._eventHandlers[eventName].push(eventsList[i]);

            // Check for suspicious number of listeners being added to one object-event pair
            let leakThreshold = eventSpecificThreshold[eventName] || LEAK_WARNING_THRESHOLD;
            if (this._eventHandlers[eventName].length > leakThreshold) {
                console.error("Possible memory leak: " +
                    this._eventHandlers[eventName].length + " '" + eventName + "' listeners attached to", this);
            }
        }

        return this;  // for chaining
    };

    /**
     * Removes one or more handler functions based on the space-separated 'events' list. Each item in
     * 'events' can be: bare event name, bare .namespace, or event.namespace pair. This yields a set of
     * matching handlers. If 'fn' is omitted, all these handlers are removed. If 'fn' is provided,
     * only handlers exactly equal to 'fn' are removed (there may still be >1, if duplicates were added).
     * @param {string} events
     * @param {?function(!{type:string, target:!Object}, ...)} fn
     * @type {function}
     */
    var off = function (events, fn) {
        if (!this._eventHandlers) {
            return this;
        }

        var eventsList = events.split(/\s+/).map(splitNs),
            i;

        var removeAllMatches = function (eventRec, eventName) {
            var handlerList = this._eventHandlers[eventName],
                k;
            if (!handlerList) {
                return;
            }

            // Walk backwards so it's easy to remove items
            for (k = handlerList.length - 1; k >= 0; k--) {
                // Look at ns & fn only - doRemove() has already taken care of eventName
                if (!eventRec.ns || eventRec.ns === handlerList[k].ns) {
                    var handler = handlerList[k].handler;
                    if (!fn || fn === handler || fn._eventOnceWrapper === handler) {
                        handlerList.splice(k, 1);
                    }
                }
            }
            if (!handlerList.length) {
                delete this._eventHandlers[eventName];
            }
        }.bind(this);

        var doRemove = function (eventRec) {
            if (eventRec.eventName) {
                // If arg calls out an event name, look at that handler list only
                removeAllMatches(eventRec, eventRec.eventName);
            } else {
                // If arg only gives a namespace, look at handler lists for all events
                for (let eventName in this._eventHandlers) {
                    removeAllMatches(eventRec, eventName);
                }
            }
        }.bind(this);

        // Detach listener for each event clause
        // Each clause may be: bare eventname, bare .namespace, full eventname.namespace
        for (i = 0; i < eventsList.length; i++) {
            doRemove(eventsList[i]);
        }

        return this;  // for chaining
    };

    /**
     * Attaches a handler so it's only called once (per event in the 'events' list).
     * @param {string} events
     * @param {?function(!{type:string, target:!Object}, ...)} fn
     * @type {function}
     */
    var one = function (events, fn) {
        // Wrap fn in a self-detaching handler; saved on the original fn so off() can detect it later
        if (!fn._eventOnceWrapper) {
            fn._eventOnceWrapper = function (event) {
                // Note: this wrapper is reused for all attachments of the same fn, so it shouldn't reference
                // anything from the outer closure other than 'fn'
                event.target.off(event.type, fn._eventOnceWrapper);
                fn.apply(this, arguments);
            };
        }
        return this.on(events, fn._eventOnceWrapper);
    };

    /**
     * Invokes all handlers for the given event (in the order they were added).
     * @param {string} eventName
     * @param {*} ... Any additional args are passed to the event handler after the event object
     * @type {function}
     */
    var trigger = function (eventName) {
        var event = { type: eventName, target: this },
            handlerList = this._eventHandlers && this._eventHandlers[eventName],
            i;

        if (!handlerList) {
            return;
        }

        // Use a clone of the list in case handlers call on()/off() while we're still in the loop
        handlerList = handlerList.slice();

        // Pass 'event' object followed by any additional args trigger() was given
        var applyArgs = Array.prototype.slice.call(arguments, 1);
        applyArgs.unshift(event);

        for (i = 0; i < handlerList.length; i++) {
            try {
                // Call one handler
                handlerList[i].handler.apply(null, applyArgs);
            } catch (err) {
                console.error("Exception in '" + eventName + "' listener on", this, String(err), err.stack);
            }
        }
    };


    /**
     * Adds the EventDispatcher APIs to the given object: on(), one(), off(), and trigger(). May also be
     * called on a prototype object - each instance will still behave independently.
     * @param {!Object} obj Object to add event-dispatch methods to
     * @type {function}
     */
    function makeEventDispatcher(obj) {
        obj.on = on;
        obj.off= off;
        obj.one= one;
        obj.trigger= trigger;
        obj._EventDispatcher= true;
        // Later, on() may add _eventHandlers: Object.<string, Array.<{event:string, namespace:?string,
        //   handler:!function(!{type:string, target:!Object}, ...)}>> - map from eventName to an array
        //   of handler records
        // Later, markDeprecated() may add _deprecatedEvents: Object.<string, string|boolean> - map from
        //   eventName to deprecation warning info
    }

    /**
     * Utility for calling on() with an array of arguments to pass to event handlers (rather than a varargs
     * list). makeEventDispatcher() must have previously been called on 'dispatcher'.
     * @param {!Object} dispatcher
     * @param {string} eventName
     * @param {!Array.<*>} argsArray
     * @type {function}
     */
    function triggerWithArray(dispatcher, eventName, argsArray) {
        var triggerArgs = [eventName].concat(argsArray);
        dispatcher.trigger.apply(dispatcher, triggerArgs);
    }

    /**
     * Utility for attaching an event handler to an object that has not YET had makeEventDispatcher() called
     * on it, but will in the future. Once 'futureDispatcher' becomes a real event dispatcher, any handlers
     * attached here will be retained.
     *
     * Useful with core modules that have circular dependencies (one module initially gets an empty copy of the
     * other, with no on() API present yet). Unlike other strategies like waiting for htmlReady(), this helper
     * guarantees you won't miss any future events, regardless of how soon the other module finishes init and
     * starts calling trigger().
     *
     * @param {!Object} futureDispatcher
     * @param {string} events
     * @param {?function(!{type:string, target:!Object}, ...)} fn
     * @type {function}
     */
    function on_duringInit(futureDispatcher, events, fn) {
        on.call(futureDispatcher, events, fn);
    }

    /**
     * Mark a given event name as deprecated, such that on() will emit warnings when called with it.
     * May be called before makeEventDispatcher(). May be called on a prototype where makeEventDispatcher()
     * is called separately per instance (i.e. in the constructor). Should be called before clients have
     * a chance to start calling on().
     * @param {!Object} obj Event dispatcher object
     * @param {string} eventName Name of deprecated event
     * @param {string=} insteadStr Suggested thing to use instead
     * @type {function}
     */
    function markDeprecated(obj, eventName, insteadStr) {
        // Mark event as deprecated - on() will emit warnings when called with this event
        if (!obj._deprecatedEvents) {
            obj._deprecatedEvents = {};
        }
        obj._deprecatedEvents[eventName] = insteadStr || true;
    }


    globalObject.EventDispatcher = {
        makeEventDispatcher,
        triggerWithArray,
        on_duringInit,
        markDeprecated,
        setLeakThresholdForEvent
    };

    if(globalObject.define){
        // for requirejs support
        define(function (require, exports, module) {
            exports.makeEventDispatcher = globalObject.EventDispatcher.makeEventDispatcher;
            exports.triggerWithArray    = globalObject.EventDispatcher.triggerWithArray;
            exports.on_duringInit       = globalObject.EventDispatcher.on_duringInit;
            exports.markDeprecated      = globalObject.EventDispatcher.markDeprecated;
            exports.setLeakThresholdForEvent = globalObject.EventDispatcher.setLeakThresholdForEvent;
        });
    }
}());

