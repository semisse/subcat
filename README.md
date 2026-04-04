<p align="center">
  <img src="assets/subcat.png" width="120" alt="SubCat">
</p>

# SubCat

<p align="center">
  <a href="https://github.com/sponsors/semisse"><img src="https://img.shields.io/badge/sponsor-♥-ea4aaa?style=flat-square" alt="Sponsor"></a>
  <a href="https://ko-fi.com/semisse"><img src="https://img.shields.io/badge/Ko--fi-donate-FF5E5B?style=flat-square&logo=ko-fi&logoColor=white" alt="Ko-fi"></a>
</p>

A macOS app that monitors GitHub Actions runs and sends native notifications when they finish.

## Install

Download the latest `.dmg` from [Releases](../../releases), open it, and drag SubCat to your Applications folder.

> [!WARNING]
> SubCat is not signed with an Apple Developer certificate. macOS will show a **"damaged and can't be opened"** error. Run this once in Terminal after installing:
> ```bash
> xattr -rd com.apple.quarantine /Applications/SubCat.app
> ```

## How it works

1. Log in with your GitHub account (OAuth Device Flow — no password stored)
2. Paste a GitHub Actions run URL
3. SubCat polls every 15 seconds and notifies you when the run completes
4. Click the notification to open the run in your browser

## Features

- Watch multiple runs simultaneously
- Repeat a run N times to catch flaky tests — get a pass/failure summary at the end
- Export results to CSV
- Runs persist across restarts — pick up where you left off
- Token encrypted via macOS Keychain (`safeStorage`)

## Dev setup

```bash
npm install
npm start        # production
npm run dev      # with hot reload
npm test         # unit tests
```

Requires Node 20+ and Xcode Command Line Tools (for native module compilation).
