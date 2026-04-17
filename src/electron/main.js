const { app, BrowserWindow, ipcMain, Menu, nativeImage, shell, dialog } = require('electron');

app.commandLine.appendSwitch('disable-features', 'AutofillServerCommunication,AutofillAddressProfileSavePrompt');
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
const ipcFlags = require('./ipc/flags');
const ipcLocalRunner = require('./ipc/local-runner');

app.setName('SubCat');

// GUI-launched apps on macOS don't inherit the shell PATH, so `spawn('docker')`
// fails with ENOENT even when Docker Desktop is running. Prepend the standard
// locations (Intel Homebrew, Apple Silicon Homebrew, Docker Desktop bundle) so
// the Lab Test runner can find the binary regardless of how the app was opened.
if (process.platform === 'darwin') {
    const extraPath = [
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/Applications/Docker.app/Contents/Resources/bin',
    ].join(':');
    process.env.PATH = process.env.PATH ? `${extraPath}:${process.env.PATH}` : extraPath;
}

if (process.env.SUBCAT_E2E) {
    const os = require('os');
    app.setPath('userData', require('fs').mkdtempSync(path.join(os.tmpdir(), 'subcat-e2e-')));
}

const isMac = process.platform === 'darwin';

if (isMac) {
    app.setAboutPanelOptions({
        applicationName: 'SubCat',
        applicationVersion: app.getVersion(),
        copyright: '© Samuel Fialho',
        tagline: 'Stop babysitting your PRs. SubCat watches GitHub Actions runs and investigates flaky tests — so you don\'t have to.',
        credits: 'Stop babysitting your PRs. SubCat watches GitHub Actions runs and investigates flaky tests — so you don\'t have to.\n\nSupport SubCat:\n♥ github.com/sponsors/semisse\n☕ ko-fi.com/semisse\n☕ buymeacoffee.com/semisse',
        website: 'https://github.com/semisse/subcat',
        iconPath: path.join(__dirname, '../../assets', 'Icon-iOS-Default-1024x1024@1x.png'),
    });
}

if (process.env.NODE_ENV === 'development') {
    require('electron-reload')(path.join(__dirname, '../../'), {
        electron: path.join(__dirname, '../../node_modules', '.bin', 'electron'),
        ignored: /node_modules|test-results|\.git|[/\\]\./,
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
    ...(isMac && {
        titleBarStyle: 'hiddenInset',
        vibrancy: 'sidebar'
    })
};

function createLoginWindow() {
    loginWindow = new BrowserWindow({ width: 400, height: 500, resizable: false, ...windowPrefs });
    loginWindow.loadFile(path.join(__dirname, '../../login.html'));
    loginWindow.on('closed', () => { loginWindow = null; });
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        resizable: true,
        ...windowPrefs  // titleBarStyle: 'hiddenInset' applied on macOS via windowPrefs
    });
    const newRenderer = process.env.SUBCAT_NEW_RENDERER === '1';
    if (newRenderer) {
        if (process.env.NODE_ENV === 'development') {
            mainWindow.loadURL('http://localhost:5173');
        }
        else {
            mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
        }
    }
    else {
        mainWindow.loadFile(path.join(__dirname, '../../index.html'));
    }
    mainWindow.on('closed', () => { mainWindow = null; });
}

const getWindow = () => mainWindow;
const getLoginWindow = () => loginWindow;
const getToken = () => storage.loadToken() || undefined;

// ─── Poller events → IPC + notifications ─────────────────────────────────────

notifications.register(poller, getWindow, db);

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
    if (isMac) {
        app.dock?.setIcon(appIcon);
    }

    buildMenu();

    const token = storage.loadToken();
    if (token) {
        try {
            currentUser = await auth.fetchUser(token);
            createMainWindow();
            mainWindow.webContents.on('did-finish-load', () => {
                const sendToWindow = (ch, data) => mainWindow?.webContents.send(ch, data);
                runs.resumeRuns({ db, poller, getToken, sendToWindow });
                runs.resumePinnedWorkflows({ db, getToken, sendToWindow });
            });
        } catch {
            storage.clearToken();
            createLoginWindow();
        }
    } else {
        createLoginWindow();
    }
});

