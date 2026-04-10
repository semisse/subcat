# Changelog

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

