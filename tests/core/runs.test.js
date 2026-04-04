jest.mock('../../src/core/github');
const github = require('../../src/core/github');
const { rerunRun, rerunFailedRun, stopWatching, cancelRunHandler, resumeRuns } = require('../../src/core/runs');

function makeDb(overrides = {}) {
    return {
        getRun: jest.fn(),
        getAllRuns: jest.fn(() => []),
        getRunResults: jest.fn(() => []),
        addRun: jest.fn(),
        addRunResult: jest.fn(),
        updateRun: jest.fn(),
        removeRun: jest.fn(),
        clearRunResults: jest.fn(),
        ...overrides,
    };
}

function makePoller(overrides = {}) {
    return {
        start: jest.fn(),
        stop: jest.fn(),
        deactivate: jest.fn(),
        isActive: jest.fn(() => false),
        ...overrides,
    };
}

const RUN = {
    id: '42', current_run_id: '42',
    owner: 'owner', repo: 'repo',
    name: 'My Workflow',
    url: 'https://github.com/owner/repo/actions/runs/42',
    repeat_total: 3,
};

// ─── rerunRun ─────────────────────────────────────────────────────────────────

describe('rerunRun', () => {
    test('returns error when run not found', async () => {
        const db = makeDb({ getRun: jest.fn(() => null) });
        const result = await rerunRun('42', { db, poller: makePoller(), getToken: () => 'tok' });
        expect(result).toEqual({ error: 'Run not found.' });
    });

    test('clears previous results before updating run status', async () => {
        const db = makeDb({ getRun: jest.fn(() => RUN) });
        github.rerunWorkflow.mockResolvedValue(undefined);
        const order = [];
        db.clearRunResults.mockImplementation(() => order.push('clear'));
        db.updateRun.mockImplementation(() => order.push('update'));

        await rerunRun('42', { db, poller: makePoller(), getToken: () => 'tok' });

        expect(order).toEqual(['clear', 'update']);
    });

    test('clears results for the correct runId', async () => {
        const db = makeDb({ getRun: jest.fn(() => RUN) });
        github.rerunWorkflow.mockResolvedValue(undefined);

        await rerunRun('42', { db, poller: makePoller(), getToken: () => 'tok' });

        expect(db.clearRunResults).toHaveBeenCalledWith('42');
    });

    test('resets run status to watching with runNumber 1', async () => {
        const db = makeDb({ getRun: jest.fn(() => RUN) });
        github.rerunWorkflow.mockResolvedValue(undefined);

        await rerunRun('42', { db, poller: makePoller(), getToken: () => 'tok' });

        expect(db.updateRun).toHaveBeenCalledWith('42', { status: 'watching', runNumber: 1 });
    });

    test('starts poller after clearing results', async () => {
        const db = makeDb({ getRun: jest.fn(() => RUN) });
        const poller = makePoller();
        github.rerunWorkflow.mockResolvedValue(undefined);

        await rerunRun('42', { db, poller, getToken: () => 'tok' });

        expect(poller.start).toHaveBeenCalled();
    });

    test('returns error without clearing if rerunWorkflow throws', async () => {
        const db = makeDb({ getRun: jest.fn(() => RUN) });
        github.rerunWorkflow.mockRejectedValue(new Error('API error'));

        const result = await rerunRun('42', { db, poller: makePoller(), getToken: () => 'tok' });

        expect(result).toEqual({ error: 'API error' });
        expect(db.clearRunResults).not.toHaveBeenCalled();
    });
});

// ─── rerunFailedRun ───────────────────────────────────────────────────────────

describe('rerunFailedRun', () => {
    test('returns error when run not found', async () => {
        const db = makeDb({ getRun: jest.fn(() => null) });
        const result = await rerunFailedRun('42', { db, poller: makePoller(), getToken: () => 'tok' });
        expect(result).toEqual({ error: 'Run not found.' });
    });

    test('clears previous results before updating run status', async () => {
        const db = makeDb({ getRun: jest.fn(() => RUN) });
        github.rerunFailedJobs.mockResolvedValue(undefined);
        const order = [];
        db.clearRunResults.mockImplementation(() => order.push('clear'));
        db.updateRun.mockImplementation(() => order.push('update'));

        await rerunFailedRun('42', { db, poller: makePoller(), getToken: () => 'tok' });

        expect(order).toEqual(['clear', 'update']);
    });

    test('clears results for the correct runId', async () => {
        const db = makeDb({ getRun: jest.fn(() => RUN) });
        github.rerunFailedJobs.mockResolvedValue(undefined);

        await rerunFailedRun('42', { db, poller: makePoller(), getToken: () => 'tok' });

        expect(db.clearRunResults).toHaveBeenCalledWith('42');
    });
});

// ─── stopWatching ─────────────────────────────────────────────────────────────

describe('stopWatching', () => {
    test('calls poller.stop and returns stopped', () => {
        const poller = makePoller();
        const result = stopWatching('42', { poller });
        expect(poller.stop).toHaveBeenCalledWith('42');
        expect(result).toEqual({ stopped: true });
    });
});

// ─── cancelRunHandler ─────────────────────────────────────────────────────────

describe('cancelRunHandler', () => {
    test('returns error when run not found', async () => {
        const db = makeDb({ getRun: jest.fn(() => null) });
        const result = await cancelRunHandler('42', { db, poller: makePoller(), getToken: () => 'tok' });
        expect(result).toEqual({ error: 'Run not found.' });
    });

    test('deactivates poller and removes run from db', async () => {
        const db = makeDb({ getRun: jest.fn(() => RUN) });
        const poller = makePoller();
        github.cancelRun.mockResolvedValue(undefined);

        await cancelRunHandler('42', { db, poller, getToken: () => 'tok' });

        expect(poller.deactivate).toHaveBeenCalledWith('42');
        expect(db.removeRun).toHaveBeenCalledWith('42');
    });
});

// ─── resumeRuns ───────────────────────────────────────────────────────────────

describe('resumeRuns', () => {
    test('sends run-restored for completed runs', () => {
        const db = makeDb({
            getAllRuns: jest.fn(() => [{ ...RUN, status: 'completed', run_number: 3, repeat_total: 3 }]),
            getRunResults: jest.fn(() => [
                { conclusion: 'success' }, { conclusion: 'failure' }, { conclusion: 'success' },
            ]),
        });
        const sendToWindow = jest.fn();

        resumeRuns({ db, poller: makePoller(), getToken: () => 'tok', sendToWindow });

        expect(sendToWindow).toHaveBeenCalledWith('run-restored', expect.objectContaining({
            status: 'completed',
            passed: 2,
            failed: 1,
        }));
    });

    test('starts poller for watching runs', () => {
        const db = makeDb({
            getAllRuns: jest.fn(() => [{ ...RUN, id: '1', status: 'watching', run_number: 1, repeat_total: 3 }]),
            getRunResults: jest.fn(() => []),
        });
        const poller = makePoller();

        resumeRuns({ db, poller, getToken: () => 'tok', sendToWindow: jest.fn() });

        expect(poller.start).toHaveBeenCalled();
    });
});
