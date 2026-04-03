const { app, BrowserWindow, ipcMain, Notification, nativeImage, shell, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const auth = require('./auth');
const { parseGitHubUrl, parsePRUrl, fetchRunStatus, fetchPRRuns, fetchFailedTests, rerunWorkflow, rerunFailedJobs, cancelRun } = require('./github');
const db = require('./db');
const poller = require('./poller');

app.setName('SubCat');

app.setAboutPanelOptions({
    applicationName: 'SubCat',
    applicationVersion: app.getVersion(),
    copyright: '© Samuel Fialho',
    tagline: 'Today we dream. Tomorrow we build.',
    credits: 'Today we dream. Tomorrow we build.',
    website: 'https://github.com/semisse/subcat',
    iconPath: path.join(__dirname, 'assets', 'Icon-iOS-Default-1024x1024@1x.png'),
});

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

poller.on('run:all-done', ({ runId, repeatTotal, passed, failed, failedTests }) => {
    mainWindow?.webContents.send('run-report-ready', { runId, repeatTotal, passed, failed, failedTests });
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
            mainWindow.webContents.on('did-finish-load', () => resumeRuns());
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

ipcMain.handle('fetch-pr-runs', async (event, url) => {
    const parsed = parsePRUrl(url);
    if (!parsed) return { error: 'Invalid GitHub PR URL.' };
    try {
        const runs = await fetchPRRuns(parsed.owner, parsed.repo, parsed.prNumber, getActiveToken());
        return { runs };
    } catch (err) {
        return { error: err.message };
    }
});

ipcMain.handle('start-watching', async (event, { url, repeatTotal = 1 }) => {
    const parsed = parseGitHubUrl(url);
    if (!parsed) {
        return { error: 'Invalid GitHub Actions URL. Expected format: https://github.com/{owner}/{repo}/actions/runs/{run_id}' };
    }

    const repeat = Math.floor(Number(repeatTotal));
    if (!Number.isFinite(repeat) || repeat < 1 || repeat > 100) {
        return { error: 'Repeat count must be a number between 1 and 100.' };
    }

    const { owner, repo, runId } = parsed;

    if (poller.isActive(runId)) {
        return { error: 'Already watching this run.' };
    }

    try {
        const initial = await fetchRunStatus(owner, repo, runId, getActiveToken());

        if (initial.status === 'completed' && repeat === 1) {
            const name = initial.display_title || initial.name;
            if (db.getRun(runId)) {
                return { error: 'This run is already in the list.' };
            }
            const failedTests = initial.conclusion !== 'success'
                ? await fetchFailedTests(owner, repo, runId, getActiveToken()).catch(() => [])
                : [];
            db.addRun({ id: runId, currentRunId: runId, owner, repo, workflowId: initial.workflow_id, name, url: initial.html_url, repeatTotal: 1, runNumber: 1 });
            db.addRunResult({ runId, number: 1, conclusion: initial.conclusion, url: initial.html_url, startedAt: initial.run_started_at, completedAt: initial.updated_at, failedTests });
            db.updateRun(runId, { status: 'completed' });
            return {
                started: true,
                runId,
                name,
                status: 'completed',
                conclusion: initial.conclusion,
                url: initial.html_url,
                repeatTotal: 1,
                failed: initial.conclusion !== 'success' ? 1 : 0,
                failedTests,
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
            repeatTotal: repeat,
            runNumber,
        });

        poller.start({ runId, currentRunId, owner, repo, runNumber, repeatTotal: repeat, name: initial.display_title || initial.name, url: initial.html_url }, getActiveToken);

        return {
            started: true,
            runId,
            name: initial.display_title || initial.name,
            status: initial.status === 'completed' ? 'queued' : initial.status,
            url: initial.html_url,
            repeatTotal: repeat,
        };
    } catch (err) {
        return { error: err.message };
    }
});

ipcMain.handle('confirm-dialog', async (event, { title, message }) => {
    const { response } = await dialog.showMessageBox(mainWindow, {
        type: 'warning',
        buttons: ['Stop & Remove', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        title,
        message: title,
        detail: message,
    });
    return response === 0;
});

ipcMain.handle('stop-watching', async (event, runId) => {
    poller.stop(runId);
    return { stopped: true };
});

ipcMain.handle('rerun-run', async (event, runId) => {
    const run = db.getRun(runId);
    if (!run) return { error: 'Run not found.' };
    try {
        await rerunWorkflow(run.owner, run.repo, run.current_run_id, getActiveToken());
        db.clearRunResults(runId);
        db.updateRun(runId, { status: 'watching', runNumber: 1 });
        poller.start({
            runId,
            currentRunId: run.current_run_id,
            owner: run.owner,
            repo: run.repo,
            runNumber: 1,
            repeatTotal: run.repeat_total,
            name: run.name,
            url: run.url,
        }, getActiveToken);
        return { started: true, status: 'queued' };
    } catch (err) {
        return { error: err.message };
    }
});

ipcMain.handle('rerun-failed-run', async (event, runId) => {
    const run = db.getRun(runId);
    if (!run) return { error: 'Run not found.' };
    try {
        await rerunFailedJobs(run.owner, run.repo, run.current_run_id, getActiveToken());
        db.clearRunResults(runId);
        db.updateRun(runId, { status: 'watching', runNumber: 1 });
        poller.start({
            runId,
            currentRunId: run.current_run_id,
            owner: run.owner,
            repo: run.repo,
            runNumber: 1,
            repeatTotal: run.repeat_total,
            name: run.name,
            url: run.url,
        }, getActiveToken);
        return { started: true, status: 'queued' };
    } catch (err) {
        return { error: err.message };
    }
});

ipcMain.handle('cancel-run', async (event, runId) => {
    const run = db.getRun(runId);
    if (!run) return { error: 'Run not found.' };
    try {
        poller.deactivate(runId);
        await cancelRun(run.owner, run.repo, run.current_run_id, getActiveToken());
        db.removeRun(runId);
        return { cancelled: true };
    } catch (err) {
        return { error: err.message };
    }
});

ipcMain.handle('open-external', async (event, url) => {
    if (url.startsWith('https://')) shell.openExternal(url);
});

ipcMain.handle('get-version', () => app.getVersion());

ipcMain.handle('show-about', () => app.showAboutPanel());

ipcMain.handle('refresh-runs', () => resumeRuns());

ipcMain.handle('save-report', async (event, runId) => {
    const report = db.getReport(runId);
    if (!report) return { error: 'No report available.' };

    const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Run Report',
        defaultPath: `subcat-report-${runId}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
    });

    if (!filePath) return { cancelled: true };

    const passed = report.rows.filter(r => r.conclusion === 'success').length;
    const failed = report.rows.length - passed;
    const lines = [
        `# ${report.name}`,
        '',
        `**Runs:** ${report.rows.length} · **Passed:** ${passed} · **Failed:** ${failed}`,
        '',
        '| Run # | Result | Started At | Completed At | Failed Tests |',
        '|-------|--------|------------|--------------|--------------|',
        ...report.rows.map(r => {
            const emoji = r.conclusion === 'success' ? '✅' : '❌';
            const tests = r.failedTests?.length ? r.failedTests.join(', ') : '—';
            return `| [${r.number}](${r.url}) | ${emoji} ${r.conclusion} | ${r.started_at ?? '—'} | ${r.completed_at ?? '—'} | ${tests} |`;
        }),
    ];
    require('fs').writeFileSync(filePath, lines.join('\n'), 'utf8');

    return { saved: true };
});
