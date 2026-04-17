// main-window.spec.js — Main window smoke tests with a fake token.
// Verifies that a valid token causes the main window to open and
// the dashboard to render correctly.

const { test, expect } = require('../fixtures');
const { baseFixtures } = require('../data');

test.use({ authToken: 'gho_faketoken_e2e' });

test.beforeEach(async ({ mockServer }) => {
    mockServer.setFixtures(baseFixtures());
});

test('opens main window when token is valid', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await expect(window).toHaveURL(/index\.html/);
});

test('dashboard page is active by default', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await expect(window.locator('#pageHome')).toHaveClass(/active/);
});

test('sidebar shows username after auth', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // initUser() calls auth-get-status IPC → fetchUser → mock /user
    await expect(window.locator('#authUsername')).toHaveText('testuser', { timeout: 8000 });
});

test('nav items are rendered', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await expect(window.locator('.nav-item[data-page="home"]')).toBeVisible();
    await expect(window.locator('.nav-item[data-page="my-prs"]')).toBeVisible();
    await expect(window.locator('.nav-item[data-page="runs"]')).toBeVisible();
});

test('switching to Reports page works', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await window.locator('.nav-item[data-page="reports"]').click();
    await expect(window.locator('#pageReports')).toHaveClass(/active/);
});
