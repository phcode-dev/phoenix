export const DEFAULT_WS_PORT = 38571;

export function parseWebSocketPort(value) {
    if (value === undefined || value === null || String(value).trim() === "") {
        return DEFAULT_WS_PORT;
    }

    const text = String(value).trim();
    if (!/^\d+$/.test(text)) {
        throw new Error(
            `PHOENIX_MCP_WS_PORT must be an integer between 1 and 65535; received "${text}"`
        );
    }

    const port = Number(text);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
        throw new Error(
            `PHOENIX_MCP_WS_PORT must be an integer between 1 and 65535; received "${text}"`
        );
    }

    return port;
}
