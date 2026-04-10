# Releasing SubCat

## How it works

Merging into `main` triggers an automated release pipeline:

```
dev (bump version) → PR → main → tag-release.yml → release.yml → GitHub Release + DMG
```

1. `tag-release.yml` reads the version from `package.json` and creates a git tag (e.g. `v1.2.0`).
2. `release.yml` picks up the new tag, builds the DMG, and publishes it as a GitHub Release.

## Cutting a release

```bash
# 1. On dev, bump the version
npm version minor   # or patch / major

# 2. Push to dev
git push origin dev

# 3. Open a PR: dev → main
gh pr create --base main --head dev --title "Release v$(node -p "require('./package.json').version")"

# 4. Merge the PR — the rest is automatic
```

That's it. Watch the Actions tab for progress.

## Version bump guide

| Change | Command |
|--------|---------|
| Bug fix | `npm version patch` |
| New feature, no breaking changes | `npm version minor` |
| Breaking change | `npm version major` |

`npm version` updates `package.json` and creates a local commit automatically.

## What happens if the tag already exists?

`tag-release.yml` checks before creating. If `v{version}` already exists, it skips silently — no duplicate tags, no error. To re-release the same version you'd need to delete the tag manually first (rare edge case, not recommended).

## Checking release status

```bash
gh run list --workflow=release.yml
gh release list
```
