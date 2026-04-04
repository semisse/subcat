# QA Notes

Handoff from engineering. This document gives you the context to define and implement the QA strategy.

## Current state

- **98 tests**, all passing (`npm test`)
- **Jest** with `node` test environment; `jsdom` available for renderer tests
- **No coverage reporting configured yet** — first thing to set up
- **No linter** — second thing to set up
- **No CI test gate** — `.github/workflows/ci.yml` exists but may need updating

## What is tested

| Module | File | Tests | Notes |
|--------|------|-------|-------|
| GitHub API client | `tests/core/github.test.js` | 28 | URL parsing, API calls, error handling |
| Auth / OAuth | `tests/core/auth.test.js` | 3 | Only `fetchUser` — `startDeviceFlow` and `pollForToken` not covered |
| Poller | `tests/core/poller.test.js` | 12 | Full loop coverage, transient errors, repeat runs |
| Run orchestration | `tests/core/runs.test.js` | 15 | rerunRun, rerunFailedRun, stopWatching, cancelRun, resumeRuns |
| Database | `tests/db/db.test.js` | 23 | All CRUD operations, schema, cascade |
| Main process | `tests/electron/main.test.js` | 10 | autoUpdater dialog, IPC delegation |
| Renderer | `tests/renderer/renderer.test.js` | 7 | DOM interactions |

## Known gaps (priority order)

1. **`src/core/auth.js`** — `startDeviceFlow` and `pollForToken` have no tests. These are critical paths (auth failure = app is unusable).
2. **`src/electron/ipc/auth.js`** — login flow, logout, token refresh not tested end-to-end.
3. **`src/core/runs.js` — `startWatching`** — the most complex function (~70 lines, multiple branches). Not covered yet.
4. **`src/electron/ipc/reports.js`** — `save-report` handler (file write, dialog) not tested.
5. **Renderer** — 7 tests exist but coverage is thin. `applyCompletedState`, PR picker, rerun button flow not covered.

## Architecture notes relevant to testing

**`src/core/` is pure JS with no platform deps.** These modules are the easiest to test — no Electron mocking needed. Pass mock objects directly as function arguments.

**IPC handlers use dependency injection.** Each `src/electron/ipc/*.js` exports `register(deps)`. To test a handler:
```js
const { ipcHandlers } = buildMocks();
require('../../src/electron/main');
const result = await ipcHandlers['handler-name'](null, payload);
```
See `tests/electron/main.test.js` for the pattern.

**PollManager is a class** — inject a mock db object directly into the constructor. No `jest.mock` needed for db in poller tests (see `tests/core/poller.test.js`).

**Renderer tests** use `jest-environment-jsdom` (already in `devDependencies`). Add `@jest-environment jsdom` docblock to renderer test files.

## Suggested QA setup

```
1. Coverage reporting
   - Add --coverage flag to jest config
   - Set thresholds: statements 80%, branches 70% (raise over time)
   - Add coverage/ to .gitignore

2. Linting
   - ESLint with eslint-plugin-jest for test-specific rules
   - Key rules: no-unused-vars, no-undef, jest/expect-expect

3. CI gate
   - Run npm test on every PR
   - Fail PR if coverage drops below threshold

4. Test priorities (in order)
   - auth: startDeviceFlow + pollForToken
   - runs: startWatching (branch coverage)
   - ipc/auth: full login flow
   - renderer: applyCompletedState, PR picker
```

## Running tests

```bash
npm test                              # full suite
npm test -- tests/core/runs.test.js  # single file
```
