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

## Translations / i18n
- All user-visible strings must go in `src/nls/root/strings.js` — never hardcode English in source files.
- Use `const Strings = require("strings");` then `Strings.KEY_NAME`.
- For parameterized strings use `StringUtils.format(Strings.KEY, arg0, arg1)` with `{0}`, `{1}` placeholders.
- Keys use UPPER_SNAKE_CASE grouped by feature prefix (e.g. `AI_CHAT_*`).
- Only `src/nls/root/strings.js` (English) needs manual edits — other locales are auto-translated by GitHub Actions.
- Never compare `$(el).text()` against English strings for logic — use data attributes or CSS classes instead.

## Phoenix MCP (Desktop App Testing)

Use `exec_js` to run JS in the Phoenix browser runtime. jQuery `$()` is global. `brackets.test.*` exposes internal modules (DocumentManager, CommandManager, ProjectManager, FileSystem, EditorManager). Always `return` a value from `exec_js` to see results. Prefer reusing an already-running Phoenix instance (`get_phoenix_status`) over launching a new one.

**Open AI sidebar tab:** `document.querySelectorAll('span').forEach(s => { if (s.textContent.trim() === 'AI' && s.childNodes.length === 1) s.parentElement.click(); });`

**Send AI chat message:** `$('.ai-chat-textarea').val('prompt'); $('.ai-chat-textarea').trigger('input'); $('.ai-send-btn').click();`

**Click AI chat buttons:** `$('.ai-edit-restore-btn:contains("Undo")').click();`

**Check logs:** `get_browser_console_logs` with `filter` regex (e.g. `"AI UI"`, `"error"`) and `tail` — includes both browser console and Node.js (PhNode) logs. Use `get_terminal_logs` for Electron process output (only available if Phoenix was launched via `start_phoenix`).

## Running Tests via MCP

The test runner must be open as a separate Phoenix instance (it shows up as `phoenix-test-runner-*` in `get_phoenix_status`). Use `run_tests` to trigger test runs and `get_test_results` to poll for results. `take_screenshot` also works on the test runner.

### Test categories
- **unit** — Fast, no UI. Safe to run all at once (`run_tests category=unit`).
- **integration** — Spawns a Phoenix iframe inside the test runner. Some specs require window focus and will hang if the test runner window isn't focused.
- **LegacyInteg** — Like integration but uses the legacy test harness. Also spawns an embedded Phoenix instance.
- **livepreview**, **mainview** — Specialized integration tests.
- **Do NOT use:** `all`, `performance`, `extension`, `individualrun` — not actively supported.

### Hierarchy: Category → Suite → Test
- **Category** — top-level grouping: `unit`, `integration`, `LegacyInteg`, etc. Safe to run an entire category.
- **Suite** — a group of related tests within a category (e.g. `integration: FileFilters` has ~20 tests). This is the `spec` parameter value.
- **Test** — a single test within a suite.

### Running all tests in a category
```
run_tests(category="unit")
```

### Running a single suite
Pass the exact suite name as the `spec` parameter. **Suite names do NOT always have a category prefix.** Many suites are registered with just their plain name (e.g. `"CSS Parsing"`, `"Editor"`, `"JSUtils"`), while others include a prefix (e.g. `"unit:Phoenix Platform Tests"`, `"integration: FileFilters"`, `"LegacyInteg:ExtensionLoader"`). If the suite name is wrong, the test runner will show a blank page with 0 specs and appear stuck.

**To discover the exact suite name**, run this in `exec_js` on the test runner instance:
```js
return jasmine.getEnv().topSuite().children.map(s => s.description);
```

Examples:
```
run_tests(category="unit", spec="CSS Parsing")
run_tests(category="unit", spec="unit:Phoenix Platform Tests")
run_tests(category="integration", spec="integration: FileFilters")
run_tests(category="LegacyInteg", spec="LegacyInteg:ExtensionLoader")
```

### Running individual tests
You can pass a specific test's full name as `spec` to run just that one test. It is perfectly valid to run a single test. However, if a single test fails, re-run the full suite to confirm — suites sometimes execute tests in order with shared state, so an individual test may fail in isolation but pass within its suite. If the suite passes, the test is valid.

### Gotchas
- **Instance name changes on reload:** The test runner gets a new random instance name each time the page reloads. Always check `get_phoenix_status` after a `run_tests` call to get the current instance name.
- **Integration tests may hang:** Specs labeled "needs window focus" will hang indefinitely if the test runner doesn't have OS-level window focus. If `get_test_results` starts timing out, the event loop is likely blocked by a stuck spec — use `force_reload_phoenix` to recover.
- **LegacyInteg/integration tests spawn an iframe:** These tests open an embedded Phoenix instance inside the test runner, so they are slower and more resource-intensive than unit tests.
