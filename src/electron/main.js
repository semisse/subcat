const { app, BrowserWindow, ipcMain, nativeImage, shell, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const db = require('../../src/db');
const PollManager = require('../../src/core/poller');
const auth = require('../../src/core/auth');
const storage = require('./storage');
const notifications = require('./notifications');
const runs = require('../../src/core/runs');

const ipcAuth = require('./ipc/auth');
const ipcRuns = require('./ipc/runs');
const ipcReports = require('./ipc/reports');

app.setName('SubCat');

app.setAboutPanelOptions({
    applicationName: 'SubCat',
    applicationVersion: app.getVersion(),
    copyright: '© Samuel Fialho',
    tagline: 'Today we dream. Tomorrow we build.',
    credits: 'Today we dream. Tomorrow we build.',
    website: 'https://github.com/semisse/subcat',
    iconPath: path.join(__dirname, '../../assets', 'Icon-iOS-Default-1024x1024@1x.png'),
});

if (process.env.NODE_ENV === 'development') {
    require('electron-reload')(path.join(__dirname, '../../'), {
        electron: path.join(__dirname, '../../node_modules', '.bin', 'electron')
    });
}

const poller = new PollManager(db);

let mainWindow;
let loginWindow;
let currentUser = null;

const appIcon = nativeImage.createFromPath(path.join(__dirname, '../../assets', 'Icon-iOS-Default-1024x1024@1x.png'));

const windowPrefs = {
    icon: appIcon,
    webPreferences: {
        preload: path.join(__dirname, '../../renderer/preload.js'),
        contextIsolation: true,
        nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar'
};

function createLoginWindow() {
    loginWindow = new BrowserWindow({ width: 400, height: 500, resizable: false, ...windowPrefs });
    loginWindow.loadFile(path.join(__dirname, '../../login.html'));
    loginWindow.on('closed', () => { loginWindow = null; });
}

function createMainWindow() {
    mainWindow = new BrowserWindow({ width: 560, height: 680, resizable: true, ...windowPrefs });
    mainWindow.loadFile(path.join(__dirname, '../../index.html'));
    mainWindow.on('closed', () => { mainWindow = null; });
}

const getWindow = () => mainWindow;
const getLoginWindow = () => loginWindow;
const getToken = () => storage.loadToken() || undefined;

// ─── Poller events → IPC + notifications ─────────────────────────────────────

notifications.register(poller, getWindow);

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
    app.dock?.setIcon(appIcon);
    const token = storage.loadToken();
    if (token) {
        try {
            currentUser = await auth.fetchUser(token);
            createMainWindow();
            mainWindow.webContents.on('did-finish-load', () => {
                runs.resumeRuns({
                    db,
                    poller,
                    getToken,
                    sendToWindow: (ch, data) => mainWindow?.webContents.send(ch, data),
                });
            });
        } catch {
            storage.clearToken();
            createLoginWindow();
        }
    } else {
        createLoginWindow();
    }
});

app.on('window-all-closed', () => { app.quit(); });

// ─── Auto-update ──────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== 'development') {
    autoUpdater.checkForUpdates();

    autoUpdater.on('update-downloaded', () => {
        const dialogParent = mainWindow ?? undefined;
        dialog.showMessageBox(dialogParent, {
            type: 'info',
            buttons: ['Restart', 'Later'],
            defaultId: 0,
            cancelId: 1,
            title: 'Update ready',
            message: 'A new version of SubCat has been downloaded.',
            detail: 'Restart the app to apply the update.',
        }).then(({ response }) => {
            if (response === 0) autoUpdater.quitAndInstall();
        });
    });
}

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createLoginWindow();
});

// ─── IPC: auth, runs, reports ─────────────────────────────────────────────────

ipcAuth.register({ auth, storage, getWindow, getLoginWindow, setCurrentUser: u => { currentUser = u; }, createMainWindow, createLoginWindow });
ipcRuns.register({ db, poller, storage, getWindow, getUser: () => currentUser });
ipcReports.register({ db, getWindow });

// ─── IPC: misc ────────────────────────────────────────────────────────────────

ipcMain.handle('open-external', async (event, url) => {
    if (url.startsWith('https://github.com/')) shell.openExternal(url);
});

ipcMain.handle('get-version', () => app.getVersion());

ipcMain.handle('show-about', () => app.showAboutPanel());

ipcMain.handle('refresh-runs', () => {
    runs.resumeRuns({
        db,
        poller,
        getToken,
        sendToWindow: (ch, data) => mainWindow?.webContents.send(ch, data),
    });
});
