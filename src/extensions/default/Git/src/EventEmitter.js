define(function (require, exports, module) {
    const EventDispatcher = brackets.getModule("utils/EventDispatcher");

    const emInstance = {};
    EventDispatcher.makeEventDispatcher(emInstance);

    function getEmitter(eventName) {
        if (!eventName) {
            throw new Error("no event has been passed to get the emittor!");
        }
        return function () {
            emit(eventName, ...arguments);
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
