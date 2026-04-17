# Changelog

## [1.2.1] — 2026-04-17

### Fixed
- **Auto-update on macOS** — v1.2.0 shipped only a DMG, but electron-updater needs a `.zip` to swap the app in place. Existing users saw `ZIP file not provided` silently in the logs and no update prompt. The mac build now produces both a signed DMG (for first install) and a signed ZIP (for in-place updates); `latest-mac.yml` points at the ZIP.

## [1.2.0] — 2026-04-17

### Added
- **Lab Test** — reproduce CI flakiness locally. Point it at a repo, pick a test command, and SubCat runs it inside a Docker container with CI-matched CPU and memory constraints, N times in a row, streaming live output and reporting pass / fail / flaky counts.
- **Lab Test: stress factors** — optional presets (Light / Medium / Heavy) plus individual toggles for seed randomisation, timezone, worker limits, `ulimit -n`, network latency, CPU contention, packet loss, and stale reads — so you can reproduce CI conditions that don't show up on your laptop.
- **Lab Test: multi-runner support** — Playwright uses `--repeat-each`, Jest / Vitest / Nx fall back to a shell loop with iteration sentinels so progress tracking works for any test runner.
- **Lab Test: env file injection** — point at a `.env` file and choose where to mount it inside the container, for tests that need credentials or config.
- **Lab Test: install command** — run an arbitrary install step inside the container before tests, so native binaries get rebuilt for Linux.
- **Lab Test: history** — every run is saved with its config and output; browse, re-open, copy output, save as report, or delete from the history pane.
- **Lab Test: Docker check gate** — Lab Test page hides the form until Docker is confirmed ready, with a retry panel when Docker Desktop isn't running.
- **Lab Test: native notification** — when a run finishes, a desktop notification fires with the pass/fail summary, and the notification is logged in the notification center.
- **Lab Test: copy output** — one click copies the full run log for bug reports.
- **Lab Test: Force `linux/amd64`** — Apple Silicon option for tests that need Google Chrome (not available on arm64).
- **Lab Test: docker command in output** — the exact `docker run` invocation is emitted as the first log line so it can be copied for reproduction or bug reports.
- **Report drill-down viewer** — click a saved report to see failed-test grouping, flakiness badges, artifacts, and root-cause hints.
- **Profile page** — GitHub profile, credits balance, usage stats, and donation links.
- **Dashboard stat tooltips** — hover any stat card to see what the metric means and how it's calculated.
- **Dynamic welcome messages** — random greeting on the dashboard, because why not.
- **E2E test suite** — 44 Playwright specs across 10 files covering auth, watch, PRs, pinned workflows, notifications, run lifecycle, reports, dashboard stats, and Lab Test.

### Changed
- **Renamed "Runs" to "Watching"** — clearer mental model and matches the `+ Watch` button; new eye icon in the sidebar.
- **Removed the manual Refresh button** — Watching runs poll continuously, and pinned workflows and PR lists refresh on their own triggers, so the button wasn't doing anything.
- **Renderer refactor** — `renderer.js` split from 2 221 lines into 11 focused modules; zero build step preserved (multiple `<script>` tags with shared globals).
- **Architecture cleanup** — clear separation between `src/core/` (platform-agnostic, mobile-portable), `src/electron/` (Electron-specific), and `src/db/` (SQLite).
- **Lab Test: dropped image auto-detection** — the default Playwright image works for the supported flow; removing the probe simplifies the form and shaves startup time.
- Workflow poll interval increased for better performance.

### Fixed
- Empty states for the Watching and My PRs sections after nav border shift.
- Run cards now update consistently in both the Dashboard and Watching pages (previously only the dashboard clone was refreshed).
- Run-restored flow now wires Report, Rerun, and Rerun Failed buttons onto both card copies (previously only the dashboard card got them after a restart).
- Rerun button no longer appears on intermediate iterations of a repeat run — only on the final iteration.
- Back button from a workflow-runs drill-down returns to Watching correctly — `switchPage` early-return was swallowing the navigation.
- Lab Test: validation failures no longer deadlock the UI — `done` event now fires after the IPC handler returns the run id, and the renderer surfaces the error message instead of hanging on the loading screen.
- Lab Test: zero-valued stress inputs (0 ms latency, 0 % packet loss, 0 ms stale read) are now preserved instead of silently falling back to the default.
- Report viewer breadcrumb no longer renders HTML entities literally — `updateBreadcrumb` already escapes its segments.
- Renderer no longer throws on the login screen when `appVersion` / `logoutBtn` aren't in the DOM.
- Release pipeline uses a PAT to push tags so `release.yml` triggers correctly.

### Security
- **Lab Test: IPC input validation** — `local-run:start` now rejects payloads before they reach `docker` or `sh -c`. Paths with `:`, `,`, `;`, or newlines are blocked (docker `-v` injection), `envTarget` traversal (`..`) is rejected, `testCommand` / `installCommand` reject newlines, null bytes, the `__SUBCAT_DONE__` progress sentinel, and commands longer than 4 096 chars, and `timezone` must match the IANA character set.

### Testing
- 370 unit tests + 44 E2E specs passing.
- E2E infrastructure: mock server with response sequencing, fixture factories, 1s poll interval via `SUBCAT_POLL_INTERVAL_MS`.
- `confirm-dialog` auto-confirms in E2E mode (`SUBCAT_E2E`).

## [1.1.0] — 2026-04-10

### Added
- **Dashboard** — new home screen with run stats, recent activity, and quick actions
- **Linux support** — AppImage and .deb builds; token storage falls back to `~/.config` when no keychain is available
- **Notification center** — in-app log of all past notifications with unread badge
- **PR drill-down** — 3-level navigation: My PRs → PR Checks → Workflow Runs
- **Pin workflow** — pin any workflow to the sidebar and track its latest run status
- **Cancel run** — cancel a running workflow directly from the watch list
- **Flakiness report** — save a Markdown report with pass/fail counts and failed test names per attempt
- **PR reviews** — view review status alongside CI checks in the PR detail view
- **Rerun failed jobs** — rerun only failed jobs (not the full workflow) from the attempt view
- **Repeat count in watch form** — set how many times to re-run a workflow from the UI
- **Loading animations** — cat animation while PR checks and workflow runs are loading
- **File menu** — **⌘N** shortcut to open the New Watch form
- **Pending reruns** — reruns triggered while the app is closed are resumed on next launch

### Changed
- Sections renamed to **My PRs**, **Runs**, and **Workflows**
- Status text humanised: `in_progress` → Running, `timed_out` → Timed out, etc.
- Report button demoted to tertiary style to reduce visual noise
- `+ Watch Run` renamed to `+ Watch`

### Fixed
- `titleBarStyle: 'hidden'` was applied on Linux, hiding window controls — now macOS-only
- Refresh now correctly clears both Pinned and Runs sections before reloading
- PR workflow rows were not navigating in-app due to drag region intercepting clicks
- Workflow run URL was constructed incorrectly when drilling down from a PR
- Run number label missing in repeat-mode watch list
- Update dialog could crash if main window was closed before the download finished
- Made by SubCat footer link corrected to `subcat.todaywedream.com`

