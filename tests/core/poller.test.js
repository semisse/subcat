let PollManager, github, db, poller;

function makeDbMock() {
    return {
        addRunResult: jest.fn(),
        updateRun: jest.fn(),
        removeRun: jest.fn(),
        clearRunResults: jest.fn(),
    };
}

beforeEach(() => {
    jest.resetModules();
    jest.mock('../../src/core/github');
    github = require('../../src/core/github');
    github.delay.mockResolvedValue(undefined);
    PollManager = require('../../src/core/poller');
    db = makeDbMock();
    poller = new PollManager(db);
});

function makeRun(overrides = {}) {
    return {
        status: 'completed',
        conclusion: 'success',
        display_title: 'My Run',
        name: 'My Run',
        html_url: 'https://github.com/owner/repo/actions/runs/1',
        run_started_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:01:00Z',
        ...overrides,
    };
}

function makeConfig(overrides = {}) {
    return {
        runId: '1', currentRunId: '1',
        owner: 'owner', repo: 'repo',
        runNumber: 1, repeatTotal: 1,
        name: 'My Run',
        url: 'https://github.com/owner/repo/actions/runs/1',
        ...overrides,
    };
}

const tick = () => new Promise(r => setImmediate(r));

// ─── start / stop ─────────────────────────────────────────────────────────────

describe('start / stop', () => {
    test('returns true on first start, false if already watching', async () => {
        github.fetchRunStatus.mockResolvedValue(makeRun());
        github.fetchFailedTests.mockResolvedValue([]);

        expect(poller.start(makeConfig(), () => 'token')).toBe(true);
        expect(poller.start(makeConfig(), () => 'token')).toBe(false);
        await tick(); // let loop finish cleanly
    });

    test('second start() on same run (renderer reload) does not create a duplicate loop', async () => {
        github.fetchRunStatus.mockResolvedValue(makeRun());
        github.fetchFailedTests.mockResolvedValue([]);

        poller.start(makeConfig(), () => 'token');
        poller.start(makeConfig(), () => 'token'); // resumeRuns() called again on reload
        await tick();

        expect(github.fetchRunStatus).toHaveBeenCalledTimes(1);
    });

    test('deactivate removes run from active without calling db.removeRun', async () => {
        github.fetchRunStatus.mockResolvedValue(makeRun());
        github.fetchFailedTests.mockResolvedValue([]);

        poller.start(makeConfig(), () => 'token');
        expect(poller.isActive('1')).toBe(true);
        poller.deactivate('1');
        expect(poller.isActive('1')).toBe(false);
        expect(db.removeRun).not.toHaveBeenCalled();
        await tick();
    });

    test('stop removes run from active and calls db.removeRun', async () => {
        github.fetchRunStatus.mockResolvedValue(makeRun());
        github.fetchFailedTests.mockResolvedValue([]);

        poller.start(makeConfig(), () => 'token');
        poller.stop('1'); // synchronous — before loop first tick
        expect(poller.isActive('1')).toBe(false);
        expect(db.removeRun).toHaveBeenCalledWith('1');
        await tick();
    });
});

// ─── single run ───────────────────────────────────────────────────────────────

describe('single run completes', () => {
    test('emits run:update, run:repeat-done, run:all-done', async () => {
        github.fetchRunStatus.mockResolvedValue(makeRun());
        github.fetchFailedTests.mockResolvedValue([]);

        const updates = [];
        const repeatDone = jest.fn();
        const allDone = jest.fn();
        poller.on('run:update', d => updates.push(d));
        poller.on('run:repeat-done', repeatDone);
        poller.on('run:all-done', allDone);

        poller.start(makeConfig(), () => 'token');
        await tick();

        expect(updates.length).toBeGreaterThan(0);
        expect(repeatDone).toHaveBeenCalledWith(expect.objectContaining({ runId: '1', conclusion: 'success' }));
        expect(allDone).toHaveBeenCalledWith(expect.objectContaining({ runId: '1', passed: 1, failed: 0 }));
    });

    test('marks run as completed in db', async () => {
        github.fetchRunStatus.mockResolvedValue(makeRun());
        github.fetchFailedTests.mockResolvedValue([]);

        poller.start(makeConfig(), () => 'token');
        await tick();

        expect(db.updateRun).toHaveBeenCalledWith('1', { status: 'completed' });
    });

    test('run is no longer active after completion', async () => {
        github.fetchRunStatus.mockResolvedValue(makeRun());
        github.fetchFailedTests.mockResolvedValue([]);

        poller.start(makeConfig(), () => 'token');
        await tick();

        expect(poller.isActive('1')).toBe(false);
    });
});

// ─── repeat runs ─────────────────────────────────────────────────────────────

