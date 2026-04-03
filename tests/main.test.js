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
        whenReady: jest.fn().mockResolvedValue(undefined),
        on: jest.fn(),
        dock: { setIcon: jest.fn() },
        getPath: jest.fn(() => '/tmp'),
        getVersion: jest.fn(() => '1.0.0'),
        quit: jest.fn(),
        showAboutPanel: jest.fn(),
    };

    const ipcHandlers = {};

    jest.doMock('electron-updater', () => ({ autoUpdater }));
    jest.doMock('electron', () => ({
        app,
        BrowserWindow,
        ipcMain: { handle: jest.fn((ch, fn) => { ipcHandlers[ch] = fn; }) },
        Notification: jest.fn(() => ({ on: jest.fn(), show: jest.fn() })),
        nativeImage: { createFromPath: jest.fn(() => ({})) },
        shell: { openExternal: jest.fn() },
        dialog,
    }));
    jest.doMock('../auth', () => ({
        loadToken: jest.fn(() => token),
        storeToken: jest.fn(),
        clearToken: jest.fn(),
        fetchUser: fetchUserResult
            ? jest.fn().mockResolvedValue(fetchUserResult)
            : jest.fn().mockRejectedValue(new Error('no user')),
        startDeviceFlow: jest.fn(),
        pollForToken: jest.fn(),
    }));
    jest.doMock('../github', () => ({
        parseGitHubUrl: jest.fn(),
        parsePRUrl: jest.fn(),
        fetchRunStatus: jest.fn(),
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
    jest.doMock('../db', () => db);
    jest.doMock('../poller', () => ({
        on: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
        deactivate: jest.fn(),
        isActive: jest.fn(() => false),
    }));

    return { autoUpdater, dialog, BrowserWindow, app, db, ipcHandlers };
}

// ─── autoUpdater: update-downloaded ──────────────────────────────────────────

describe('autoUpdater update-downloaded', () => {
    beforeEach(() => jest.resetModules());

    test('calls showMessageBox with undefined parent when mainWindow has not been created', async () => {
        const { autoUpdater, dialog } = buildMocks(); // no token → loginWindow created, mainWindow stays null
        require('../main');
        await Promise.resolve(); // flush whenReady handler

        dialog.showMessageBox.mockResolvedValue({ response: 1 });
        autoUpdater.emit('update-downloaded');

        expect(dialog.showMessageBox).toHaveBeenCalledWith(
            undefined,
            expect.objectContaining({ title: 'Update ready' })
        );
    });

    test('never passes null as the dialog parent (the bug that was fixed)', async () => {
        const { autoUpdater, dialog } = buildMocks();
        require('../main');
        await Promise.resolve();

        dialog.showMessageBox.mockResolvedValue({ response: 1 });
        autoUpdater.emit('update-downloaded');

        const [parent] = dialog.showMessageBox.mock.calls[0];
        expect(parent).not.toBeNull();
    });

    test('calls showMessageBox with the BrowserWindow when mainWindow exists', async () => {
        const { autoUpdater, dialog, BrowserWindow } = buildMocks({
            token: 'mock-token',
            fetchUserResult: { login: 'semisse', avatar_url: 'https://example.com/avatar.png' },
        });
        require('../main');
        // whenReady resolves → async handler starts → await fetchUser → createMainWindow
        await Promise.resolve(); // tick 1: whenReady microtask
        await Promise.resolve(); // tick 2: fetchUser await
        await Promise.resolve(); // tick 3: createMainWindow + rest of handler

        dialog.showMessageBox.mockResolvedValue({ response: 1 });
        autoUpdater.emit('update-downloaded');

        const [parent] = dialog.showMessageBox.mock.calls[0];
        expect(parent).toBe(BrowserWindow._mockInstance);
    });

    test('calls quitAndInstall when user selects Restart (response 0)', async () => {
        const { autoUpdater, dialog } = buildMocks();
        require('../main');
        await Promise.resolve();

        dialog.showMessageBox.mockResolvedValue({ response: 0 });
        autoUpdater.emit('update-downloaded');
        await Promise.resolve(); // flush showMessageBox.then()

        expect(autoUpdater.quitAndInstall).toHaveBeenCalled();
    });

    test('does not call quitAndInstall when user selects Later (response 1)', async () => {
        const { autoUpdater, dialog } = buildMocks();
        require('../main');
        await Promise.resolve();

        dialog.showMessageBox.mockResolvedValue({ response: 1 });
        autoUpdater.emit('update-downloaded');
        await Promise.resolve();

        expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
    });

    test('shows the update dialog with the correct options', async () => {
        const { autoUpdater, dialog } = buildMocks();
        require('../main');
        await Promise.resolve();

        dialog.showMessageBox.mockResolvedValue({ response: 1 });
        autoUpdater.emit('update-downloaded');

        const [, opts] = dialog.showMessageBox.mock.calls[0];
        expect(opts).toMatchObject({
            type: 'info',
            buttons: ['Restart', 'Later'],
            defaultId: 0,
            cancelId: 1,
        });
    });
});

// ─── rerun handlers: clearRunResults ─────────────────────────────────────────

describe('rerun handlers clear previous results', () => {
    const RUN = {
        id: '42', current_run_id: '42',
        owner: 'owner', repo: 'repo',
        name: 'My Workflow', url: 'https://github.com/owner/repo/actions/runs/42',
        repeat_total: 3,
    };

    let db, ipcHandlers, github;

    beforeEach(() => {
        jest.resetModules();
        ({ db, ipcHandlers } = buildMocks());
        require('../main');

        github = require('../github');
        github.rerunWorkflow.mockResolvedValue(undefined);
        github.rerunFailedJobs.mockResolvedValue(undefined);
    });

    describe('rerun-run', () => {
        test('clears previous run_results before restarting', async () => {
            db.getRun.mockReturnValue(RUN);

            await ipcHandlers['rerun-run'](null, '42');

            expect(db.clearRunResults).toHaveBeenCalledWith('42');
        });

        test('clears results before updating run status', async () => {
            db.getRun.mockReturnValue(RUN);
            const order = [];
            db.clearRunResults.mockImplementation(() => order.push('clear'));
            db.updateRun.mockImplementation(() => order.push('update'));

            await ipcHandlers['rerun-run'](null, '42');

            expect(order).toEqual(['clear', 'update']);
        });

        test('returns error without clearing if run not found', async () => {
            db.getRun.mockReturnValue(null);

            const result = await ipcHandlers['rerun-run'](null, '42');

            expect(result).toEqual({ error: 'Run not found.' });
            expect(db.clearRunResults).not.toHaveBeenCalled();
        });
    });

    describe('rerun-failed-run', () => {
        test('clears previous run_results before restarting', async () => {
            db.getRun.mockReturnValue(RUN);

            await ipcHandlers['rerun-failed-run'](null, '42');

            expect(db.clearRunResults).toHaveBeenCalledWith('42');
        });

        test('clears results before updating run status', async () => {
            db.getRun.mockReturnValue(RUN);
            const order = [];
            db.clearRunResults.mockImplementation(() => order.push('clear'));
            db.updateRun.mockImplementation(() => order.push('update'));

            await ipcHandlers['rerun-failed-run'](null, '42');

            expect(order).toEqual(['clear', 'update']);
        });

        test('returns error without clearing if run not found', async () => {
            db.getRun.mockReturnValue(null);

            const result = await ipcHandlers['rerun-failed-run'](null, '42');

            expect(result).toEqual({ error: 'Run not found.' });
            expect(db.clearRunResults).not.toHaveBeenCalled();
        });
    });
});
