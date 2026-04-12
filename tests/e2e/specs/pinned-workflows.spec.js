// pinned-workflows.spec.js — Pin a workflow, verify card, unpin.
// Pins via the watch dock (entering a workflow URL switches to "Pin" mode).

const { test, expect } = require('../fixtures');
const { pinnedWorkflowFixtures } = require('../data');

test.use({ authToken: 'gho_faketoken_e2e' });

test.beforeEach(async ({ mockServer }) => {
    mockServer.setFixtures(pinnedWorkflowFixtures());
});

const WORKFLOW_URL = 'https://github.com/owner/repo/actions/workflows/ci.yml';

async function goToRunsPage(window) {
    await window.locator('.nav-item[data-page="runs"]').click();
    await expect(window.locator('#pageRuns')).toHaveClass(/active/);
}

async function pinWorkflow(window) {
    await goToRunsPage(window);
    await window.locator('#watchDockTrigger').click();
    await window.locator('#urlInput').fill(WORKFLOW_URL);

    // Button should switch to "Pin" for workflow URLs
    await expect(window.locator('#watchBtn')).toHaveText('Pin');

    await window.locator('#watchBtn').click();
}

test('typing a workflow URL changes button to Pin', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await goToRunsPage(window);
    await window.locator('#watchDockTrigger').click();
    await window.locator('#urlInput').fill(WORKFLOW_URL);

    await expect(window.locator('#watchBtn')).toHaveText('Pin');
});

test('pinning a workflow creates a pinned card on the dashboard', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await pinWorkflow(window);

    // Navigate to dashboard to see pinned section
    await window.locator('.nav-item[data-page="home"]').click();

    const card = window.locator('.pinned-card').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toContainText('CI');
});

test('pinned card shows the latest run status', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await pinWorkflow(window);

    await window.locator('.nav-item[data-page="home"]').click();

    const card = window.locator('.pinned-card').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toHaveClass(/completed-success/);
});

test('unpinning removes the card from the dashboard', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await pinWorkflow(window);

    await window.locator('.nav-item[data-page="home"]').click();

    const card = window.locator('.pinned-card').first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Click the remove button on the pinned card
    await card.locator('.remove-btn').click();

    await expect(window.locator('.pinned-card')).toHaveCount(0);
});

test('watch dock closes after pinning', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await pinWorkflow(window);

    await expect(window.locator('#urlForm')).not.toBeVisible();
});
