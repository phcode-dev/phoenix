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

    function emit() {
        emInstance.trigger(...arguments);
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
