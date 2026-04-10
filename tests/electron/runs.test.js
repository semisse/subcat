jest.mock('../../src/core/runs');
const coreRuns = require('../../src/core/runs');

// ─── setup ────────────────────────────────────────────────────────────────────

function setup({ db = {}, storage = {}, getUser = jest.fn(() => null) } = {}) {
    jest.resetModules();

    const ipcHandlers = {};
    const mainWindow = { webContents: { send: jest.fn() } };
    const showMessageBox = jest.fn().mockResolvedValue({ response: 1 }); // cancel by default

    jest.doMock('electron', () => ({
        ipcMain: { handle: jest.fn((ch, fn) => { ipcHandlers[ch] = fn; }) },
        dialog: { showMessageBox },
    }));

    jest.doMock('../../src/core/runs', () => coreRuns);

    const dbMock = {
        getFailedOnlyAttempts: jest.fn(() => []),
        saveFailedOnlyAttempt: jest.fn(),
        savePendingRerun: jest.fn(),
        getPendingRerun: jest.fn(() => null),
        deletePendingRerun: jest.fn(),
        getPRStats: jest.fn(() => ({ total: 0 })),
        getLabRuns: jest.fn(() => []),
        getRunResults: jest.fn(() => []),
        getRunResultById: jest.fn(() => null),
        ...db,
    };

    const storageMock = {
        loadToken: jest.fn(() => 'tok'),
        ...storage,
    };

    const pollerMock = {
        on: jest.fn(),
        watchAttempt: jest.fn(),
    };

    const deps = {
        db: dbMock,
        poller: pollerMock,
        storage: storageMock,
        getWindow: jest.fn(() => mainWindow),
        getUser,
    };

    const { register } = require('../../src/electron/ipc/runs');
    register(deps);

    return {
        call: (ch, ...args) => ipcHandlers[ch]({}, ...args),
        db: dbMock,
        poller: pollerMock,
        showMessageBox,
        mainWindow,
    };
}

// ─── start-watching ───────────────────────────────────────────────────────────

describe('start-watching', () => {
    test('delegates to runs.startWatching with correct deps', async () => {
        coreRuns.startWatching.mockResolvedValue({ started: true });
        const { call } = setup();
        const opts = { url: 'https://github.com/o/r/actions/runs/1', repeatTotal: 1 };
        await call('start-watching', opts);
        expect(coreRuns.startWatching).toHaveBeenCalledWith(
            opts,
            expect.objectContaining({ db: expect.any(Object), poller: expect.any(Object), getToken: expect.any(Function) })
        );
    });

    test('returns result from runs.startWatching', async () => {
        coreRuns.startWatching.mockResolvedValue({ error: 'Invalid GitHub Actions URL.' });
        const { call } = setup();
        const result = await call('start-watching', { url: 'bad-url' });
        expect(result).toEqual({ error: 'Invalid GitHub Actions URL.' });
    });
});

// ─── fetch-user-prs ───────────────────────────────────────────────────────────

describe('fetch-user-prs', () => {
    test('passes user login to runs.fetchUserPRsHandler', async () => {
        coreRuns.fetchUserPRsHandler.mockResolvedValue([]);
        const getUser = jest.fn(() => ({ login: 'semisse' }));
        const { call } = setup({ getUser });
        await call('fetch-user-prs');
        expect(coreRuns.fetchUserPRsHandler).toHaveBeenCalledWith('semisse', expect.any(Object));
    });

    test('passes undefined login when user is not set', async () => {
        coreRuns.fetchUserPRsHandler.mockResolvedValue([]);
        const { call } = setup({ getUser: jest.fn(() => null) });
        await call('fetch-user-prs');
        expect(coreRuns.fetchUserPRsHandler).toHaveBeenCalledWith(undefined, expect.any(Object));
    });
});

// ─── fetch-run-attempts ───────────────────────────────────────────────────────

