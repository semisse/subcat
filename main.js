const { app, BrowserWindow, ipcMain, Notification, nativeImage, shell, dialog } = require('electron');
const path = require('path');
const auth = require('./auth');
const { parseGitHubUrl, fetchRunStatus, rerunWorkflow } = require('./github');
const db = require('./db');
const poller = require('./poller');

app.setName('SubCat');

if (process.env.NODE_ENV === 'development') {
    require('electron-reload')(__dirname, {
        electron: path.join(__dirname, 'node_modules', '.bin', 'electron')
    });
}

let mainWindow;
let loginWindow;

const appIcon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'Icon-iOS-Default-1024x1024@1x.png'));

const windowPrefs = {
    icon: appIcon,
    webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    vibrancy: 'sidebar'
};

function createLoginWindow() {
    loginWindow = new BrowserWindow({ width: 400, height: 500, resizable: false, ...windowPrefs });
    loginWindow.loadFile('login.html');
    loginWindow.on('closed', () => { loginWindow = null; });
}

function createMainWindow() {
    mainWindow = new BrowserWindow({ width: 560, height: 520, resizable: true, ...windowPrefs });
    mainWindow.loadFile('index.html');
    mainWindow.on('closed', () => { mainWindow = null; });
}

function getActiveToken() {
    return auth.loadToken() || undefined;
}

// ─── Poller events → IPC + notifications ─────────────────────────────────────

poller.on('run:update', (data) => {
    mainWindow?.webContents.send('run-update', data);
});

poller.on('run:repeat-done', ({ runId, runNumber, conclusion, name, url, repeatTotal }) => {
    const emoji = conclusion === 'success' ? '✅' : '❌';
    const label = repeatTotal > 1 ? `Run ${runNumber}/${repeatTotal}` : name;
    const notification = new Notification({
        title: `${emoji} ${label}`,
        body: repeatTotal > 1 ? `${name} · ${conclusion}` : conclusion,
    });
    notification.on('click', () => shell.openExternal(url));
    notification.show();
});

poller.on('run:all-done', ({ runId, repeatTotal, passed, failed }) => {
    mainWindow?.webContents.send('run-report-ready', { runId, repeatTotal, passed, failed });
});

poller.on('run:error', (data) => {
    mainWindow?.webContents.send('run-error', data);
});

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
    app.dock?.setIcon(appIcon);
    const token = auth.loadToken();
    if (token) {
        try {
            await auth.fetchUser(token);
            createMainWindow();
            mainWindow.webContents.once('did-finish-load', () => resumeRuns());
        } catch {
            auth.clearToken();
            createLoginWindow();
        }
    } else {
        createLoginWindow();
    }
});

function resumeRuns() {
    for (const run of db.getAllRuns()) {
        const runResults = db.getRunResults(run.id);
        const results = runResults.map(r => r.conclusion);

        if (run.status === 'watching') {
            const reportRows = runResults.map(r => ({
                number: r.number,
                conclusion: r.conclusion,
                url: r.url,
                started_at: r.started_at,
                completed_at: r.completed_at,
                failedTests: r.failedTests,
            }));
            poller.start({
                runId: run.id,
                currentRunId: run.current_run_id,
                owner: run.owner,
                repo: run.repo,
                runNumber: run.run_number,
                repeatTotal: run.repeat_total,
                name: run.name,
                url: run.url,
                results,
                reportRows,
            }, getActiveToken);
            mainWindow?.webContents.send('run-restored', {
                runId: run.id,
                name: run.name,
                url: run.url,
                repeatTotal: run.repeat_total,
                repeatCurrent: run.run_number,
                results,
                status: 'watching',
            });
        } else {
            const passed = results.filter(r => r === 'success').length;
            mainWindow?.webContents.send('run-restored', {
                runId: run.id,
                name: run.name,
                url: run.url,
                repeatTotal: run.repeat_total,
                repeatCurrent: run.repeat_total,
                results,
                status: 'completed',
                passed,
                failed: run.repeat_total - passed,
            });
        }
    }
}

