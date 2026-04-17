// run-lifecycle.spec.js — Run management: stop watching, cancel, rerun.
// Tests run card actions beyond the basic watch+complete flow.
//
// NOTE: Run cards are duplicated — one in the dashboard section (#sectionRunsItems)
// and one cloned into #runsListPage. Only the dashboard card is updated by
// updateRunCard() (getElementById finds the first match). Tests that check
// status transitions must use the dashboard card.

const { test, expect } = require('../fixtures');
const { baseFixtures, RUN_IN_PROGRESS, RUN_COMPLETED } = require('../data');

test.use({ authToken: 'gho_faketoken_e2e' });

async function goToRunsPage(window) {
    await window.locator('.nav-item[data-page="runs"]').click();
    await expect(window.locator('#pageRuns')).toHaveClass(/active/);
}

async function watchRun(window, runUrl) {
    await goToRunsPage(window);
    await window.locator('#watchDockTrigger').click();
    await window.locator('#urlInput').fill(runUrl);
    await window.locator('#watchBtn').click();

    const card = window.locator('#pageRuns .run-card').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    return card;
}

test.describe('stop watching', () => {
    test.beforeEach(async ({ mockServer }) => {
        mockServer.setFixtures({
            ...baseFixtures(),
            'GET /repos/:owner/:repo/actions/runs/:runId': { status: 200, body: RUN_IN_PROGRESS },
            'GET /repos/:owner/:repo/actions/runs/:runId/jobs': { status: 200, body: { jobs: [] } },
        });
    });

    test('remove button is visible on run cards', async ({ electronApp }) => {
        const window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');

        const card = await watchRun(window, 'https://github.com/owner/repo/actions/runs/99999');

        const removeBtn = card.locator('.remove-btn');
        await expect(removeBtn).toBeVisible();
    });

    test('clicking remove on active run stops watching and removes card', async ({ electronApp }) => {
        const window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');

        const card = await watchRun(window, 'https://github.com/owner/repo/actions/runs/99999');

        // confirm-dialog auto-confirms in E2E mode
        await card.locator('.remove-btn').click();

        await expect(window.locator('#pageRuns .run-card')).toHaveCount(0, { timeout: 5_000 });
    });
});

test.describe('cancel run', () => {
    test.beforeEach(async ({ mockServer }) => {
        mockServer.setFixtures({
            ...baseFixtures(),
            'GET /repos/:owner/:repo/actions/runs/:runId': { status: 200, body: RUN_IN_PROGRESS },
            'GET /repos/:owner/:repo/actions/runs/:runId/jobs': { status: 200, body: { jobs: [] } },
            'POST /repos/:owner/:repo/actions/runs/:runId/cancel': { status: 202, body: {} },
        });
    });

    test('cancel button is visible on in-progress run card', async ({ electronApp }) => {
        const window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');

        const card = await watchRun(window, 'https://github.com/owner/repo/actions/runs/99999');

        const cancelBtn = card.locator('.cancel-run-btn');
        await expect(cancelBtn).toBeVisible();
        await expect(cancelBtn).toHaveText('Stop');
    });

    test('clicking cancel removes the run card', async ({ electronApp }) => {
        const window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');

        const card = await watchRun(window, 'https://github.com/owner/repo/actions/runs/99999');

        await card.locator('.cancel-run-btn').click();

        await expect(window.locator('#pageRuns .run-card')).toHaveCount(0, { timeout: 5_000 });
    });
});

test.describe('rerun', () => {
    test.beforeEach(async ({ mockServer }) => {
        // In-progress → completed via poller.
        mockServer.setFixtures({
            ...baseFixtures(),
            'GET /repos/:owner/:repo/actions/runs/:runId': [
                { status: 200, body: RUN_IN_PROGRESS },
                { status: 200, body: RUN_COMPLETED },
            ],
            'GET /repos/:owner/:repo/actions/runs/:runId/jobs': { status: 200, body: { jobs: [] } },
            'POST /repos/:owner/:repo/actions/runs/:runId/rerun': { status: 201, body: {} },
        });
    });

    test('rerun button appears on dashboard card after run completes', async ({ electronApp }) => {
        const window = await electronApp.firstWindow();
        await window.waitForLoadState('domcontentloaded');

        await watchRun(window, 'https://github.com/owner/repo/actions/runs/12345');

        // The dashboard card (getElementById target) gets updated by the poller.
        // Navigate to dashboard to see it.
        await window.locator('.nav-item[data-page="home"]').click();

        // Two elements share the same ID (dashboard + runs page clone), scope to dashboard.
        const dashboardCard = window.locator('#sectionRunsItems #run-12345');
        await expect(dashboardCard).toHaveClass(/completed/, { timeout: 15_000 });

        const rerunBtn = dashboardCard.locator('.rerun-btn');
        await expect(rerunBtn).toBeVisible({ timeout: 5_000 });
        await expect(rerunBtn).toContainText('Rerun');
    });
});
