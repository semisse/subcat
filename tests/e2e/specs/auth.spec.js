// auth.spec.js — Login window smoke tests.
// No authToken → app opens login.html.

const { test, expect } = require('../fixtures');

test('shows login window when no token is stored', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await expect(window).toHaveURL(/login\.html/);
    await expect(window.locator('#loginBtn')).toBeVisible();
});

test('login window has GitHub sign-in button', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    const btn = window.locator('#loginBtn');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText(/Login|GitHub|Sign in/i);
});
