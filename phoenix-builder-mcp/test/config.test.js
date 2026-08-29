import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_WS_PORT, parseWebSocketPort } from "../config.js";

test("parseWebSocketPort uses the default for an unset value", () => {
    assert.equal(parseWebSocketPort(), DEFAULT_WS_PORT);
    assert.equal(parseWebSocketPort(""), DEFAULT_WS_PORT);
});

test("parseWebSocketPort accepts a complete valid integer", () => {
    assert.equal(parseWebSocketPort("38572"), 38572);
    assert.equal(parseWebSocketPort(" 38573 "), 38573);
});

test("parseWebSocketPort rejects partial or out-of-range values", () => {
    for (const value of ["38572extra", "0", "-1", "65536", "not-a-port"]) {
        assert.throws(
            () => parseWebSocketPort(value),
            /must be an integer between 1 and 65535/
        );
    }
});
