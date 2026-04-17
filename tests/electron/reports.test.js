jest.mock('fs');

// ─── setup ────────────────────────────────────────────────────────────────────

function setup({ report = null, filePath = null, artifacts = [], getRun = null } = {}) {
    jest.resetModules();

    // Re-require fs after resetModules so tests share the same instance as reports.js
    const fs = require('fs');
    fs.writeFileSync.mockClear();

    const ipcHandlers = {};
    const dialog = { showSaveDialog: jest.fn().mockResolvedValue({ filePath }) };
    const db = {
        getReport: jest.fn(() => report),
        getRun: getRun ?? jest.fn(() => null),
        addSavedReport: jest.fn(),
        getAllSavedReports: jest.fn(() => []),
        deleteSavedReport: jest.fn(),
    };

    jest.doMock('electron', () => ({
        ipcMain: { handle: jest.fn((ch, fn) => { ipcHandlers[ch] = fn; }) },
        dialog,
        shell: { openExternal: jest.fn() },
    }));

    jest.doMock('../../src/core/github', () => ({
        fetchRunArtifacts: jest.fn().mockResolvedValue(artifacts),
    }));

    const { register } = require('../../src/electron/ipc/reports');
    register({ db, getWindow: () => null, getToken: () => 'test-token' });

    return {
        saveReport: (runId) => ipcHandlers['save-report']({}, runId),
        savePRWorkflowReport: (data) => ipcHandlers['save-pr-workflow-report']({}, data),
        fs,
    };
}

// ─── save-report ──────────────────────────────────────────────────────────────

