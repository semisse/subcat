// pr-drilldown.spec.js — My PRs list + PR drilldown to workflow runs.

const { test, expect } = require('../fixtures');
const { prDrilldownFixtures } = require('../data');

test.use({ authToken: 'gho_faketoken_e2e' });

test.beforeEach(async ({ mockServer }) => {
    mockServer.setFixtures(prDrilldownFixtures());
});

test('My PRs nav item shows the PRs page', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await window.locator('.nav-item[data-page="my-prs"]').click();
    await expect(window.locator('#pageMyprs')).toHaveClass(/active/);
});

test('My PRs list loads and shows open PRs', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await window.locator('.nav-item[data-page="my-prs"]').click();

    // Wait for the PR item to appear (loadUserPRs makes a real IPC → github call)
    await expect(window.locator('.my-pr-item').first()).toBeVisible({ timeout: 10_000 });
    await expect(window.locator('.my-pr-item').first()).toContainText('Add feature X');
});

test('clicking a PR shows its CI workflow runs', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await window.locator('.nav-item[data-page="my-prs"]').click();
    await expect(window.locator('.my-pr-item').first()).toBeVisible({ timeout: 10_000 });

    await window.locator('.my-pr-item').first().click();

    // PR detail view becomes active and shows at least one workflow run
    await expect(window.locator('#prDetailView')).toHaveClass(/active/, { timeout: 10_000 });
    await expect(window.locator('#prDetailList .pr-detail-run').first()).toBeVisible({ timeout: 10_000 });
    await expect(window.locator('#prDetailList .pr-detail-run').first()).toContainText('CI');
});

test('back button returns to PR list from PR detail', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await window.locator('.nav-item[data-page="my-prs"]').click();
    await expect(window.locator('.my-pr-item').first()).toBeVisible({ timeout: 10_000 });
    await window.locator('.my-pr-item').first().click();
    await expect(window.locator('#prDetailView')).toHaveClass(/active/, { timeout: 10_000 });

    await window.locator('#prDetailBack').click();
    await expect(window.locator('#prListView')).toHaveClass(/active/);
});
