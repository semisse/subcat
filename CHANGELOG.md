# Changelog

## [1.2.0] — 2026-04-17

### Added
- **Lab Test** — run stress tests locally via Docker; execute a shell command N times and see live output with pass/fail/flaky counts
- **Lab Test: multi-runner support** — auto-detects Playwright (`--repeat-each`) vs Jest/Vitest/Nx (shell loop), so Lab Test works with any test runner
- **Lab Test: run history** — browse, inspect, and delete past local test runs
- **Lab Test: stress factors** — configure stress parameters and see Docker status chip
- **Report drill-down viewer** — click any saved report to see a full detail view with flakiness badges, artifacts, and root cause hints
- **Profile page** — view your GitHub profile, credits balance, and usage stats
- **Dashboard stat tooltips** — hover any stat card for an explanation of the metric
- **E2E test suite** — 44 Playwright specs across 10 files covering auth, watch, PRs, pinned workflows, notifications, run lifecycle, reports, dashboard stats, and Lab Test

### Changed
- **Renderer refactor** — `renderer.js` split from 2221 lines into 11 focused modules; zero build step preserved (multiple `<script>` tags with shared globals)
- **Architecture cleanup** — clear separation between `src/core/` (platform-agnostic), `src/electron/` (Electron-specific), and `src/db/` (SQLite)
- Workflow poll interval increased for better performance

### Fixed
- Empty states for My PRs and Runs sections after nav border shift
- Release pipeline now uses PAT to push tags so `release.yml` triggers correctly

### Testing
- 262 unit tests + 44 E2E specs passing
- E2E infrastructure: mock server with response sequencing, fixture factories, 1s poll interval via `SUBCAT_POLL_INTERVAL_MS`
- `confirm-dialog` auto-confirms in E2E mode (`SUBCAT_E2E`)

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