describe('save-report', () => {
    test('returns error when no report in db', async () => {
        const { saveReport, fs } = setup({ report: null });
        expect(await saveReport('123')).toEqual({ error: 'No report available.' });
        expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    test('returns cancelled when dialog is dismissed', async () => {
        const { saveReport, fs } = setup({ report: { name: 'CI', rows: [] } });
        expect(await saveReport('1')).toEqual({ cancelled: true });
        expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    test('writes file and returns saved', async () => {
        const { saveReport, fs } = setup({ filePath: '/tmp/r.md', report: { name: 'CI', rows: [
            { number: 1, url: 'u', conclusion: 'success', started_at: null, completed_at: null, failedTests: [] },
        ]}});
        expect(await saveReport('1')).toEqual({ saved: true });
        expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/r.md', expect.any(String), 'utf8');
    });

    test('flakiness: Stable when all pass', async () => {
        const { saveReport, fs } = setup({ filePath: '/tmp/r.md', report: { name: 'CI', rows: [
            { number: 1, url: 'u', conclusion: 'success', failedTests: [] },
            { number: 2, url: 'u', conclusion: 'success', failedTests: [] },
        ]}});
        await saveReport('1');
        expect(fs.writeFileSync.mock.calls[0][1]).toContain('**Result:** Stable');
    });

    test('flakiness: Probably flaky includes percentage and threshold', async () => {
        const { saveReport, fs } = setup({ filePath: '/tmp/r.md', report: { name: 'CI', rows: [
            { number: 1, url: 'u', conclusion: 'success', failedTests: [] },
            { number: 2, url: 'u', conclusion: 'success', failedTests: [] },
            { number: 3, url: 'u', conclusion: 'failure', failedTests: [] },
        ]}});
        await saveReport('1');
        const content = fs.writeFileSync.mock.calls[0][1];
        expect(content).toContain('Probably flaky — 1 of 3 runs failed (33%)');
        expect(content).toContain('threshold: 2%');
    });

    test('flakiness: Flaky when majority fails', async () => {
        const { saveReport, fs } = setup({ filePath: '/tmp/r.md', report: { name: 'CI', rows: [
            { number: 1, url: 'u', conclusion: 'failure', failedTests: [] },
            { number: 2, url: 'u', conclusion: 'failure', failedTests: [] },
            { number: 3, url: 'u', conclusion: 'success', failedTests: [] },
        ]}});
        await saveReport('1');
        expect(fs.writeFileSync.mock.calls[0][1]).toContain('Flaky — 2 of 3 runs failed (67%)');
    });

    test('includes failed test names in row', async () => {
        const { saveReport, fs } = setup({ filePath: '/tmp/r.md', report: { name: 'CI', rows: [
            { number: 1, url: 'u', conclusion: 'failure', failedTests: ['test_a', 'test_b'] },
        ]}});
        await saveReport('1');
        expect(fs.writeFileSync.mock.calls[0][1]).toContain('test_a, test_b');
    });

    test('shows — for missing timestamps', async () => {
        const { saveReport, fs } = setup({ filePath: '/tmp/r.md', report: { name: 'CI', rows: [
            { number: 1, url: 'u', conclusion: 'success', started_at: null, completed_at: null, failedTests: [] },
        ]}});
        await saveReport('1');
        expect(fs.writeFileSync.mock.calls[0][1]).toContain('| — | — |');
    });

    test('includes Made by SubCat footer with site link', async () => {
        const { saveReport, fs } = setup({ filePath: '/tmp/r.md', report: { name: 'CI', rows: [] } });
        await saveReport('1');
        expect(fs.writeFileSync.mock.calls[0][1]).toContain('subcat.todaywedream.com');
    });

    test('includes Artifacts column header', async () => {
        const { saveReport, fs } = setup({ filePath: '/tmp/r.md', report: { name: 'CI', rows: [
            { number: 1, url: 'u', conclusion: 'success', failedTests: [] },
        ]}});
        await saveReport('1');
        expect(fs.writeFileSync.mock.calls[0][1]).toContain('Artifacts');
    });

    test('shows artifact link for failed run when artifacts available', async () => {
        const artifactUrl = 'https://github.com/o/r/actions/runs/999#artifacts';
        const { saveReport, fs } = setup({
            filePath: '/tmp/r.md',
            artifacts: [{ id: 1, name: 'logs', url: artifactUrl }],
            getRun: jest.fn(() => ({ owner: 'o', repo: 'r' })),
            report: { name: 'CI', rows: [
                { number: 1, url: 'https://github.com/o/r/actions/runs/999', conclusion: 'failure', failedTests: [] },
            ]},
        });
        await saveReport('1');
        expect(fs.writeFileSync.mock.calls[0][1]).toContain('View logs →');
        expect(fs.writeFileSync.mock.calls[0][1]).toContain(artifactUrl);
    });

    test('shows — for artifact when no artifacts available', async () => {
        const { saveReport, fs } = setup({
            filePath: '/tmp/r.md',
            artifacts: [],
            getRun: jest.fn(() => ({ owner: 'o', repo: 'r' })),
            report: { name: 'CI', rows: [
                { number: 1, url: 'https://github.com/o/r/actions/runs/999', conclusion: 'failure', failedTests: [] },
            ]},
        });
        await saveReport('1');
        // artifact cell should be — for runs with no artifacts
        const content = fs.writeFileSync.mock.calls[0][1];
        const tableRows = content.split('\n').filter(l => l.startsWith('| ['));
        expect(tableRows[0]).toMatch(/\| — \|$/);
    });

    test('root cause hints: Non-determinism fallback shown when no keywords match', async () => {
        const { saveReport, fs } = setup({ filePath: '/tmp/r.md', report: { name: 'CI', rows: [
            { number: 1, url: 'u', conclusion: 'success', failedTests: [] },
            { number: 2, url: 'u', conclusion: 'failure', failedTests: ['some unrelated failure'] },
        ]}});
        await saveReport('1');
        expect(fs.writeFileSync.mock.calls[0][1]).toContain('Non-determinism');
    });

    test('root cause hints: Timing detected from test name keywords', async () => {
        const { saveReport, fs } = setup({ filePath: '/tmp/r.md', report: { name: 'CI', rows: [
            { number: 1, url: 'u', conclusion: 'success', failedTests: [] },
            { number: 2, url: 'u', conclusion: 'failure', failedTests: ['Test timed out after 5000ms'] },
        ]}});
        await saveReport('1');
        expect(fs.writeFileSync.mock.calls[0][1]).toContain('Timing');
    });

    test('root cause hints: not shown when all runs pass', async () => {
        const { saveReport, fs } = setup({ filePath: '/tmp/r.md', report: { name: 'CI', rows: [
            { number: 1, url: 'u', conclusion: 'success', failedTests: [] },
            { number: 2, url: 'u', conclusion: 'success', failedTests: [] },
        ]}});
        await saveReport('1');
        expect(fs.writeFileSync.mock.calls[0][1]).not.toContain('Probable root causes');
    });
});

// ─── save-pr-workflow-report ──────────────────────────────────────────────────

describe('save-pr-workflow-report', () => {
    const twoRuns = [
        { conclusion: 'success', status: 'completed', url: 'https://github.com/o/r/runs/1/attempts/2', started_at: '2024-01-01T00:00:00Z', completed_at: '2024-01-01T00:02:30Z' },
        { conclusion: 'failure', status: 'completed', url: 'https://github.com/o/r/runs/1/attempts/1', started_at: null, completed_at: null },
    ];

    test('returns cancelled when dialog is dismissed', async () => {
        const { savePRWorkflowReport, fs } = setup();
        expect(await savePRWorkflowReport({ workflowName: 'CI', runs: twoRuns })).toEqual({ cancelled: true });
        expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    test('writes file and returns saved', async () => {
        const { savePRWorkflowReport, fs } = setup({ filePath: '/tmp/wf.md' });
        expect(await savePRWorkflowReport({ workflowName: 'CI', runs: twoRuns })).toEqual({ saved: true });
        expect(fs.writeFileSync).toHaveBeenCalledWith('/tmp/wf.md', expect.any(String), 'utf8');
    });

    test('includes workflow name as heading', async () => {
        const { savePRWorkflowReport, fs } = setup({ filePath: '/tmp/wf.md' });
        await savePRWorkflowReport({ workflowName: 'My Workflow', runs: twoRuns });
        expect(fs.writeFileSync.mock.calls[0][1]).toContain('# My Workflow');
    });

    test('duration: formats seconds only', async () => {
        const { savePRWorkflowReport, fs } = setup({ filePath: '/tmp/wf.md' });
        await savePRWorkflowReport({ workflowName: 'CI', runs: [
            { conclusion: 'success', status: 'completed', url: 'u', started_at: '2024-01-01T00:00:00Z', completed_at: '2024-01-01T00:00:45Z' },
        ]});
        expect(fs.writeFileSync.mock.calls[0][1]).toContain('45s');
    });

    test('duration: formats minutes and seconds', async () => {
        const { savePRWorkflowReport, fs } = setup({ filePath: '/tmp/wf.md' });
        await savePRWorkflowReport({ workflowName: 'CI', runs: [
            { conclusion: 'success', status: 'completed', url: 'u', started_at: '2024-01-01T00:00:00Z', completed_at: '2024-01-01T00:02:30Z' },
        ]});
        expect(fs.writeFileSync.mock.calls[0][1]).toContain('2m 30s');
    });

    test('duration: shows — when timestamps missing', async () => {
        const { savePRWorkflowReport, fs } = setup({ filePath: '/tmp/wf.md' });
        await savePRWorkflowReport({ workflowName: 'CI', runs: [
            { conclusion: 'failure', status: 'completed', url: 'u', started_at: null, completed_at: null },
        ]});
        expect(fs.writeFileSync.mock.calls[0][1]).toMatch(/\| — \|/);
    });

    test('shows 🔄 for in-progress run', async () => {
        const { savePRWorkflowReport, fs } = setup({ filePath: '/tmp/wf.md' });
        await savePRWorkflowReport({ workflowName: 'CI', runs: [
            { conclusion: null, status: 'in_progress', url: 'u', started_at: null, completed_at: null },
        ]});
        expect(fs.writeFileSync.mock.calls[0][1]).toContain('🔄');
    });

    test('attempt numbers are listed newest-first', async () => {
        const { savePRWorkflowReport, fs } = setup({ filePath: '/tmp/wf.md' });
        await savePRWorkflowReport({ workflowName: 'CI', runs: twoRuns });
        const content = fs.writeFileSync.mock.calls[0][1];
        expect(content.indexOf('#2')).toBeLessThan(content.indexOf('#1'));
    });

    test('includes Made by SubCat footer with site link', async () => {
        const { savePRWorkflowReport, fs } = setup({ filePath: '/tmp/wf.md' });
        await savePRWorkflowReport({ workflowName: 'CI', runs: twoRuns });
        expect(fs.writeFileSync.mock.calls[0][1]).toContain('subcat.todaywedream.com');
    });
});
