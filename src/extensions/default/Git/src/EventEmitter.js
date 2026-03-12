define(function (require, exports, module) {
    const EventDispatcher = brackets.getModule("utils/EventDispatcher"),
        Metrics = brackets.getModule("utils/Metrics");

    const emInstance = {};
    EventDispatcher.makeEventDispatcher(emInstance);

    function getEmitter(eventName, optionalMetricToLog) {
        if (!eventName) {
            throw new Error("no event has been passed to get the emittor!");
        }
        return function () {
            emit(eventName, ...arguments);
            if(optionalMetricToLog) {
                Metrics.countEvent(Metrics.EVENT_TYPE.GIT, optionalMetricToLog[0], optionalMetricToLog[1]);
            }
        };
    }

    // Guard against re-entrant event emissions. If a handler for event X synchronously
    // emits event X again (directly or via a chain), it causes infinite recursion and a
    // "Maximum call stack size exceeded" crash. This set tracks which events are currently
    // being dispatched so we can block re-entrant calls.
    const _activeEvents = new Set();

    function emit() {
        const eventName = arguments[0];
        if (_activeEvents.has(eventName)) {
            console.warn("EventEmitter: Blocked re-entrant emit for event: " + eventName);
            return;
        }
        _activeEvents.add(eventName);
        try {
            emInstance.trigger(...arguments);
        } finally {
            _activeEvents.delete(eventName);
        }
    }

    function on(eventName, callback) {
        emInstance.on(eventName, (...args)=>{
            // Extract everything except the first argument (_event) which is event data we don't use
            const [, ...rest] = args;
            callback(...rest);
        });
    }

    function one(eventName, callback) {
        emInstance.one(eventName, (...args)=>{
            // Extract everything except the first argument (_event) which is event data we don't use
            const [, ...rest] = args;
            callback(...rest);
        });
    }

    exports.getEmitter = getEmitter;
    exports.emit = emit;
    exports.on = on;
    exports.one = one;
});
