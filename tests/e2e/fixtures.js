// Playwright fixtures: mockServer + electronApp.
// Usage:
//   const { test, expect } = require('../fixtures');
//   test.use({ authToken: 'gho_fake' });

const { test: base, expect } = require('@playwright/test');
const { _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { createMockServer } = require('./mock-server');

const APP_ENTRY = path.join(__dirname, '../../src/electron/main.js');

const test = base.extend({
    // Override per test with test.use({ authToken: 'gho_fake' }) to get main window.
    // Defaults to null → login window.
    authToken: [null, { option: true }],

    mockServer: [async ({}, use) => {
        const server = createMockServer();
        const port = await server.start();
        await use(server);
        await server.stop();
    }, { scope: 'test' }],

    electronApp: [async ({ mockServer, authToken }, use) => {
        const app = await electron.launch({
            args: [APP_ENTRY],
            env: {
                ...process.env,
                SUBCAT_E2E: '1',
                SUBCAT_API_HOST: '127.0.0.1',
                SUBCAT_API_PORT: String(mockServer.port),
                SUBCAT_API_PROTOCOL: 'http',
                SUBCAT_POLL_INTERVAL_MS: '1000',
                ...(authToken ? { SUBCAT_E2E_TOKEN: authToken } : {}),
            },
        });
        await use(app);
        await app.close();
    }, { scope: 'test' }],
});

module.exports = { test, expect };