function buildMenu() {
    const macAppMenu = isMac ? [
        {
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        }
    ] : [];

    const template = [
        ...macAppMenu,
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Watch\u2026',
                    accelerator: 'CmdOrCtrl+N',
                    click() {
                        mainWindow?.webContents.send('open-new-watch');
                    }
                },
                { type: 'separator' },
                { role: 'quit' }
            ]
        },
        {
            label: 'Edit',
            submenu: [
                { role: 'undo' },
                { role: 'redo' },
                { type: 'separator' },
                { role: 'cut' },
                { role: 'copy' },
                { role: 'paste' },
                { role: 'selectAll' }
            ]
        },
        {
            label: 'View',
            submenu: [
                { role: 'reload' },
                ...(process.env.NODE_ENV === 'development' ? [{ role: 'toggleDevTools' }] : []),
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        {
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(isMac ? [{ role: 'front' }] : [])
            ]
        }
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// ─── Auto-update ──────────────────────────────────────────────────────────────

if (process.env.NODE_ENV !== 'development' && !process.env.SUBCAT_E2E) {
    autoUpdater.checkForUpdates();

    autoUpdater.on('update-available', (info) => {
        const record = db.addNotification({
            title: `Update available: v${info.version}`,
            body: 'Downloading in the background…',
            url: null,
            conclusion: 'update',
            runName: '',
        });
        const unread = db.getUnreadNotificationCount();
        getWindow()?.webContents.send('notification-added', {
            id: record.lastInsertRowid,
            title: `Update available: v${info.version}`,
            body: 'Downloading in the background…',
            url: null,
            conclusion: 'update',
            triggered_at: new Date().toISOString(),
            read: 0,
            unreadCount: unread,
        });
    });

    autoUpdater.on('download-progress', (progress) => {
        getWindow()?.webContents.send('update-download-progress', {
            percent: Math.round(progress.percent),
        });
    });

    autoUpdater.on('update-downloaded', (info) => {
        getWindow()?.webContents.send('update-ready', { version: info.version });
    });
}

ipcMain.handle('install-update', () => autoUpdater.quitAndInstall());

app.on('activate', () => {
    if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
    } else if (loginWindow) {
        loginWindow.show();
        loginWindow.focus();
    } else {
        createLoginWindow();
    }
});

// ─── IPC: auth, runs, reports ─────────────────────────────────────────────────

ipcAuth.register({ auth, storage, getWindow, getLoginWindow, setCurrentUser: u => { currentUser = u; }, createMainWindow, createLoginWindow });
ipcRuns.register({ db, poller, storage, getWindow, getUser: () => currentUser });
ipcReports.register({ db, getWindow, getToken: () => storage.loadToken() || undefined });
ipcFlags.register();
ipcLocalRunner.register({ db, getWindow });

// ─── IPC: misc ────────────────────────────────────────────────────────────────

ipcMain.handle('open-external', async (event, url) => {
    const allowed = [
        'https://github.com/',
        'https://subcat.todaywedream.com',
        'https://todaywedream.com',
        'https://ko-fi.com/semisse',
        'https://buymeacoffee.com/semisse',
    ];
    if (allowed.some(prefix => url.startsWith(prefix))) shell.openExternal(url);
});

ipcMain.handle('reveal-in-finder', (event, filePath) => {
    shell.showItemInFolder(filePath);
});

ipcMain.handle('get-version', () => app.getVersion());

ipcMain.handle('show-about', () => {
    if (isMac) {
        app.showAboutPanel();
    } else {
        const { dialog } = require('electron');
        const dialogParent = mainWindow ?? undefined;
        dialog.showMessageBox(dialogParent, {
            type: 'info',
            title: 'About SubCat',
            message: `SubCat ${app.getVersion()}`,
            detail: 'Stop babysitting your PRs. SubCat watches GitHub Actions runs and investigates flaky tests — so you don\'t have to.\n\n© Samuel Fialho\nhttps://github.com/semisse/subcat\n\nSupport SubCat:\n♥ github.com/sponsors/semisse\n☕ ko-fi.com/semisse\n☕ buymeacoffee.com/semisse',
            buttons: ['OK'],
            defaultId: 0
        });
    }
});

// ─── IPC: notification center ─────────────────────────────────────────────────

ipcMain.handle('get-notifications', () => db.getNotifications());
ipcMain.handle('get-unread-notification-count', () => db.getUnreadNotificationCount());
ipcMain.handle('mark-notifications-read', () => db.markAllNotificationsRead());
ipcMain.handle('clear-notifications', () => db.clearNotifications());
