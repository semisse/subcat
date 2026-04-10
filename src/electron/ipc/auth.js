const { ipcMain, shell } = require('electron');

function register({ auth, storage, getWindow, getLoginWindow, setCurrentUser, createMainWindow, createLoginWindow }) {
    ipcMain.handle('auth-get-status', async () => {
        const token = storage.loadToken();
        if (!token) return { loggedIn: false };
        try {
            const user = await auth.fetchUser(token);
            return { loggedIn: true, login: user.login, avatarUrl: user.avatar_url };
        } catch {
            storage.clearToken();
            return { loggedIn: false };
        }
    });

    ipcMain.handle('auth-start-login', async () => {
        try {
            const flow = await auth.startDeviceFlow();
            shell.openExternal(flow.verificationUri);
            auth.pollForToken(flow.deviceCode, flow.interval)
                .then(async (token) => {
                    storage.storeToken(token);
                    const user = await auth.fetchUser(token);
                    setCurrentUser(user);
                    createMainWindow();
                    getLoginWindow()?.close();
                })
                .catch((err) => {
                    getLoginWindow()?.webContents.send('auth-error', { error: err.message });
                });
            return { userCode: flow.userCode, verificationUri: flow.verificationUri };
        } catch (err) {
            return { error: err.message };
        }
    });

    ipcMain.handle('auth-logout', async () => {
        storage.clearToken();
        setCurrentUser(null);
        createLoginWindow();
        getWindow()?.close();
        return { ok: true };
    });
}

module.exports = { register };
