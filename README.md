<p align="center">
  <img src="assets/subcat.png" width="120" alt="SubCat">
</p>

# SubCat

<p align="center">
  <a href="https://github.com/sponsors/semisse"><img src="https://img.shields.io/badge/sponsor-♥-ea4aaa?style=flat-square" alt="Sponsor"></a>
  <a href="https://ko-fi.com/semisse"><img src="https://img.shields.io/badge/Ko--fi-donate-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white" alt="Ko-fi"></a>
</p>

A desktop app for developers who live in GitHub Actions. SubCat watches your CI runs, notifies you when they finish, and helps you hunt down flaky tests — both in the cloud and locally.

Built with Electron. Runs on macOS and Linux.

## Install

Download the latest build from [Releases](../../releases):

- **macOS** — open the `.dmg` and drag SubCat to Applications
- **Linux** — `.AppImage` (portable) or `.deb` (Debian/Ubuntu)

## What it does

### Watch CI runs
Log in with GitHub (OAuth Device Flow — no password stored), paste a run URL, and SubCat polls every 15 seconds. Native desktop notification when it completes; click to open in the browser. Multiple runs in parallel, and they survive app restarts.

### My PRs
Browse your open pull requests, drill into their workflow runs, and see per-PR CI stats (total runs, CI time, failure rate, pain index).

### Workflows
Navigate workflows by repository, inspect recent runs, and re-run failed jobs without leaving the app.

### Flake hunting (Lab Runs)
Repeat any GitHub Actions run N times to catch flaky tests. SubCat aggregates pass/failure counts across iterations and exports a Markdown report. Past runs are saved and browsable from the Reports page with a drill-down viewer.

### Lab Test (local runner)
Run test commands on your own machine in a loop and capture flaky results with live streaming output. Supports Playwright, Jest, Vitest, and Nx projects. History of past local runs is preserved and deletable.

### Security
- GitHub token encrypted via the OS keychain (`safeStorage` on macOS, `libsecret` on Linux)
- `contextIsolation` on, `nodeIntegration` off, explicit `window.api` bridge
- External links restricted to `https://github.com/`

## Feature flags

Some features are gated by flags stored in the app's `userData` directory:

- **macOS**: `~/Library/Application Support/SubCat/feature-flags.json`
- **Linux**: `~/.config/SubCat/feature-flags.json`

| Flag | Default | Description |
|------|---------|-------------|
| `lab-runs` | `false` | Lab Runs + Lab Test — flake hunting in CI and locally |

Edit the file and restart:

```json
{
  "lab-runs": true
}
```

## Dev setup

```bash
npm install
npm start          # production
npm run dev        # hot reload
npm test           # unit tests (Jest)
npm run test:e2e   # end-to-end tests (Playwright)
npm run lint       # ESLint
```

Requires Node 20+ and platform build tools (Xcode CLT on macOS, `build-essential` on Linux) for native module compilation.

## Architecture

SubCat is split into three layers. `src/core/` has **zero platform dependencies** and is ready to be reused in a future mobile app:

```
src/
  core/         pure business logic (auth, GitHub client, poller, runs, local-runner)
  db/           SQLite via better-sqlite3
  electron/     platform layer — main process, IPC handlers, storage, notifications
renderer/       plain JS UI (no framework, no bundler)
tests/          mirrors src/ structure
```

No TypeScript, no build step, no framework. See [`CLAUDE.md`](CLAUDE.md) for the full architectural rationale.
