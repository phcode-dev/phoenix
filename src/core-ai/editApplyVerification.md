# Edit Apply & Restore Point Verification

Formal verification cases for the timeline-of-restore-points UX in AIChatPanel.

## UX Model

- **Initial PUC** (snapshot 0): appears once per session before the first edit tool indicator. Always shows "Restore to this point".
- **Summary card** (latest): shows "Undo" (when `_undoApplied` is false) or "Restore to this point" (when `_undoApplied` is true).
- **Summary card** (not latest): always shows "Restore to this point".
- After any restore/undo is clicked, `_undoApplied = true` and ALL buttons become "Restore to this point" until the next AI response creates new edits.
- The clicked restore point shows **"Restored"** text with green highlight styling. Clicking a different restore point moves the "Restored" indicator to that one.
- All restore/undo buttons are **disabled during AI streaming** and re-enabled when the response completes.

## Snapshot List (flat, one per restore point)

```
_snapshots[0] = initial state (original files, before any AI edits)
_snapshots[1] = after R1 edits
_snapshots[2] = after R2 edits
...
```

## State Variables

### AISnapshotStore (pure data layer)
- `_snapshots[]`: flat array of `{ filePath: hash|null }` snapshots. `getSnapshotCount() > 0` replaces the old `_initialSnapshotCreated` flag.
- `_pendingBeforeSnap`: per-file pre-edit tracking during current response (dedup guard for first-edit-per-file + file list for `finalizeResponse`)

### AIChatPanel (UI state)
- `_undoApplied`: whether undo/restore has been clicked on any card (UI control for button labels)

## DOM Layout Example

```
[User: "fix bugs"]
[── Restore to this point ──]         <- initial PUC (snapshot 0), session-first only
[Claude: "I'll fix..."]
[Edit file1.js]
[Edit file2.js]
[Summary: 2 files changed | Undo]    <- snapshot 1

[User: "also refactor"]
[Claude: "Refactoring..."]
[Edit file1.js]
[Summary: 1 file changed | Undo]     <- snapshot 2 (snapshot 1 becomes "Restore to this point")
```

## Key API Methods

### AISnapshotStore

- `recordFileBeforeEdit(filePath, previousContent, isNewFile)`: tracks pre-edit state, back-fills all existing snapshots
- `createInitialSnapshot()`: pushes empty `{}` as snapshot 0, returns index 0. Must be called *before* `recordFileBeforeEdit` so the back-fill populates it.
- `getSnapshotCount()`: returns `_snapshots.length` (replaces `isInitialSnapshotCreated()`)
- `finalizeResponse()`: builds after-snapshot from `_snapshots[last]` + current doc content, pushes it, returns index (or -1)
- `restoreToSnapshot(index, callback)`: applies `_snapshots[index]` to files, calls `callback(errorCount)`
- `reset()`: clears all state for new session

### AIChatPanel

- `_$msgs()`: live DOM query helper — returns `$(".ai-chat-messages")` to avoid stale cached `$messages` reference (see Implementation Notes)
- `_undoApplied`: local module state — reset to `false` in `_appendEditSummary()` (after `finalizeResponse()`) and `_newSession()`; set to `true` in `_onRestoreClick()` and `_onUndoClick()`
- `_onToolEdit()`: on first edit per response, creates initial snapshot (if none) *then* records pre-edit state. Inserts initial PUC. Diff toggle only (no per-edit undo).
- `_appendEditSummary()`: calls `finalizeResponse()`, resets `_undoApplied`, creates summary card with "Undo" or "Restore to this point" button
- `_onUndoClick(afterIndex)`: sets `_undoApplied`, resets all buttons to "Restore to this point", restores to `afterIndex - 1`, highlights target element as "Restored", scrolls to it
- `_onRestoreClick(snapshotIndex)`: sets `_undoApplied`, resets all buttons to "Restore to this point", restores to the given snapshot, marks clicked element as "Restored"
- `_setStreaming(streaming)`: disables/enables all restore buttons during AI streaming

## Verification Cases

### Case 1: Single response editing 2 files — Undo then Restore
- R1 edits A: "v0" -> "v1", edits B: "b0" -> "b1"
- Snapshots: [0: {A:v0, B:b0}], [1: {A:v1, B:b1}]
- Initial PUC appears (snapshot 0), summary card shows "Undo" (snapshot 1)
- Click "Undo" on summary -> files revert to snapshot 0 (A=v0, B=b0)
- Scroll to initial PUC, highlighted green, button says "Restored". Summary says "Restore to this point"
- Click "Restore to this point" on summary (snapshot 1) -> files forward to A=v1, B=b1
- Summary now says "Restored", initial PUC says "Restore to this point"

### Case 2: Two responses — Undo latest
- R1: A "v0"->"v1", R2: A "v1"->"v2"
- Snapshots: [0: {A:v0}], [1: {A:v1}], [2: {A:v2}]
- Card 1 shows "Restore to this point", card 2 shows "Undo"
- Click "Undo" on card 2 -> A="v1" (snapshot 1), card 1 highlighted with "Restored"
- All other buttons become "Restore to this point"

