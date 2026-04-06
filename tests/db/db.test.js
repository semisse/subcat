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