app.on('window-all-closed', () => { app.quit(); });

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createLoginWindow();
});

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('auth-get-status', async () => {
    const token = auth.loadToken();
    if (!token) return { loggedIn: false };
    try {
        const user = await auth.fetchUser(token);
        return { loggedIn: true, login: user.login, avatarUrl: user.avatar_url };
    } catch {
        auth.clearToken();
        return { loggedIn: false };
    }
});

ipcMain.handle('auth-start-login', async () => {
    try {
        const flow = await auth.startDeviceFlow();
        shell.openExternal(flow.verificationUri);
        auth.pollForToken(flow.deviceCode, flow.interval)
            .then(async (token) => {
                auth.storeToken(token);
                createMainWindow();
                loginWindow?.close();
            })
            .catch((err) => {
                loginWindow?.webContents.send('auth-error', { error: err.message });
            });
        return { userCode: flow.userCode, verificationUri: flow.verificationUri };
    } catch (err) {
        return { error: err.message };
    }
});

ipcMain.handle('auth-logout', async () => {
    auth.clearToken();
    createLoginWindow();
    mainWindow?.close();
    return { ok: true };
});

ipcMain.handle('start-watching', async (event, { url, repeatTotal = 1 }) => {
    const parsed = parseGitHubUrl(url);
    if (!parsed) {
        return { error: 'Invalid GitHub Actions URL. Expected format: https://github.com/{owner}/{repo}/actions/runs/{run_id}' };
    }

    const { owner, repo, runId } = parsed;

    if (poller.isActive(runId)) {
        return { error: 'Already watching this run.' };
    }

    try {
        const initial = await fetchRunStatus(owner, repo, runId, getActiveToken());

        if (initial.status === 'completed' && repeatTotal === 1) {
            return {
                alreadyDone: true,
                name: initial.display_title || initial.name,
                conclusion: initial.conclusion,
                url: initial.html_url,
            };
        }

        let currentRunId = runId;
        let runNumber = 1;

        if (initial.status === 'completed') {
            await rerunWorkflow(owner, repo, runId, getActiveToken());
        }

        db.addRun({
            id: runId,
            currentRunId,
            owner,
            repo,
            workflowId: initial.workflow_id,
            name: initial.display_title || initial.name,
            url: initial.html_url,
            repeatTotal,
            runNumber,
        });

        poller.start({ runId, currentRunId, owner, repo, runNumber, repeatTotal, name: initial.display_title || initial.name, url: initial.html_url }, getActiveToken);

        return {
            started: true,
            runId,
            name: initial.display_title || initial.name,
            status: initial.status === 'completed' ? 'queued' : initial.status,
            url: initial.html_url,
            repeatTotal,
        };
    } catch (err) {
        return { error: err.message };
    }
});

ipcMain.handle('stop-watching', async (event, runId) => {
    poller.stop(runId);
    return { stopped: true };
});

ipcMain.handle('open-external', async (event, url) => {
    shell.openExternal(url);
});

ipcMain.handle('get-version', () => app.getVersion());

ipcMain.handle('save-report', async (event, runId) => {
    const report = db.getReport(runId);
    if (!report) return { error: 'No report available.' };

    const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Run Report',
        defaultPath: `subcat-report-${runId}.csv`,
        filters: [{ name: 'CSV', extensions: ['csv'] }],
    });

    if (!filePath) return { cancelled: true };

    const csv = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = 'Run #,Result,Failed Tests,Started At,Completed At,URL';
    const rows = report.rows.map(r => [
        r.number,
        r.conclusion,
        r.failedTests?.length ? csv(r.failedTests.join(' | ')) : '-',
        csv(r.started_at ?? ''),
        csv(r.completed_at ?? ''),
        csv(r.url),
    ].join(','));
    require('fs').writeFileSync(filePath, [header, ...rows].join('\n'), 'utf8');

    return { saved: true };
});
