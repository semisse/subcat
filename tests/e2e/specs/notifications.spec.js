// notifications.spec.js — Notification center: badge, panel, mark read, clear.
// A run that transitions from in-progress to completed via the poller triggers
// a notification (the poller fires 'run:repeat-done' → addNotification).
//
// NOTE: Run cards are duplicated (dashboard section + runs page clone).
// Only the dashboard card (#run-{id}) is updated by updateRunCard.
// We check the dashboard card for completion status.

const { test, expect } = require('../fixtures');
const { baseFixtures, RUN_IN_PROGRESS, RUN_COMPLETED } = require('../data');

test.use({ authToken: 'gho_faketoken_e2e' });

// Fixtures where the run starts in-progress, then completes on second poll.
function notificationFixtures() {
    return {
        ...baseFixtures(),
        'GET /repos/:owner/:repo/actions/runs/:runId': [
            { status: 200, body: RUN_IN_PROGRESS },
            { status: 200, body: RUN_COMPLETED },
        ],
        'GET /repos/:owner/:repo/actions/runs/:runId/jobs': { status: 200, body: { jobs: [] } },
    };
}

async function watchAndWaitForCompletion(window) {
    // Watch run from the runs page
    await window.locator('.nav-item[data-page="runs"]').click();
    await window.locator('#watchDockTrigger').click();
    await window.locator('#urlInput').fill('https://github.com/owner/repo/actions/runs/12345');
    await window.locator('#watchBtn').click();

    const card = window.locator('#pageRuns .run-card').first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    // Wait for completion by checking the dashboard card (which gets updated).
    // Two elements share the same ID (dashboard + runs page clone), use .first().
    const dashboardCard = window.locator('#sectionRunsItems #run-12345');
    await expect(dashboardCard).toHaveClass(/completed/, { timeout: 15_000 });
}

test.describe('notification badge and panel', () => {
    test.beforeEach(async ({ mockServer }) => {
        mockServer.setFixtures(notificationFixtures());
    });

    test('notification badge appears after poller completes a run', async ({ electronApp }) => {
        const window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');

        await watchAndWaitForCompletion(window);

        const badge = window.locator('#notifBadge');
        await expect(badge).toBeVisible({ timeout: 5_000 });
    });

    test('notification panel shows the completed run', async ({ electronApp }) => {
        const window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');

        await watchAndWaitForCompletion(window);

        await window.locator('#notifBtn').click();
        await expect(window.locator('#notifPanel')).toHaveClass(/open/);

        const item = window.locator('.notif-item').first();
        await expect(item).toBeVisible();
        await expect(item).toContainText('CI / Build');
    });

    test('opening panel marks notifications as read and hides badge', async ({ electronApp }) => {
        const window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');

        await watchAndWaitForCompletion(window);

        const badge = window.locator('#notifBadge');
        await expect(badge).toBeVisible({ timeout: 5_000 });

        await window.locator('#notifBtn').click();
        await expect(window.locator('#notifPanel')).toHaveClass(/open/);

        await expect(badge).not.toBeVisible({ timeout: 5_000 });
    });

    test('clear button removes all notifications', async ({ electronApp }) => {
        const window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');

        await watchAndWaitForCompletion(window);

        await window.locator('#notifBtn').click();
        await expect(window.locator('.notif-item').first()).toBeVisible();

        await window.locator('#notifClear').click();

        await expect(window.locator('.notif-item')).toHaveCount(0);
    });
});

test.describe('panel toggle', () => {
    test.beforeEach(async ({ mockServer }) => {
        mockServer.setFixtures(baseFixtures());
    });

    test('notification panel opens on bell click', async ({ electronApp }) => {
        const window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');

        await window.locator('#notifBtn').click();
        await expect(window.locator('#notifPanel')).toHaveClass(/open/);
    });

    test('notification panel closes on second bell click', async ({ electronApp }) => {
        const window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');

        await window.locator('#notifBtn').click();
        await expect(window.locator('#notifPanel')).toHaveClass(/open/);

        await window.locator('#notifBtn').click();
        await expect(window.locator('#notifPanel')).not.toHaveClass(/open/);
    });
});
