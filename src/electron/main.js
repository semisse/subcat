const { app, BrowserWindow, ipcMain, Menu, nativeImage, shell, dialog } = require('electron');
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

const isMac = process.platform === 'darwin';

if (isMac) {
    app.setAboutPanelOptions({
        applicationName: 'SubCat',
        applicationVersion: app.getVersion(),
        copyright: '© Samuel Fialho',
        tagline: 'Stop babysitting your PRs. SubCat watches GitHub Actions runs and investigates flaky tests — so you don\'t have to.',
        credits: 'Stop babysitting your PRs. SubCat watches GitHub Actions runs and investigates flaky tests — so you don\'t have to.',
        website: 'https://github.com/semisse/subcat',
        iconPath: path.join(__dirname, '../../assets', 'Icon-iOS-Default-1024x1024@1x.png'),
    });
}

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
    await storage.initialize();

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
            await storage.clearToken();
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

    const winHelpMenu = !isMac ? [
        {
            label: 'Help',
            submenu: [
                {
                    label: 'About SubCat',
                    click: () => ipcMain.emit('show-about')
                },
                { type: 'separator' },
                {
                    label: 'Learn More',
                    click: () => shell.openExternal('https://github.com/semisse/subcat')
                }
            ]
        }
    ] : [];

    const template = [
        ...macAppMenu,
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Watch…',
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
            label: 'Window',
            submenu: [
                { role: 'minimize' },
                { role: 'zoom' },
                ...(isMac ? [{ role: 'front' }] : [])
            ]
        },
        ...winHelpMenu
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

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
ipcReports.register({ db, getWindow });

// ─── IPC: misc ────────────────────────────────────────────────────────────────

ipcMain.handle('open-external', async (event, url) => {
    if (url.startsWith('https://github.com/')) shell.openExternal(url);
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
            detail: 'Stop babysitting your PRs. SubCat watches GitHub Actions runs and investigates flaky tests — so you don\'t have to.\n\n© Samuel Fialho\nhttps://github.com/semisse/subcat',
            buttons: ['OK'],
            defaultId: 0
        });
    }
});

ipcMain.handle('refresh-runs', () => {
    const sendToWindow = (ch, data) => mainWindow?.webContents.send(ch, data);
    runs.resumeRuns({ db, poller, getToken, sendToWindow });
    runs.resumePinnedWorkflows({ db, getToken, sendToWindow });
});
