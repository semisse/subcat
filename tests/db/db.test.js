jest.mock('electron');
jest.mock('better-sqlite3');

let db;

const RUN = {
    id: '1', currentRunId: '1',
    owner: 'owner', repo: 'repo',
    workflowId: 42, name: 'My Run',
    url: 'https://github.com/owner/repo/actions/runs/1',
    repeatTotal: 3, runNumber: 1,
};

beforeEach(() => {
    jest.resetModules();
    jest.mock('electron');
    jest.mock('better-sqlite3');
    db = require('../../src/db');
});

// ─── schema ───────────────────────────────────────────────────────────────────

describe('schema', () => {
    test('creates tables on first use without throwing', () => {
        expect(() => db.addRun(RUN)).not.toThrow();
    });
});

// ─── addRun / getActiveRuns ───────────────────────────────────────────────────

describe('addRun / getActiveRuns', () => {
    test('persists a run with status watching', () => {
        db.addRun(RUN);
        const runs = db.getActiveRuns();
        expect(runs).toHaveLength(1);
        expect(runs[0]).toMatchObject({ id: '1', owner: 'owner', repo: 'repo', status: 'watching' });
    });

    test('does not return completed runs in getActiveRuns', () => {
        db.addRun(RUN);
        db.updateRun('1', { status: 'completed' });
        expect(db.getActiveRuns()).toHaveLength(0);
    });

    test('workflowId defaults to null when not provided', () => {
        db.addRun({ ...RUN, workflowId: undefined });
        const [run] = db.getActiveRuns();
        expect(run.workflow_id).toBeNull();
    });
});

// ─── updateRun ────────────────────────────────────────────────────────────────

describe('updateRun', () => {
    beforeEach(() => db.addRun(RUN));

    test('updates runNumber', () => {
        db.updateRun('1', { runNumber: 2 });
        const [run] = db.getActiveRuns();
        expect(run.run_number).toBe(2);
    });

    test('updates status to completed', () => {
        db.updateRun('1', { status: 'completed' });
        const all = db.getAllRuns();
        expect(all[0].status).toBe('completed');
    });

    test('is a no-op when called with no fields', () => {
        db.updateRun('1', {});
        const [run] = db.getActiveRuns();
        expect(run.run_number).toBe(1); // unchanged
    });

    test('only updates the specified fields', () => {
        db.updateRun('1', { runNumber: 2 });
        const [run] = db.getActiveRuns();
        expect(run.status).toBe('watching'); // untouched
        expect(run.owner).toBe('owner');      // untouched
    });
});

// ─── addRunResult / getRunResults ─────────────────────────────────────────────

describe('addRunResult / getRunResults', () => {
    beforeEach(() => db.addRun(RUN));

    test('stores and retrieves a result', () => {
        db.addRunResult({ runId: '1', number: 1, conclusion: 'success', url: 'http://x', startedAt: null, completedAt: null, failedTests: [] });
        const results = db.getRunResults('1');
        expect(results).toHaveLength(1);
        expect(results[0]).toMatchObject({ number: 1, conclusion: 'success' });
    });

    test('serialises and deserialises failedTests as JSON', () => {
        const tests = ['AuthService should validate token', 'UserService should return 404'];
        db.addRunResult({ runId: '1', number: 1, conclusion: 'failure', url: null, startedAt: null, completedAt: null, failedTests: tests });
        const [result] = db.getRunResults('1');
        expect(result.failedTests).toEqual(tests);
    });

    test('defaults failedTests to empty array when null', () => {
        db.addRunResult({ runId: '1', number: 1, conclusion: 'success', url: null, startedAt: null, completedAt: null, failedTests: null });
        const [result] = db.getRunResults('1');
        expect(result.failedTests).toEqual([]);
    });

    test('returns results ordered by number', () => {
        db.addRunResult({ runId: '1', number: 3, conclusion: 'success', url: null, startedAt: null, completedAt: null, failedTests: [] });
        db.addRunResult({ runId: '1', number: 1, conclusion: 'failure', url: null, startedAt: null, completedAt: null, failedTests: [] });
        db.addRunResult({ runId: '1', number: 2, conclusion: 'success', url: null, startedAt: null, completedAt: null, failedTests: [] });
        const results = db.getRunResults('1');
        expect(results.map(r => r.number)).toEqual([1, 2, 3]);
    });
});

// ─── getAllRuns ───────────────────────────────────────────────────────────────

