# Claude Code Instructions

## Git Commits
- Use Conventional Commits format: `type(scope): description` (e.g. `fix: ...`, `feat: ...`, `chore: ...`).
- Keep commit subject lines concise; use the body for detail.
- Never include `Co-Authored-By` lines in commit messages.

## Code Style
- 4-space indentation, never tabs.
- Always use semicolons.
- Brace style: (`if (x) {`), single-line blocks allowed.
- Always use curly braces for `if`/`else`/`for`/`while`.
- No trailing whitespace.
- Use `const` and `let` instead of `var`.

## Phoenix MCP (Desktop App Testing)

Use `exec_js` to run JS in the Phoenix browser runtime. jQuery `$()` is global. `brackets.test.*` exposes internal modules (DocumentManager, CommandManager, ProjectManager, FileSystem, EditorManager). Always `return` a value from `exec_js` to see results. Prefer reusing an already-running Phoenix instance (`get_phoenix_status`) over launching a new one.

**Open AI sidebar tab:** `document.querySelectorAll('span').forEach(s => { if (s.textContent.trim() === 'AI' && s.childNodes.length === 1) s.parentElement.click(); });`

**Send AI chat message:** `$('.ai-chat-textarea').val('prompt'); $('.ai-chat-textarea').trigger('input'); $('.ai-send-btn').click();`

**Click AI chat buttons:** `$('.ai-edit-restore-btn:contains("Undo")').click();`

**Check logs:** `get_browser_console_logs` with `filter` regex (e.g. `"AI UI"`, `"error"`) and `tail` — includes both browser console and Node.js (PhNode) logs. Use `get_terminal_logs` for Electron process output (only available if Phoenix was launched via `start_phoenix`).
