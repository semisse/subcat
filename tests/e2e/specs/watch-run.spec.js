// watch-run.spec.js — Watch dock + run card creation.
// Submitting a run URL via the watch form should produce a run card.
// The watch dock trigger lives inside #pageRuns, so tests navigate there first.

const { test, expect } = require('../fixtures');
const { watchRunFixtures } = require('../data');

test.use({ authToken: 'gho_faketoken_e2e' });

test.beforeEach(async ({ mockServer }) => {
    mockServer.setFixtures(watchRunFixtures());
});

async function goToRunsPage(window) {
    await window.locator('.nav-item[data-page="runs"]').click();
    await expect(window.locator('#pageRuns')).toHaveClass(/active/);
}

test('watch dock opens when clicking the trigger', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await goToRunsPage(window);
    await window.locator('#watchDockTrigger').click();
    await expect(window.locator('#urlForm')).toBeVisible();
});

test('watch dock closes on Cancel', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await goToRunsPage(window);
    await window.locator('#watchDockTrigger').click();
    await expect(window.locator('#urlForm')).toBeVisible();

    await window.locator('#urlFormClose').click();
    await expect(window.locator('#urlForm')).not.toBeVisible();
});

test('watch dock closes on Escape', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await goToRunsPage(window);
    await window.locator('#watchDockTrigger').click();
    await expect(window.locator('#urlForm')).toBeVisible();

    await window.keyboard.press('Escape');
    await expect(window.locator('#urlForm')).not.toBeVisible();
});

test('submitting a run URL creates a run card with the correct name', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await goToRunsPage(window);
    await window.locator('#watchDockTrigger').click();
    await window.locator('#urlInput').fill('https://github.com/owner/repo/actions/runs/12345');
    await window.locator('#watchBtn').click();

    // Run card appears in the Runs page list
    const card = window.locator('#pageRuns .run-card').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toContainText('CI / Build');
});

test('completed run card shows success status', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await goToRunsPage(window);
    await window.locator('#watchDockTrigger').click();
    await window.locator('#urlInput').fill('https://github.com/owner/repo/actions/runs/12345');
    await window.locator('#watchBtn').click();

    const card = window.locator('#pageRuns .run-card').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toHaveClass(/completed-success/);
});

test('watch dock closes after successful submission', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await goToRunsPage(window);
    await window.locator('#watchDockTrigger').click();
    await window.locator('#urlInput').fill('https://github.com/owner/repo/actions/runs/12345');
    await window.locator('#watchBtn').click();

    await expect(window.locator('#pageRuns .run-card').first()).toBeVisible({ timeout: 10_000 });
    await expect(window.locator('#urlForm')).not.toBeVisible();
});