describe('getAllRuns', () => {
    test('returns both watching and completed runs', () => {
        db.addRun(RUN);
        db.addRun({ ...RUN, id: '2' });
        db.updateRun('2', { status: 'completed' });
        expect(db.getAllRuns()).toHaveLength(2);
    });
});

// ─── getRun ───────────────────────────────────────────────────────────────────

describe('getRun', () => {
    test('returns null for an unknown id', () => {
        expect(db.getRun('nonexistent')).toBeNull();
    });

    test('returns the run when it exists', () => {
        db.addRun(RUN);
        const run = db.getRun('1');
        expect(run).not.toBeNull();
        expect(run.id).toBe('1');
        expect(run.owner).toBe('owner');
    });

    test('throws on duplicate id (UNIQUE constraint)', () => {
        db.addRun(RUN);
        expect(() => db.addRun(RUN)).toThrow(/UNIQUE constraint failed/);
    });
});

// ─── removeRun ────────────────────────────────────────────────────────────────

describe('removeRun', () => {
    test('deletes the run', () => {
        db.addRun(RUN);
        db.removeRun('1');
        expect(db.getAllRuns()).toHaveLength(0);
    });

    test('cascades to run_results', () => {
        db.addRun(RUN);
        db.addRunResult({ runId: '1', number: 1, conclusion: 'success', url: null, startedAt: null, completedAt: null, failedTests: [] });
        db.removeRun('1');
        expect(db.getRunResults('1')).toHaveLength(0);
    });
});

// ─── clearRunResults ──────────────────────────────────────────────────────────

describe('clearRunResults', () => {
    beforeEach(() => db.addRun(RUN));

    test('removes all results for a run', () => {
        db.addRunResult({ runId: '1', number: 1, conclusion: 'success', url: null, startedAt: null, completedAt: null, failedTests: [] });
        db.addRunResult({ runId: '1', number: 2, conclusion: 'failure', url: null, startedAt: null, completedAt: null, failedTests: [] });
        db.clearRunResults('1');
        expect(db.getRunResults('1')).toHaveLength(0);
    });

    test('does not remove the run itself', () => {
        db.addRunResult({ runId: '1', number: 1, conclusion: 'success', url: null, startedAt: null, completedAt: null, failedTests: [] });
        db.clearRunResults('1');
        expect(db.getRun('1')).not.toBeNull();
    });

    test('is a no-op when there are no results', () => {
        expect(() => db.clearRunResults('1')).not.toThrow();
        expect(db.getRunResults('1')).toHaveLength(0);
    });
});

// ─── pending_reruns ───────────────────────────────────────────────────────────

describe('savePendingRerun / getPendingRerun / deletePendingRerun', () => {
    const RERUN = { owner: 'owner', repo: 'repo', runId: '99', fromAttempt: 2, total: 5 };

    test('saves and retrieves a pending rerun', () => {
        db.savePendingRerun(RERUN);
        const result = db.getPendingRerun({ owner: 'owner', repo: 'repo', runId: '99' });
        expect(result).toMatchObject({ owner: 'owner', repo: 'repo', run_id: '99', from_attempt: 2, total: 5 });
    });

    test('returns null when no pending rerun exists', () => {
        expect(db.getPendingRerun({ owner: 'owner', repo: 'repo', runId: 'nonexistent' })).toBeNull();
    });

    test('upserts on duplicate id', () => {
        db.savePendingRerun(RERUN);
        db.savePendingRerun({ ...RERUN, fromAttempt: 3 });
        const result = db.getPendingRerun({ owner: 'owner', repo: 'repo', runId: '99' });
        expect(result.from_attempt).toBe(3);
    });

    test('deletes a pending rerun', () => {
        db.savePendingRerun(RERUN);
        db.deletePendingRerun({ owner: 'owner', repo: 'repo', runId: '99' });
        expect(db.getPendingRerun({ owner: 'owner', repo: 'repo', runId: '99' })).toBeNull();
    });

    test('delete is a no-op when entry does not exist', () => {
        expect(() => db.deletePendingRerun({ owner: 'owner', repo: 'repo', runId: 'ghost' })).not.toThrow();
    });
});

// ─── getReport ────────────────────────────────────────────────────────────────

describe('getReport', () => {
    test('returns null for unknown runId', () => {
        expect(db.getReport('unknown')).toBeNull();
    });

    test('returns name and rows for a known run', () => {
        db.addRun(RUN);
        db.addRunResult({ runId: '1', number: 1, conclusion: 'success', url: 'http://x', startedAt: null, completedAt: null, failedTests: [] });
        const report = db.getReport('1');
        expect(report.name).toBe('My Run');
        expect(report.rows).toHaveLength(1);
        expect(report.rows[0].conclusion).toBe('success');
    });
});

