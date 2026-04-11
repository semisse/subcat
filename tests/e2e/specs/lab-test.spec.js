// lab-test.spec.js — Lab Test page smoke tests.
// Verifies navigation, form elements, docker status check, and empty history.
// Does NOT test the full run flow (requires Docker + real container).

const { test, expect } = require('../fixtures');
const { baseFixtures } = require('../data');

test.use({ authToken: 'gho_faketoken_e2e' });

test.beforeEach(async ({ mockServer }) => {
    mockServer.setFixtures(baseFixtures());
});

test('Lab Test nav item navigates to page', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await window.locator('.nav-item[data-page="lab-test"]').click();
    await expect(window.locator('#pageLabtest')).toHaveClass(/active/);
});

test('Lab Test page renders form elements', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await window.locator('.nav-item[data-page="lab-test"]').click();

    await expect(window.locator('#labTestRepoPath')).toBeVisible();
    await expect(window.locator('#labTestCommand')).toBeVisible();
    await expect(window.locator('#labTestRepeat')).toBeVisible();
    await expect(window.locator('#labTestRunBtn')).toBeVisible();
    await expect(window.locator('.lab-test-warning')).toBeVisible();
});

test('Docker status check completes and updates UI', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await window.locator('.nav-item[data-page="lab-test"]').click();

    // Wait for the async docker check to resolve (replaces "Checking Docker…")
    const statusEl = window.locator('#labTestDockerStatus');
    await expect(statusEl).not.toHaveText('Checking Docker…', { timeout: 8000 });

    // Result is either available or not — both are valid on CI
    const text = await statusEl.textContent();
    expect(text).toMatch(/Docker:/);
});

test('history section is empty on first load', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await window.locator('.nav-item[data-page="lab-test"]').click();

    // Fresh E2E db has no local_runs — history container should be empty
    const history = window.locator('#labTestHistory');
    await expect(history).toBeEmpty({ timeout: 5000 });
});
