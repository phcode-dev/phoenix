import { setTimeout as delay } from "node:timers/promises";

/**
 * Observe an existing request without acquiring ownership or keeping its agent connected.
 * @param {Object} options Poll URL, deadline, cancellation signal and optional once-only grant callback.
 * @return {Promise<Object>} Granted or terminal request status, including the latest source note.
 */
export async function waitForReservation({ url, timeoutMs = 3600000, signal, onGranted = async () => {},
    initialDelayMs = 1000, maxDelayMs = 5000 }) {
    const target = new URL(url);
    if (target.protocol !== "http:" || target.hostname !== "localhost"
        || !target.pathname.startsWith("/reservations/requests/")) {
        throw new Error("Expected the loopback pollUrl returned by reserve_machine");
    }
    const end = Date.now() + timeoutMs;
    let interval = initialDelayMs;
    while (Date.now() < end) {
        if (signal && signal.aborted) { throw signal.reason || new Error("Monitor cancelled"); }
        let result;
        try {
            const timeout = AbortSignal.timeout(Math.max(1, Math.min(5000, end - Date.now())));
            const response = await fetch(target, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
            if (response.ok || response.status === 404) { result = await response.json(); }
        } catch (error) {
            if (signal && signal.aborted) { throw error; }
            // Hub unavailability is not a grant; retry within the caller's deadline.
        }
        if (result && result.status === "granted") {
            await onGranted(result);
            return result;
        }
        if (result && ["cancelled", "released", "disconnected", "not_found"].includes(result.status)) { return result; }
        await delay(Math.max(1, Math.min(interval, end - Date.now())), undefined, { signal });
        interval = Math.min(maxDelayMs, interval * 1.5);
    }
    throw new Error("Reservation monitor timed out; the queued request was not cancelled");
}
