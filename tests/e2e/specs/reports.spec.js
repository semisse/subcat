// reports.spec.js — Reports page: list, view, delete.
// Note: saving a report requires dialog.showSaveDialog which can't be tested
// in E2E. We test the reports list and viewer with pre-existing DB data.

const { test, expect } = require('../fixtures');
const { baseFixtures } = require('../data');

test.use({ authToken: 'gho_faketoken_e2e' });

test.beforeEach(async ({ mockServer }) => {
    mockServer.setFixtures(baseFixtures());
});

test('reports page navigates and shows empty state', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await window.locator('.nav-item[data-page="reports"]').click();
    await expect(window.locator('#pageReports')).toHaveClass(/active/);

    // Fresh E2E db has no saved reports
    const list = window.locator('#savedReportsList');
    await expect(list).toBeVisible();

    // Either empty or shows empty state text
    const count = await list.locator('.saved-report-item').count();
    expect(count).toBe(0);
});

test('reports list view is the default view', async ({ electronApp }) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await window.locator('.nav-item[data-page="reports"]').click();

    await expect(window.locator('#reportsListView')).toBeVisible();
});
