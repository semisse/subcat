# CLAUDE.md

This is **CI Notifier** (codename: subcat) — a small Electron desktop app for macOS.

## Purpose

Monitor GitHub Actions workflow runs and send native desktop notifications when they complete.

## Architecture

Single-window Electron app with 6 files:

- `main.js` — Main process: window creation, GitHub API polling (HTTPS, no dependencies), native notifications, IPC handlers for auth + watching
- `auth.js` — GitHub OAuth Device Flow, token encryption via `safeStorage`, user fetching, config persistence
- `preload.js` — Context bridge exposing `window.api` to the renderer (contextIsolation: true)
- `renderer.js` — UI logic: manages auth state, watched runs list, updates cards, handles user input
- `index.html` — Single-page UI with inline CSS, dark theme, macOS vibrancy
- `package.json` — Only dependency is `electron`

## Key behaviors

- GitHub OAuth Device Flow for authentication (same as GitHub CLI) — token encrypted via `safeStorage`
- Falls back to manual personal access token if not logged in
- Parses GitHub Actions URLs in the format `github.com/{owner}/{repo}/actions/runs/{id}`
- Polls `GET /repos/{owner}/{repo}/actions/runs/{id}` every 15 seconds
- Sends native `Notification` on completion with click-to-open
- Optional GitHub token for private repos (never persisted to disk)
- Multiple runs can be watched simultaneously (stored in a `Map` keyed by run ID)

## Conventions

- No build step — plain JS, no bundler, no framework
- Security: CSP in HTML meta tag, contextIsolation enabled, no nodeIntegration
- No external runtime dependencies beyond Electron
- Keep it minimal — this is a single-purpose utility

## Auth flow details

GitHub Device Flow OAuth (no server needed):

1. User saves a GitHub OAuth App Client ID (stored in `config.json` in app userData dir)
2. App calls `POST github.com/login/device/code` with `client_id` + `scope=repo`
3. User sees a code, browser opens `github.com/login/device` for authorization
4. App polls `POST github.com/login/oauth/access_token` with `device_code` until authorized
5. Token is encrypted via Electron `safeStorage` (OS keychain) and saved to `auth.enc` in userData dir
6. On launch, app checks for stored token and validates with `GET /user`

Fallback: manual PAT entry in the UI (not persisted).

### OAuth App setup

Create at github.com/settings/developers → New OAuth App → enable "Device Flow" → copy Client ID.
No client secret needed for Device Flow.