describe('fetch-run-attempts', () => {
    test('enriches result with failedOnlyAttempts from db', async () => {
        coreRuns.fetchRunAttemptsHandler.mockResolvedValue({ runs: [], totalAttempts: 0 });
        const getFailedOnlyAttempts = jest.fn(() => [{ runAttempt: 1 }]);
        const { call } = setup({ db: { getFailedOnlyAttempts } });
        const opts = { owner: 'o', repo: 'r', runId: '1' };
        const result = await call('fetch-run-attempts', opts);
        expect(result.failedOnlyAttempts).toEqual([{ runAttempt: 1 }]);
    });

    test('does not enrich when handler returns an error', async () => {
        coreRuns.fetchRunAttemptsHandler.mockResolvedValue({ error: 'not found' });
        const getFailedOnlyAttempts = jest.fn();
        const { call } = setup({ db: { getFailedOnlyAttempts } });
        const result = await call('fetch-run-attempts', { owner: 'o', repo: 'r', runId: '1' });
        expect(result).toEqual({ error: 'not found' });
        expect(getFailedOnlyAttempts).not.toHaveBeenCalled();
    });
});

// ─── confirm-dialog ───────────────────────────────────────────────────────────

describe('confirm-dialog', () => {
    test('returns true when user confirms (response 0)', async () => {
        const { call, showMessageBox } = setup();
        showMessageBox.mockResolvedValue({ response: 0 });
        expect(await call('confirm-dialog', { title: 'Stop?', message: 'Are you sure?' })).toBe(true);
    });

    test('returns false when user cancels (response 1)', async () => {
        const { call, showMessageBox } = setup();
        showMessageBox.mockResolvedValue({ response: 1 });
        expect(await call('confirm-dialog', { title: 'Stop?', message: 'Are you sure?' })).toBe(false);
    });
});

// ─── rerun-failed-jobs-direct ─────────────────────────────────────────────────

describe('rerun-failed-jobs-direct', () => {
    test('calls poller.watchAttempt when previousAttemptCount is provided', async () => {
        coreRuns.rerunFailedJobsDirect.mockResolvedValue({ started: true });
        const { call, poller } = setup();
        await call('rerun-failed-jobs-direct', { owner: 'o', repo: 'r', runId: '1', previousAttemptCount: 2 });
        expect(poller.watchAttempt).toHaveBeenCalledWith(
            { owner: 'o', repo: 'r', runId: '1', previousAttemptCount: 2 },
            expect.any(Function)
        );
    });

    test('does not call poller.watchAttempt when previousAttemptCount is null', async () => {
        coreRuns.rerunFailedJobsDirect.mockResolvedValue({ started: true });
        const { call, poller } = setup();
        await call('rerun-failed-jobs-direct', { owner: 'o', repo: 'r', runId: '1', previousAttemptCount: null });
        expect(poller.watchAttempt).not.toHaveBeenCalled();
    });

    test('does not call watchAttempt when rerunFailedJobsDirect returns an error', async () => {
        coreRuns.rerunFailedJobsDirect.mockResolvedValue({ error: 'API error' });
        const { call, poller } = setup();
        await call('rerun-failed-jobs-direct', { owner: 'o', repo: 'r', runId: '1', previousAttemptCount: 2 });
        expect(poller.watchAttempt).not.toHaveBeenCalled();
    });
});

// ─── get-pr-stats ─────────────────────────────────────────────────────────────

describe('get-pr-stats', () => {
    test('returns db.getPRStats result', async () => {
        const { call } = setup({ db: { getPRStats: jest.fn(() => ({ total: 5 })) } });
        expect(await call('get-pr-stats')).toEqual({ total: 5 });
    });

    test('returns error when db.getPRStats throws', async () => {
        const { call } = setup({ db: { getPRStats: jest.fn(() => { throw new Error('db error'); }) } });
        expect(await call('get-pr-stats')).toEqual({ error: 'db error' });
    });
});

// ─── fetch-run-jobs ───────────────────────────────────────────────────────────

describe('fetch-run-jobs', () => {
    test('wraps result in { jobs }', async () => {
        coreRuns.fetchRunJobsHandler.mockResolvedValue([{ id: 1 }]);
        const { call } = setup();
        expect(await call('fetch-run-jobs', { owner: 'o', repo: 'r', runId: '1' })).toEqual({ jobs: [{ id: 1 }] });
    });

    test('returns { error } when handler throws', async () => {
        coreRuns.fetchRunJobsHandler.mockRejectedValue(new Error('not found'));
        const { call } = setup();
        expect(await call('fetch-run-jobs', { owner: 'o', repo: 'r', runId: '1' })).toEqual({ error: 'not found' });
    });
});
