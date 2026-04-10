jest.mock('../../src/core/github');
const github = require('../../src/core/github');
const {
    startWatching,
    rerunRun, rerunFailedRun, stopWatching, cancelRunHandler, resumeRuns,
    watchWorkflowRerun, fetchRunAttemptsHandler,
    pinWorkflow, unpinWorkflow, resumePinnedWorkflows,
    rerunFailedJobsDirect, cancelRunDirect,
} = require('../../src/core/runs');

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
        watchAttempt: jest.fn(),
        ...overrides,
    };
}

function makePinnedDb(overrides = {}) {
    return {
        ...makeDb(),
        getPinnedWorkflow: jest.fn(() => null),
        getAllPinnedWorkflows: jest.fn(() => []),
        addPinnedWorkflow: jest.fn(),
        updatePinnedWorkflow: jest.fn(),
        removePinnedWorkflow: jest.fn(),
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

const VALID_URL = 'https://github.com/owner/repo/actions/runs/42';

// ─── startWatching ────────────────────────────────────────────────────────────

describe('startWatching', () => {
    beforeEach(() => jest.clearAllMocks());
    test('returns error for invalid URL', async () => {
        github.parseGitHubUrl.mockReturnValue(null);
        const result = await startWatching({ url: 'https://github.com/owner/repo' }, { db: makeDb(), poller: makePoller(), getToken: () => 'tok' });
        expect(result.error).toMatch(/Invalid GitHub Actions URL/);
    });

    test('returns error when repeat count is out of range', async () => {
        github.parseGitHubUrl.mockReturnValue({ owner: 'owner', repo: 'repo', runId: '42' });
        const result = await startWatching({ url: VALID_URL, repeatTotal: 200 }, { db: makeDb(), poller: makePoller(), getToken: () => 'tok' });
        expect(result.error).toMatch(/Repeat count/);
    });

    test('returns error when run is already being watched', async () => {
        github.parseGitHubUrl.mockReturnValue({ owner: 'owner', repo: 'repo', runId: '42' });
        const poller = makePoller({ isActive: jest.fn(() => true) });
        const result = await startWatching({ url: VALID_URL }, { db: makeDb(), poller, getToken: () => 'tok' });
        expect(result).toEqual({ error: 'Already watching this run.' });
    });

    test('returns error when run is already in db (completed, repeat=1)', async () => {
        github.parseGitHubUrl.mockReturnValue({ owner: 'owner', repo: 'repo', runId: '42' });
        github.fetchRunStatus.mockResolvedValue({ status: 'completed', conclusion: 'success', workflow_id: 'wf1', html_url: 'u', display_title: 'CI' });
        const db = makeDb({ getRun: jest.fn(() => ({ id: '42' })) }); // already in db
        const result = await startWatching({ url: VALID_URL, repeatTotal: 1 }, { db, poller: makePoller(), getToken: () => 'tok' });
        expect(result).toEqual({ error: 'This run is already in the list.' });
    });

    test('adds completed run to db immediately when repeat=1', async () => {
        github.parseGitHubUrl.mockReturnValue({ owner: 'owner', repo: 'repo', runId: '42' });
        github.fetchRunStatus.mockResolvedValue({ status: 'completed', conclusion: 'success', workflow_id: 'wf1', html_url: 'u', display_title: 'CI', run_started_at: null, updated_at: null });
        const db = makeDb({ getRun: jest.fn(() => null) });
        const result = await startWatching({ url: VALID_URL, repeatTotal: 1 }, { db, poller: makePoller(), getToken: () => 'tok' });
        expect(db.addRun).toHaveBeenCalled();
        expect(db.addRunResult).toHaveBeenCalled();
        expect(result).toMatchObject({ started: true, status: 'completed', conclusion: 'success' });
    });

    test('fetches failed tests when conclusion is not success (repeat=1)', async () => {
        github.parseGitHubUrl.mockReturnValue({ owner: 'owner', repo: 'repo', runId: '42' });
        github.fetchRunStatus.mockResolvedValue({ status: 'completed', conclusion: 'failure', workflow_id: 'wf1', html_url: 'u', display_title: 'CI', run_started_at: null, updated_at: null });
        github.fetchFailedTests.mockResolvedValue(['test_a']);
        const db = makeDb({ getRun: jest.fn(() => null) });
        const result = await startWatching({ url: VALID_URL, repeatTotal: 1 }, { db, poller: makePoller(), getToken: () => 'tok' });
        expect(github.fetchFailedTests).toHaveBeenCalledWith('owner', 'repo', '42', 'tok');
        expect(result.failedTests).toEqual(['test_a']);
    });

    test('does not fetch failed tests when conclusion is success (repeat=1)', async () => {
        github.parseGitHubUrl.mockReturnValue({ owner: 'owner', repo: 'repo', runId: '42' });
        github.fetchRunStatus.mockResolvedValue({ status: 'completed', conclusion: 'success', workflow_id: 'wf1', html_url: 'u', display_title: 'CI', run_started_at: null, updated_at: null });
        const db = makeDb({ getRun: jest.fn(() => null) });
        await startWatching({ url: VALID_URL, repeatTotal: 1 }, { db, poller: makePoller(), getToken: () => 'tok' });
        expect(github.fetchFailedTests).not.toHaveBeenCalled();
    });

    test('starts poller for in-progress run', async () => {
        github.parseGitHubUrl.mockReturnValue({ owner: 'owner', repo: 'repo', runId: '42' });
        github.fetchRunStatus.mockResolvedValue({ status: 'in_progress', conclusion: null, workflow_id: 'wf1', html_url: 'u', display_title: 'CI' });
        const poller = makePoller();
        await startWatching({ url: VALID_URL, repeatTotal: 1 }, { db: makeDb(), poller, getToken: () => 'tok' });
        expect(poller.start).toHaveBeenCalled();
    });

    test('triggers rerun and starts poller for completed run with repeat>1', async () => {
        github.parseGitHubUrl.mockReturnValue({ owner: 'owner', repo: 'repo', runId: '42' });
        github.fetchRunStatus.mockResolvedValue({ status: 'completed', conclusion: 'success', workflow_id: 'wf1', html_url: 'u', display_title: 'CI' });
        github.rerunWorkflow.mockResolvedValue(undefined);
        const poller = makePoller();
        const result = await startWatching({ url: VALID_URL, repeatTotal: 3 }, { db: makeDb(), poller, getToken: () => 'tok' });
        expect(github.rerunWorkflow).toHaveBeenCalledWith('owner', 'repo', '42', 'tok');
        expect(poller.start).toHaveBeenCalled();
        expect(result).toMatchObject({ started: true, repeatTotal: 3 });
    });

    test('returns error when fetchRunStatus throws', async () => {
        github.parseGitHubUrl.mockReturnValue({ owner: 'owner', repo: 'repo', runId: '42' });
        github.fetchRunStatus.mockRejectedValue(new Error('API unavailable'));
        const result = await startWatching({ url: VALID_URL }, { db: makeDb(), poller: makePoller(), getToken: () => 'tok' });
        expect(result).toEqual({ error: 'API unavailable' });
    });
});

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

// ─── watchWorkflowRerun ───────────────────────────────────────────────────────

describe('watchWorkflowRerun', () => {
    test('calls rerunWorkflow and starts watchAttempt', async () => {
        github.rerunWorkflow.mockResolvedValue(undefined);
        const poller = makePoller();
        const result = await watchWorkflowRerun(
            { owner: 'owner', repo: 'repo', runId: '1', previousAttemptCount: 2 },
            { getToken: () => 'tok', poller }
        );
        expect(github.rerunWorkflow).toHaveBeenCalledWith('owner', 'repo', '1', 'tok');
        expect(poller.watchAttempt).toHaveBeenCalledWith(
            { owner: 'owner', repo: 'repo', runId: '1', previousAttemptCount: 2 },
            expect.any(Function)
        );
        expect(result).toEqual({ started: true });
    });

    test('returns error when rerunWorkflow fails', async () => {
        github.rerunWorkflow.mockRejectedValue(new Error('API error'));
        const poller = makePoller();
        const result = await watchWorkflowRerun(
            { owner: 'owner', repo: 'repo', runId: '1', previousAttemptCount: 1 },
            { getToken: () => 'tok', poller }
        );
        expect(result).toEqual({ error: 'API error' });
        expect(poller.watchAttempt).not.toHaveBeenCalled();
    });
});

// ─── fetchRunAttemptsHandler ──────────────────────────────────────────────────

describe('fetchRunAttemptsHandler', () => {
    test('returns attempts from github', async () => {
        github.fetchRunAttempts.mockResolvedValue({
            attempts: [{ runAttempt: 2 }, { runAttempt: 1 }],
            totalAttempts: 2,
        });
        const result = await fetchRunAttemptsHandler(
            { owner: 'owner', repo: 'repo', runId: '1' },
            { getToken: () => 'tok' }
        );
        expect(result.runs).toHaveLength(2);
        expect(result.totalAttempts).toBe(2);
    });

    test('returns error on API failure', async () => {
        github.fetchRunAttempts.mockRejectedValue(new Error('not found'));
        const result = await fetchRunAttemptsHandler(
            { owner: 'owner', repo: 'repo', runId: '999' },
            { getToken: () => 'tok' }
        );
        expect(result).toEqual({ error: 'not found' });
    });
});

// ─── pinWorkflow ──────────────────────────────────────────────────────────────

describe('pinWorkflow', () => {
    const WORKFLOW_URL = 'https://github.com/owner/repo/actions/workflows/ci.yml';
    const PARSED = { owner: 'owner', repo: 'repo', workflowFile: 'ci.yml' };

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('returns error for invalid URL', async () => {
        github.parseWorkflowUrl.mockReturnValue(null);
        const db = makePinnedDb();
        const result = await pinWorkflow({ url: 'https://github.com/owner/repo/pull/1' }, { db, getToken: () => 'tok', onUpdate: jest.fn() });
        expect(result.error).toMatch(/Invalid/);
    });

    test('returns error when workflow already pinned', async () => {
        github.parseWorkflowUrl.mockReturnValue(PARSED);
        const db = makePinnedDb({ getPinnedWorkflow: jest.fn(() => ({ id: 'owner/repo/ci.yml' })) });
        const result = await pinWorkflow(
            { url: WORKFLOW_URL },
            { db, getToken: () => 'tok', onUpdate: jest.fn() }
        );
        expect(result.error).toMatch(/already pinned/);
    });

    test('fetches workflow info and latest run, saves to db', async () => {
        github.parseWorkflowUrl.mockReturnValue(PARSED);
        github.fetchWorkflowInfo.mockResolvedValue({ name: 'CI Pipeline' });
        github.fetchLatestWorkflowRun.mockResolvedValue({ id: 42, status: 'completed', conclusion: 'success' });
        const db = makePinnedDb();

        const result = await pinWorkflow({ url: WORKFLOW_URL }, { db, getToken: () => 'tok', onUpdate: jest.fn() });

        expect(result.pinned).toBe(true);
        expect(result.name).toBe('CI Pipeline');
        expect(result.latestRunId).toBe('42');
        expect(db.addPinnedWorkflow).toHaveBeenCalledWith(expect.objectContaining({
            id: 'owner/repo/ci.yml',
            name: 'CI Pipeline',
            workflowFile: 'ci.yml',
        }));
    });

    test('proceeds when fetchLatestWorkflowRun fails (no runs yet)', async () => {
        github.parseWorkflowUrl.mockReturnValue(PARSED);
        github.fetchWorkflowInfo.mockResolvedValue({ name: 'CI' });
        github.fetchLatestWorkflowRun.mockRejectedValue(new Error('no runs'));
        const db = makePinnedDb();

        const result = await pinWorkflow({ url: WORKFLOW_URL }, { db, getToken: () => 'tok', onUpdate: jest.fn() });

        expect(result.pinned).toBe(true);
        expect(result.latestRunId).toBeNull();
    });

    test('returns error when fetchWorkflowInfo fails', async () => {
        github.parseWorkflowUrl.mockReturnValue(PARSED);
        github.fetchWorkflowInfo.mockRejectedValue(new Error('workflow not found'));
        github.fetchLatestWorkflowRun.mockResolvedValue(null);
        const db = makePinnedDb();

        const result = await pinWorkflow({ url: WORKFLOW_URL }, { db, getToken: () => 'tok', onUpdate: jest.fn() });

        expect(result.error).toBe('workflow not found');
    });
});

// ─── unpinWorkflow ────────────────────────────────────────────────────────────

describe('unpinWorkflow', () => {
    test('removes pinned workflow from db', () => {
        const db = makePinnedDb();
        const result = unpinWorkflow('owner/repo/ci.yml', { db });
        expect(db.removePinnedWorkflow).toHaveBeenCalledWith('owner/repo/ci.yml');
        expect(result).toEqual({ unpinned: true });
    });
});

// ─── rerunFailedJobsDirect ────────────────────────────────────────────────────

describe('rerunFailedJobsDirect', () => {
    test('calls rerunFailedJobs with correct args and returns started', async () => {
        github.rerunFailedJobs.mockResolvedValue(undefined);
        const result = await rerunFailedJobsDirect('owner', 'repo', '42', { getToken: () => 'tok' });
        expect(github.rerunFailedJobs).toHaveBeenCalledWith('owner', 'repo', '42', 'tok');
        expect(result).toEqual({ started: true });
    });

    test('returns error when rerunFailedJobs throws', async () => {
        github.rerunFailedJobs.mockRejectedValue(new Error('API error'));
        const result = await rerunFailedJobsDirect('owner', 'repo', '42', { getToken: () => 'tok' });
        expect(result).toEqual({ error: 'API error' });
    });
});

// ─── cancelRunDirect ──────────────────────────────────────────────────────────

describe('cancelRunDirect', () => {
    test('calls cancelRun with correct args and returns cancelled', async () => {
        github.cancelRun.mockResolvedValue(undefined);
        const result = await cancelRunDirect('owner', 'repo', '42', { getToken: () => 'tok' });
        expect(github.cancelRun).toHaveBeenCalledWith('owner', 'repo', '42', 'tok');
        expect(result).toEqual({ cancelled: true });
    });

    test('returns error when cancelRun throws', async () => {
        github.cancelRun.mockRejectedValue(new Error('not found'));
        const result = await cancelRunDirect('owner', 'repo', '42', { getToken: () => 'tok' });
        expect(result).toEqual({ error: 'not found' });
    });
});

// ─── resumePinnedWorkflows ────────────────────────────────────────────────────

describe('resumePinnedWorkflows', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('sends pinned-workflow-restored for each saved workflow', () => {
        const pw = {
            id: 'owner/repo/ci.yml',
            name: 'CI', url: 'https://github.com/owner/repo/actions/workflows/ci.yml',
            owner: 'owner', repo: 'repo', workflow_file: 'ci.yml',
            latest_run_id: '10', latest_run_status: 'completed',
            latest_run_conclusion: 'success', latest_run_url: 'https://github.com/owner/repo/actions/runs/10',
        };
        const db = makePinnedDb({ getAllPinnedWorkflows: jest.fn(() => [pw]) });
        const sendToWindow = jest.fn();

        resumePinnedWorkflows({ db, getToken: () => 'tok', sendToWindow });

        expect(sendToWindow).toHaveBeenCalledWith('pinned-workflow-restored', expect.objectContaining({
            id: 'owner/repo/ci.yml',
            name: 'CI',
            latestRunStatus: 'completed',
        }));
    });

    test('sends nothing when no pinned workflows', () => {
        const db = makePinnedDb();
        const sendToWindow = jest.fn();

        resumePinnedWorkflows({ db, getToken: () => 'tok', sendToWindow });

        expect(sendToWindow).not.toHaveBeenCalled();
    });
});
