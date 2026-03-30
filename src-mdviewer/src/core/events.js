import mitt from "mitt";

/** @type {import('mitt').Emitter} */
const bus = mitt();

export function emit(event, data) {
  bus.emit(event, data);
}

export function on(event, handler) {
  bus.on(event, handler);
}

export function off(event, handler) {
  bus.off(event, handler);
}

export default bus;
