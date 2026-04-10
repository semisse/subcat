const { EventEmitter } = require('events');

// ─── helpers ──────────────────────────────────────────────────────────────────

function buildMocks({ token = null, fetchUserResult = null } = {}) {
    const autoUpdater = new EventEmitter();
    autoUpdater.checkForUpdates = jest.fn();
    autoUpdater.quitAndInstall = jest.fn();

    const mockWindow = {
        loadFile: jest.fn(),
        on: jest.fn(),
        close: jest.fn(),
        webContents: { on: jest.fn(), send: jest.fn() },
    };
    const BrowserWindow = jest.fn(() => mockWindow);
    BrowserWindow.getAllWindows = jest.fn(() => []);
    BrowserWindow._mockInstance = mockWindow;

    const dialog = {
        showMessageBox: jest.fn().mockResolvedValue({ response: 1 }),
        showSaveDialog: jest.fn(),
    };

    const app = {
        setName: jest.fn(),
        setAboutPanelOptions: jest.fn(),
        setActivationPolicy: jest.fn(),
        whenReady: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        dock: { setIcon: jest.fn(), hide: jest.fn() },
        getPath: jest.fn(() => '/tmp'),
        getVersion: jest.fn(() => '1.0.0'),
        quit: jest.fn(),
        showAboutPanel: jest.fn(),
        commandLine: { appendSwitch: jest.fn() },
    };

    const ipcHandlers = {};

    jest.doMock('electron-updater', () => ({ autoUpdater }));
    jest.doMock('electron', () => ({
        app,
        BrowserWindow,
        ipcMain: { handle: jest.fn((ch, fn) => { ipcHandlers[ch] = fn; }), removeHandler: jest.fn() },
        Menu: { buildFromTemplate: jest.fn(() => ({})), setApplicationMenu: jest.fn() },
        Notification: jest.fn(() => ({ on: jest.fn(), show: jest.fn() })),
        nativeImage: { createFromPath: jest.fn(() => ({})) },
        shell: { openExternal: jest.fn() },
        dialog,
    }));
    jest.doMock('../../src/core/auth', () => ({
        fetchUser: fetchUserResult
            ? jest.fn().mockResolvedValue(fetchUserResult)
            : jest.fn().mockRejectedValue(new Error('no user')),
        startDeviceFlow: jest.fn(),
        pollForToken: jest.fn(),
    }));
    jest.doMock('../../src/electron/storage', () => ({
        loadToken: jest.fn(() => token),
        storeToken: jest.fn(),
        clearToken: jest.fn(),
    }));
    jest.doMock('../../src/core/github', () => ({
        parseGitHubUrl: jest.fn(),
        parsePRUrl: jest.fn(),
        fetchRunStatus: jest.fn(),
        fetchUserPRs: jest.fn(),
        fetchPRRuns: jest.fn(),
        fetchFailedTests: jest.fn(),
        rerunWorkflow: jest.fn(),
        rerunFailedJobs: jest.fn(),
        cancelRun: jest.fn(),
    }));

    const db = {
        getAllRuns: jest.fn(() => []),
        getRun: jest.fn(),
        addRun: jest.fn(),
        updateRun: jest.fn(),
        addRunResult: jest.fn(),
        removeRun: jest.fn(),
        clearRunResults: jest.fn(),
        getReport: jest.fn(),
        getRunResults: jest.fn(() => []),
    };
    jest.doMock('../../src/db', () => db);

    const pollerInstance = {
        on: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
        deactivate: jest.fn(),
        isActive: jest.fn(() => false),
    };
    jest.doMock('../../src/core/poller', () => jest.fn(() => pollerInstance));

    jest.doMock('../../src/core/runs', () => ({
        startWatching: jest.fn(),
        stopWatching: jest.fn(),
        rerunRun: jest.fn(),
        rerunFailedRun: jest.fn(),
        cancelRunHandler: jest.fn(),
        fetchUserPRsHandler: jest.fn(),
        fetchPRRunsHandler: jest.fn(),
        resumeRuns: jest.fn(),
    }));

    jest.doMock('../../src/electron/notifications', () => ({ register: jest.fn() }));

    return { autoUpdater, dialog, BrowserWindow, app, db, ipcHandlers, poller: pollerInstance };
}

// ─── autoUpdater: update-downloaded ──────────────────────────────────────────

describe('autoUpdater update-downloaded', () => {
    beforeEach(() => jest.resetModules());

    test('sends update-ready IPC to renderer when mainWindow exists', async () => {
        const { autoUpdater, BrowserWindow } = buildMocks({
            token: 'mock-token',
            fetchUserResult: { login: 'semisse', avatar_url: 'https://example.com/avatar.png' },
        });
        require('../../src/electron/main');
        await Promise.resolve(); // tick 1: whenReady microtask
        await Promise.resolve(); // tick 2: fetchUser await
        await Promise.resolve(); // tick 3: createMainWindow + rest of handler

        autoUpdater.emit('update-downloaded', { version: '1.2.0' });

        expect(BrowserWindow._mockInstance.webContents.send).toHaveBeenCalledWith(
            'update-ready',
            { version: '1.2.0' }
        );
    });

    test('does not throw when mainWindow has not been created', async () => {
        const { autoUpdater } = buildMocks();
        require('../../src/electron/main');
        await Promise.resolve();

        expect(() => autoUpdater.emit('update-downloaded', { version: '1.2.0' })).not.toThrow();
    });

    test('install-update IPC calls quitAndInstall', async () => {
        const { autoUpdater, ipcHandlers } = buildMocks();
        require('../../src/electron/main');
        await Promise.resolve();

        ipcHandlers['install-update']();

        expect(autoUpdater.quitAndInstall).toHaveBeenCalled();
    });
});

// ─── rerun handlers: clearRunResults ─────────────────────────────────────────

describe('rerun handlers clear previous results', () => {
    let db, ipcHandlers, runsModule;

    beforeEach(() => {
        jest.resetModules();
        ({ db, ipcHandlers } = buildMocks());
        require('../../src/electron/main');
        runsModule = require('../../src/core/runs');
    });

    describe('rerun-run', () => {
        test('delegates to runs.rerunRun with correct runId', async () => {
            runsModule.rerunRun.mockResolvedValue({ started: true, status: 'queued' });

            await ipcHandlers['rerun-run'](null, '42');

            expect(runsModule.rerunRun).toHaveBeenCalledWith('42', expect.objectContaining({ db }));
        });

        test('returns error when runs.rerunRun returns error', async () => {
            runsModule.rerunRun.mockResolvedValue({ error: 'Run not found.' });

            const result = await ipcHandlers['rerun-run'](null, '99');

            expect(result).toEqual({ error: 'Run not found.' });
        });
    });

    describe('rerun-failed-run', () => {
        test('delegates to runs.rerunFailedRun with correct runId', async () => {
            runsModule.rerunFailedRun.mockResolvedValue({ started: true, status: 'queued' });

            await ipcHandlers['rerun-failed-run'](null, '42');

            expect(runsModule.rerunFailedRun).toHaveBeenCalledWith('42', expect.objectContaining({ db }));
        });

        test('returns error when runs.rerunFailedRun returns error', async () => {
            runsModule.rerunFailedRun.mockResolvedValue({ error: 'Run not found.' });

            const result = await ipcHandlers['rerun-failed-run'](null, '99');

            expect(result).toEqual({ error: 'Run not found.' });
        });
    });
});
