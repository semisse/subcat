const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './specs',
    timeout: 30_000,
    reporter: [['list']],
    // No retries in CI for now — flaky E2E infra should be fixed, not retried
    retries: 0,
    workers: 1, // Electron tests must not run in parallel (single-process Electron)
});
