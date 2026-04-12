// dashboard-stats.spec.js — Dashboard stats cards render with correct data.
// Verifies that the dashboard home page shows stats derived from watched runs and PRs.

const { test, expect } = require('../fixtures');
const { dashboardStatsFixtures } = require('../data');

test.use({ authToken: 'gho_faketoken_e2e' });

test.beforeEach(async ({ mockServer }) => {
    mockServer.setFixtures(dashboardStatsFixtures());
});

test('dashboard stats section is visible', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await expect(window.locator('#pageHome')).toHaveClass(/active/);

    // Stats grid should be rendered
    await expect(window.locator('#totalPRs')).toBeVisible();
    await expect(window.locator('#totalRuns')).toBeVisible();
    await expect(window.locator('#totalFailures')).toBeVisible();
});

test('total runs starts at zero with no watched runs', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // No runs watched yet — should be 0
    await expect(window.locator('#totalRuns')).toHaveText('0', { timeout: 5_000 });
});

test('total failures starts at zero', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await expect(window.locator('#totalFailures')).toHaveText('0', { timeout: 5_000 });
});

test('My PRs count reflects fetched PRs', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    // The dashboard stats are updated after PRs are loaded
    // Our fixture has 1 PR
    await expect(window.locator('#totalPRs')).toHaveText('1', { timeout: 10_000 });
});

test('stat tooltip shows on info button click', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const infoBtn = window.locator('.stat-info-btn').first();
    await expect(infoBtn).toBeVisible({ timeout: 5_000 });

    await infoBtn.click();

    // Tooltip should be visible
    const tooltip = window.locator('.stat-tooltip').first();
    await expect(tooltip).toBeVisible();
});