// ─── pinned_workflows ────────────────────────────────────────────────────────

describe('pinned_workflows', () => {
    const PINNED = {
        id: 'owner/repo/ci.yml',
        owner: 'owner',
        repo: 'repo',
        workflowFile: 'ci.yml',
        name: 'CI',
        url: 'https://github.com/owner/repo/actions/workflows/ci.yml',
    };

    test('addPinnedWorkflow persists and getAllPinnedWorkflows retrieves', () => {
        db.addPinnedWorkflow(PINNED);
        const all = db.getAllPinnedWorkflows();
        expect(all).toHaveLength(1);
        expect(all[0]).toMatchObject({ id: 'owner/repo/ci.yml', owner: 'owner', repo: 'repo', name: 'CI' });
    });

    test('getPinnedWorkflow returns a single workflow by id', () => {
        db.addPinnedWorkflow(PINNED);
        const pw = db.getPinnedWorkflow('owner/repo/ci.yml');
        expect(pw).not.toBeNull();
        expect(pw.workflow_file).toBe('ci.yml');
    });

    test('getPinnedWorkflow returns null for unknown id', () => {
        expect(db.getPinnedWorkflow('nonexistent')).toBeNull();
    });

    test('updatePinnedWorkflow updates selected fields', () => {
        db.addPinnedWorkflow(PINNED);
        db.updatePinnedWorkflow('owner/repo/ci.yml', {
            latestRunId: '100',
            latestRunStatus: 'completed',
            latestRunConclusion: 'success',
            latestRunUrl: 'https://github.com/owner/repo/actions/runs/100',
        });
        const pw = db.getPinnedWorkflow('owner/repo/ci.yml');
        expect(pw.latest_run_id).toBe('100');
        expect(pw.latest_run_status).toBe('completed');
        expect(pw.latest_run_conclusion).toBe('success');
    });

    test('updatePinnedWorkflow is a no-op with empty fields', () => {
        db.addPinnedWorkflow(PINNED);
        db.updatePinnedWorkflow('owner/repo/ci.yml', {});
        const pw = db.getPinnedWorkflow('owner/repo/ci.yml');
        expect(pw.name).toBe('CI');
    });

    test('removePinnedWorkflow deletes the workflow', () => {
        db.addPinnedWorkflow(PINNED);
        db.removePinnedWorkflow('owner/repo/ci.yml');
        expect(db.getAllPinnedWorkflows()).toHaveLength(0);
    });

    test('latestRun fields default to null', () => {
        db.addPinnedWorkflow(PINNED);
        const pw = db.getPinnedWorkflow('owner/repo/ci.yml');
        expect(pw.latest_run_id).toBeNull();
        expect(pw.latest_run_status).toBeNull();
        expect(pw.latest_run_conclusion).toBeNull();
    });

    test('getAllPinnedWorkflows returns multiple entries', () => {
        db.addPinnedWorkflow(PINNED);
        db.addPinnedWorkflow({ ...PINNED, id: 'owner/repo/lint.yml', workflowFile: 'lint.yml', name: 'Lint' });
        const all = db.getAllPinnedWorkflows();
        expect(all).toHaveLength(2);
        expect(all.map(p => p.name).sort()).toEqual(['CI', 'Lint']);
    });
});

// ─── notifications ───────────────────────────────────────────────────────────

describe('notifications', () => {
    const NOTIF = {
        title: 'CI completed',
        body: 'owner/repo — success',
        url: 'https://github.com/owner/repo/actions/runs/1',
        conclusion: 'success',
        runName: 'CI',
    };

    test('addNotification persists and getNotifications retrieves', () => {
        db.addNotification(NOTIF);
        const all = db.getNotifications();
        expect(all).toHaveLength(1);
        expect(all[0]).toMatchObject({ title: 'CI completed', conclusion: 'success', run_name: 'CI' });
    });

    test('getUnreadNotificationCount returns count of unread', () => {
        db.addNotification(NOTIF);
        db.addNotification({ ...NOTIF, title: 'Second' });
        expect(db.getUnreadNotificationCount()).toBe(2);
    });

    test('markAllNotificationsRead sets all to read', () => {
        db.addNotification(NOTIF);
        db.addNotification({ ...NOTIF, title: 'Second' });
        db.markAllNotificationsRead();
        expect(db.getUnreadNotificationCount()).toBe(0);
    });

    test('clearNotifications removes all notifications', () => {
        db.addNotification(NOTIF);
        db.addNotification({ ...NOTIF, title: 'Second' });
        db.clearNotifications();
        expect(db.getNotifications()).toHaveLength(0);
    });

    test('url defaults to null when not provided', () => {
        db.addNotification({ ...NOTIF, url: undefined });
        const [n] = db.getNotifications();
        expect(n.url).toBeNull();
    });

    test('getNotifications respects limit', () => {
        for (let i = 0; i < 5; i++) db.addNotification({ ...NOTIF, title: `N${i}` });
        expect(db.getNotifications(3)).toHaveLength(3);
    });

    test('getNotifications returns multiple entries', () => {
        db.addNotification({ ...NOTIF, title: 'First' });
        db.addNotification({ ...NOTIF, title: 'Second' });
        const all = db.getNotifications();
        expect(all).toHaveLength(2);
    });
});