describe('repeat runs', () => {
    test('triggers rerun and increments runNumber when repeatTotal > 1', async () => {
        github.fetchRunStatus.mockResolvedValue(makeRun());
        github.fetchFailedTests.mockResolvedValue([]);
        github.rerunWorkflow.mockResolvedValue('1');

        const allDone = jest.fn();
        poller.on('run:all-done', allDone);

        poller.start(makeConfig({ repeatTotal: 2 }), () => 'token');
        await tick();

        expect(github.rerunWorkflow).toHaveBeenCalledTimes(1);
        expect(db.updateRun).toHaveBeenCalledWith('1', { runNumber: 2 });
        expect(allDone).toHaveBeenCalledWith(expect.objectContaining({ passed: 2, failed: 0 }));
    });

    test('run:all-done reflects failures in results', async () => {
        github.fetchRunStatus.mockResolvedValue(makeRun({ conclusion: 'failure' }));
        github.fetchFailedTests.mockResolvedValue(['Test A failed']);
        github.rerunWorkflow.mockResolvedValue('1');

        const allDone = jest.fn();
        poller.on('run:all-done', allDone);

        poller.start(makeConfig({ repeatTotal: 2 }), () => 'token');
        await tick();

        expect(allDone).toHaveBeenCalledWith(expect.objectContaining({ passed: 0, failed: 2 }));
    });
});

// ─── watchAttempt ─────────────────────────────────────────────────────────────

describe('watchAttempt', () => {
    test('emits run:new-attempt when attempt count increases', async () => {
        github.githubGet
            .mockResolvedValueOnce({ run_attempt: 2 });

        const onNewAttempt = jest.fn();
        poller.on('run:new-attempt', onNewAttempt);

        poller.watchAttempt({ owner: 'owner', repo: 'repo', runId: '1', previousAttemptCount: 1 }, () => 'token');
        await tick();

        expect(onNewAttempt).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', runId: '1' });
    });

    test('does not emit when attempt count has not changed', async () => {
        github.githubGet
            .mockResolvedValueOnce({ run_attempt: 1 })
            .mockResolvedValueOnce({ run_attempt: 2 });

        const onNewAttempt = jest.fn();
        poller.on('run:new-attempt', onNewAttempt);

        poller.watchAttempt({ owner: 'owner', repo: 'repo', runId: '2', previousAttemptCount: 1 }, () => 'token');
        await tick(); // first poll: no change
        await tick(); // second poll: new attempt

        expect(onNewAttempt).toHaveBeenCalledTimes(1);
    });

    test('second watchAttempt call for same runId is a no-op', async () => {
        github.githubGet.mockResolvedValue({ run_attempt: 2 });

        poller.watchAttempt({ owner: 'owner', repo: 'repo', runId: '3', previousAttemptCount: 1 }, () => 'token');
        poller.watchAttempt({ owner: 'owner', repo: 'repo', runId: '3', previousAttemptCount: 1 }, () => 'token');
        await tick();

        expect(github.githubGet).toHaveBeenCalledTimes(1);
    });

    test('stops on non-transient error without emitting', async () => {
        github.githubGet.mockRejectedValue(new Error('server error'));

        const onNewAttempt = jest.fn();
        poller.on('run:new-attempt', onNewAttempt);

        poller.watchAttempt({ owner: 'owner', repo: 'repo', runId: '4', previousAttemptCount: 1 }, () => 'token');
        await tick();

        expect(onNewAttempt).not.toHaveBeenCalled();
    });
});

// ─── error handling ───────────────────────────────────────────────────────────

describe('error handling', () => {
    test('emits run:error on non-transient failure', async () => {
        github.fetchRunStatus.mockRejectedValue(new Error('Unexpected server error'));

        const onError = jest.fn();
        poller.on('run:error', onError);

        poller.start(makeConfig(), () => 'token');
        await tick();

        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ runId: '1', error: 'Unexpected server error' }));
    });

    test('does not emit run:error on transient network failure', async () => {
        const err = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
        github.fetchRunStatus.mockRejectedValueOnce(err).mockResolvedValue(makeRun());
        github.fetchFailedTests.mockResolvedValue([]);

        const onError = jest.fn();
        poller.on('run:error', onError);

        poller.start(makeConfig(), () => 'token');
        await tick();

        expect(onError).not.toHaveBeenCalled();
    });

    test('does not emit run:error on 429 rate limit', async () => {
        const err = Object.assign(new Error('GitHub API 429: /repos/owner/repo/actions/runs/1'), { status: 429 });
        github.fetchRunStatus.mockRejectedValueOnce(err).mockResolvedValue(makeRun());
        github.fetchFailedTests.mockResolvedValue([]);

        const onError = jest.fn();
        poller.on('run:error', onError);

        poller.start(makeConfig(), () => 'token');
        await tick();

        expect(onError).not.toHaveBeenCalled();
    });
});
