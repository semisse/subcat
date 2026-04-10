// ─── setup ────────────────────────────────────────────────────────────────────

function setup({ storage = {}, auth = {} } = {}) {
    jest.resetModules();

    const ipcHandlers = {};
    const loginWindow = { close: jest.fn(), webContents: { send: jest.fn() } };
    const mainWindow = { close: jest.fn() };

    jest.doMock('electron', () => ({
        ipcMain: { handle: jest.fn((ch, fn) => { ipcHandlers[ch] = fn; }) },
        shell: { openExternal: jest.fn() },
    }));

    const storageMock = {
        loadToken: jest.fn(() => null),
        storeToken: jest.fn(),
        clearToken: jest.fn(),
        ...storage,
    };

    const authMock = {
        fetchUser: jest.fn(),
        startDeviceFlow: jest.fn(),
        pollForToken: jest.fn(),
        ...auth,
    };

    const deps = {
        auth: authMock,
        storage: storageMock,
        getWindow: jest.fn(() => mainWindow),
        getLoginWindow: jest.fn(() => loginWindow),
        setCurrentUser: jest.fn(),
        createMainWindow: jest.fn(),
        createLoginWindow: jest.fn(),
    };

    const { register } = require('../../src/electron/ipc/auth');
    register(deps);

    return {
        call: (ch, ...args) => ipcHandlers[ch]({}, ...args),
        electron: require('electron'),
        auth: authMock,
        storage: storageMock,
        deps,
        loginWindow,
        mainWindow,
    };
}

// ─── auth-get-status ──────────────────────────────────────────────────────────

describe('auth-get-status', () => {
    test('returns loggedIn:false when no token stored', async () => {
        const { call } = setup({ storage: { loadToken: jest.fn(() => null) } });
        expect(await call('auth-get-status')).toEqual({ loggedIn: false });
    });

    test('returns loggedIn:true with user data when token is valid', async () => {
        const { call } = setup({
            storage: { loadToken: jest.fn(() => 'valid-token') },
            auth: { fetchUser: jest.fn().mockResolvedValue({ login: 'semisse', avatar_url: 'https://avatars.githubusercontent.com/u/1' }) },
        });
        expect(await call('auth-get-status')).toEqual({
            loggedIn: true,
            login: 'semisse',
            avatarUrl: 'https://avatars.githubusercontent.com/u/1',
        });
    });

    test('clears token and returns loggedIn:false when fetchUser fails', async () => {
        const clearToken = jest.fn();
        const { call } = setup({
            storage: { loadToken: jest.fn(() => 'stale-token'), clearToken },
            auth: { fetchUser: jest.fn().mockRejectedValue(new Error('401')) },
        });
        expect(await call('auth-get-status')).toEqual({ loggedIn: false });
        expect(clearToken).toHaveBeenCalled();
    });
});

// ─── auth-start-login ─────────────────────────────────────────────────────────

describe('auth-start-login', () => {
    test('returns userCode and verificationUri on successful device flow start', async () => {
        const { call } = setup({
            auth: {
                startDeviceFlow: jest.fn().mockResolvedValue({
                    deviceCode: 'dc', userCode: 'ABCD-1234',
                    verificationUri: 'https://github.com/login/device', interval: 5,
                }),
                pollForToken: jest.fn().mockReturnValue(new Promise(() => {})), // never resolves
                fetchUser: jest.fn(),
            },
        });
        const result = await call('auth-start-login');
        expect(result).toEqual({ userCode: 'ABCD-1234', verificationUri: 'https://github.com/login/device' });
    });

    test('opens GitHub verification URL in browser', async () => {
        const { call, electron } = setup({
            auth: {
                startDeviceFlow: jest.fn().mockResolvedValue({
                    deviceCode: 'dc', userCode: 'ABCD', interval: 5,
                    verificationUri: 'https://github.com/login/device',
                }),
                pollForToken: jest.fn().mockReturnValue(new Promise(() => {})),
                fetchUser: jest.fn(),
            },
        });
        await call('auth-start-login');
        expect(electron.shell.openExternal).toHaveBeenCalledWith('https://github.com/login/device');
    });

    test('stores token, fetches user and creates main window after poll succeeds', async () => {
        let resolvePoll;
        const pollPromise = new Promise(resolve => { resolvePoll = resolve; });
        const storeToken = jest.fn();
        const fetchUser = jest.fn().mockResolvedValue({ login: 'semisse', avatar_url: 'u' });
        const { call, deps } = setup({
            storage: { loadToken: jest.fn(() => null), storeToken, clearToken: jest.fn() },
            auth: {
                startDeviceFlow: jest.fn().mockResolvedValue({ deviceCode: 'dc', userCode: 'AB', verificationUri: 'u', interval: 0 }),
                pollForToken: jest.fn().mockReturnValue(pollPromise),
                fetchUser,
            },
        });
        await call('auth-start-login');
        resolvePoll('ghp_token');
        await pollPromise.then(() => {}); // flush microtasks
        await new Promise(r => setImmediate(r));
        expect(storeToken).toHaveBeenCalledWith('ghp_token');
        expect(deps.setCurrentUser).toHaveBeenCalledWith({ login: 'semisse', avatar_url: 'u' });
        expect(deps.createMainWindow).toHaveBeenCalled();
    });

    test('sends auth-error to login window when poll fails', async () => {
        let rejectPoll;
        const pollPromise = new Promise((_, reject) => { rejectPoll = reject; });
        const { call, loginWindow } = setup({
            auth: {
                startDeviceFlow: jest.fn().mockResolvedValue({ deviceCode: 'dc', userCode: 'AB', verificationUri: 'u', interval: 0 }),
                pollForToken: jest.fn().mockReturnValue(pollPromise),
                fetchUser: jest.fn(),
            },
        });
        await call('auth-start-login');
        rejectPoll(new Error('Login was denied.'));
        await pollPromise.catch(() => {});
        await new Promise(r => setImmediate(r));
        expect(loginWindow.webContents.send).toHaveBeenCalledWith('auth-error', { error: 'Login was denied.' });
    });

    test('returns error when startDeviceFlow throws', async () => {
        const { call } = setup({
            auth: { startDeviceFlow: jest.fn().mockRejectedValue(new Error('network error')) },
        });
        expect(await call('auth-start-login')).toEqual({ error: 'network error' });
    });
});

// ─── auth-logout ──────────────────────────────────────────────────────────────

describe('auth-logout', () => {
    test('clears token and resets current user', async () => {
        const clearToken = jest.fn();
        const { call, deps } = setup({ storage: { loadToken: jest.fn(), storeToken: jest.fn(), clearToken } });
        await call('auth-logout');
        expect(clearToken).toHaveBeenCalled();
        expect(deps.setCurrentUser).toHaveBeenCalledWith(null);
    });

    test('creates login window and closes main window', async () => {
        const { call, deps, mainWindow } = setup();
        await call('auth-logout');
        expect(deps.createLoginWindow).toHaveBeenCalled();
        expect(mainWindow.close).toHaveBeenCalled();
    });

    test('returns ok:true', async () => {
        const { call } = setup();
        expect(await call('auth-logout')).toEqual({ ok: true });
    });
});