### Case 3: Two responses — Restore to initial
- Same setup as Case 2
- Click "Restore to this point" on initial PUC (snapshot 0) -> A="v0"
- Initial PUC shows "Restored", all others show "Restore to this point"

### Case 4: Restore to middle point
- R1: A "v0"->"v1", R2: A "v1"->"v2", R3: A "v2"->"v3"
- Snapshots: [0: {A:v0}], [1: {A:v1}], [2: {A:v2}], [3: {A:v3}]
- Click "Restore to this point" on card 1 (snapshot 1) -> A="v1", card 1 shows "Restored"
- Click "Restore to this point" on card 2 (snapshot 2) -> A="v2", card 2 shows "Restored", card 1 back to "Restore to this point"
- Click "Restore to this point" on initial PUC (snapshot 0) -> A="v0"

### Case 5: Two responses editing different files
- R1: A "a0"->"a1", R2: B "b0"->"b1"
- Snapshots: [0: {A:a0}], [1: {A:a1}], [2: {A:a1, B:b1}]
- Back-fill: when B is first seen in R2, snapshot 0 and 1 get B:b0 added
- Click initial PUC (snapshot 0) -> A=a0, B=b0
- Click card 1 (snapshot 1) -> A=a1, B=b0 (B not yet edited)
- Click card 2 (snapshot 2) -> A=a1, B=b1

### Case 6: File created by R1, edited by R2
- R1 creates A (null -> "new"), R2 edits A: "new"->"edited"
- Snapshots: [0: {A:null}], [1: {A:new}], [2: {A:edited}]
- Click initial PUC (snapshot 0) -> A deleted (hash=null)
- Click card 1 (snapshot 1) -> A="new" (re-created)
- Click card 2 (snapshot 2) -> A="edited"

### Case 7: File created by R2
- R1 edits A, R2 creates B
- Snapshots: [0: {A:a0}], [1: {A:a1}], [2: {A:a1, B:new}]
- Back-fill: snapshot 0 and 1 get B:null
- Click initial PUC (snapshot 0) -> A=a0, B deleted
- Click card 1 (snapshot 1) -> A=a1, B deleted (null)
- Click card 2 (snapshot 2) -> A=a1, B=new

### Case 8: Undo resets on next AI response
- R1 edits A. Click "Undo" -> `_undoApplied = true`, all buttons "Restore to this point"
- User sends new message, R2 edits B
- `_undoApplied` resets to false via `finalizeResponse()`
- New summary card shows "Undo", previous cards show "Restore to this point"

### Case 9: Response with no edits
- R1 only reads files, no edits
- No initial PUC inserted, no summary card, no restore buttons

### Case 10: Cancelled partial response
- `_onComplete` fires, `_appendEditSummary()` calls `finalizeResponse()` with partial edits. Works identically to a complete response.

### Case 11: Buttons disabled during streaming
- User sends message, AI starts streaming with edits
- Initial PUC and all summary card buttons have `disabled` attribute set
- Clicking them does nothing (`_isStreaming` guard in handlers)
- When streaming completes, `_setStreaming(false)` re-enables all buttons

## Implementation Notes

### Stale `$messages` reference
The cached `$messages` jQuery variable (set in `_renderChatUI()`) can become stale after `SidebarTabs.addToTab()` reparents the panel. DOM queries via the stale reference silently fail — mutations apply to a detached node instead of the visible DOM.

**Fix**: `_$msgs()` helper returns `$(".ai-chat-messages")` (live DOM query). Used in all deferred operations: `_onRestoreClick`, `_onUndoClick`, `_setStreaming` (button disable/enable), `_sendMessage` (highlight removal), `_appendEditSummary` (previous button update), and PUC insertion in `_onToolEdit`.

The cached `$messages` is still used for synchronous operations during rendering (appending messages, streaming updates) where it remains valid.

## Manual Testing Plan

1. Reload Phoenix, open AI tab
2. Ask Claude to edit a file (two changes)
3. Verify initial PUC appears before the first Edit tool indicator
4. Verify summary card with "Undo" button appears after response completes
5. Verify all restore buttons are disabled during streaming, enabled after
6. Click "Undo" -> verify file reverts, scroll to initial PUC, highlighted green with "Restored" text
7. Verify all other buttons now show "Restore to this point"
8. Click "Restore to this point" on summary card -> verify file returns to edited state, summary shows "Restored", PUC shows "Restore to this point"
9. Ask Claude to make another edit (second response)
10. Verify first summary card says "Restore to this point", second says "Undo"
11. Click "Undo" on second -> verify files revert to state after first response, first card highlighted with "Restored"
12. Click "Restore to this point" on any card -> verify files match that snapshot, clicked card shows "Restored"
13. Ask Claude a question (no edits) -> verify no PUC or restore buttons appear
14. Start new session -> verify all state cleared
