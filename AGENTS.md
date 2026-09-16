# Repository Instructions

Follow [CLAUDE.md](CLAUDE.md) for repository workflows and requirements.

## Code Style and Readability
- New code must match the surrounding file's formatting and conventions while following the repository's explicit style rules.
- Keep all imports and `require()` declarations at the top of the file (or the top of its AMD module factory). Do not use dynamic or asynchronous imports.
- Write clear, concise JSDoc for new or changed functions, documenting their purpose, parameters, and return values where relevant. Prioritize readability over verbosity; explain non-obvious behavior without repeating the code.

## Tests
- Use the existing Jasmine runner and CI registration. Do not add standalone `node:test` suites or separate test commands unless explicitly requested.
- Before writing tests, inspect a nearby suite, its registration, and the relevant CI workflow. Core specs live in `test/spec/` and are registered in `test/UnitTestSuite.js`; Node-side coverage follows `test/spec/CLILocator-test.js` and `src-node/test/test-cli-locator.js`.
- Follow [CLAUDE.md — Writing Tests](CLAUDE.md#writing-tests) for categories, Node helpers, fixture isolation, and CI coverage. Keep individual cases visible as separate Jasmine `it()` results.
- Verify new suites in the connected `phoenix-test-runner-*` instance using `run_tests` and `get_test_results`. Confirm the expected spec count and category; a passing standalone script or a run with zero specs is not sufficient.