// ─── local_runs ──────────────────────────────────────────────────────────────

describe('local_runs', () => {
    const LOCAL = { repoPath: '/tmp/repo', testCommand: 'npm test', cpus: 2, memoryGb: 4, repeat: 10 };

    test('insertLocalRun returns an id and getLocalRuns retrieves it', () => {
        const id = db.insertLocalRun(LOCAL);
        expect(id).toBeDefined();
        const runs = db.getLocalRuns();
        expect(runs).toHaveLength(1);
        expect(runs[0]).toMatchObject({ repo_path: '/tmp/repo', test_command: 'npm test', repeat_count: 10 });
    });

    test('getLocalRun returns a single run by id', () => {
        const id = db.insertLocalRun(LOCAL);
        const run = db.getLocalRun(id);
        expect(run).not.toBeNull();
        expect(run.cpus).toBe(2);
    });

    test('getLocalRun returns null for unknown id', () => {
        expect(db.getLocalRun(99999)).toBeNull();
    });

    test('updateLocalRun updates selected fields', () => {
        const id = db.insertLocalRun(LOCAL);
        db.updateLocalRun(id, { status: 'completed', passed: 8, failed: 2, flaky: 1, failedTestNames: ['test A'], completedAt: '2026-01-01T00:00:00Z' });
        const run = db.getLocalRun(id);
        expect(run.status).toBe('completed');
        expect(run.passed).toBe(8);
        expect(run.failed).toBe(2);
        expect(run.flaky).toBe(1);
        expect(JSON.parse(run.failed_test_names)).toEqual(['test A']);
    });

    test('updateLocalRun is a no-op with empty fields', () => {
        const id = db.insertLocalRun(LOCAL);
        db.updateLocalRun(id, {});
        const run = db.getLocalRun(id);
        expect(run.status).toBe('running');
    });

    test('deleteLocalRun removes the run', () => {
        const id = db.insertLocalRun(LOCAL);
        db.deleteLocalRun(id);
        expect(db.getLocalRun(id)).toBeNull();
    });

    test('getLocalRuns respects limit', () => {
        for (let i = 0; i < 5; i++) db.insertLocalRun(LOCAL);
        expect(db.getLocalRuns(3)).toHaveLength(3);
    });

    test('default status is running', () => {
        const id = db.insertLocalRun(LOCAL);
        const run = db.getLocalRun(id);
        expect(run.status).toBe('running');
    });
});

// ─── getLabRuns ──────────────────────────────────────────────────────────────

describe('getLabRuns', () => {
    test('returns runs with aggregated result counts', () => {
        db.addRun(RUN);
        db.addRunResult({ runId: '1', number: 1, conclusion: 'success', url: null, startedAt: null, completedAt: null, failedTests: [] });
        db.addRunResult({ runId: '1', number: 2, conclusion: 'failure', url: null, startedAt: null, completedAt: null, failedTests: [] });
        db.addRunResult({ runId: '1', number: 3, conclusion: 'success', url: null, startedAt: null, completedAt: null, failedTests: [] });
        const labs = db.getLabRuns();
        expect(labs).toHaveLength(1);
        expect(labs[0].completed_count).toBe(3);
        expect(labs[0].passed_count).toBe(2);
        expect(labs[0].failed_count).toBe(1);
    });

    test('returns zero counts for run with no results', () => {
        db.addRun(RUN);
        const labs = db.getLabRuns();
        expect(labs).toHaveLength(1);
        expect(labs[0].completed_count).toBe(0);
        expect(labs[0].passed_count).toBe(0);
        expect(labs[0].failed_count).toBe(0);
    });
});
