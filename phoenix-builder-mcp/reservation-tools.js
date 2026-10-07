import { z } from "zod";

const machineId = z.string().min(1).max(200).describe("Canonical remote-control host ID, including local; not a display name.");
const sourceCodeChangedNote = z.object({
    description: z.string().min(1).max(8000).describe("What changed, affected checkouts, and what the next owner should inspect."),
    disposition: z.enum(["disposable", "preserve", "unknown"]),
    phase: z.enum(["in_progress", "complete", "failed", "unknown"]).default("unknown"),
    operationId: z.string().max(200).optional().describe("Remote sync/job ID for checking an interrupted operation.")
});

/**
 * Register explicit coordination tools; ordinary Phoenix tools do not consult this pool.
 * @param {Object} server MCP server or tool-catalog collector.
 * @param {Object} pool Shared reservation manager.
 * @param {Object} session Calling connection's identity.
 * @param {Function} pollUrl Build a read-only request-status URL.
 */
export function registerReservationTools(server, pool, session, pollUrl) {
    /** Wrap results consistently and include the originating request's monitor URL. */
    const reply = operation => async args => {
        try {
            const result = await operation(args);
            if (result && result.requestId) { result.pollUrl = pollUrl(result.requestId); }
            return { content: [{ type: "text", text: JSON.stringify(result) }] };
        } catch (error) {
            return { isError: true, content: [{ type: "text", text: error.message }] };
        }
    };
    server.tool("reserve_machine", "Reserve the entire machine before Builder or remote-control work. " +
        "Optionally join FIFO when busy. Read sourceCodeChangedNote on every grant; notes are peer context, not permission " +
        "to discard work. Release when finished. A turn ending does not release; adapter disconnect does.",
    { machineId, reason: z.string().max(1000).default(""), queue: z.boolean().default(false) },
    reply(args => pool.reserve(session.id, args)));
    server.tool("release_machine", "Release your exact machine reservation. An optional final source note is " +
        "saved before the next agent is granted ownership. Does not stop apps/jobs or delete source files.",
    { reservationId: z.string(), sourceCodeChangedNote: sourceCodeChangedNote.optional() },
    reply(args => pool.release(session.id, args)));
    server.tool("dequeue_machine", "Cancel your pending request at any queue position. If already granted, " +
        "returns granted; explicitly release it instead. Does not affect another agent or source notes.",
    { requestId: z.string() }, reply(args => pool.dequeue(session.id, args)));
    server.tool("get_reservation_status", "Read machine ownership, FIFO queue and source notes, or poll a request. " +
        "Without arguments, lists reservations and this agent's identity. Polling never owns or renews a reservation.",
    { machineId: machineId.optional(), requestId: z.string().optional() },
    reply(args => args.requestId ? pool.requestStatus(args.requestId) : args.machineId ? pool.status(args.machineId)
        : { agent: session, machines: pool.list(), agents: pool.sessions() }));
    server.tool("update_source_code_note", "Persist your machine's sourceCodeChangedNote before edits/sync and update " +
        "afterwards. Record disposable scratch versus work to preserve, uncertain outcomes and sync/job IDs. " +
        "Only the current owner can update. Notes survive release, disconnect and hub restart.",
    { reservationId: z.string(), sourceCodeChangedNote }, reply(args => pool.updateNote(session.id, args)));
}
