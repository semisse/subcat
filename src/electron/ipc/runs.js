const { ipcMain, dialog } = require('electron');
const runs = require('../../core/runs');

function register({ db, poller, storage, getWindow, getUser }) {
    const getToken = () => storage.loadToken() || undefined;

    poller.on('run:new-attempt', ({ owner, repo, runId }) => {
        getWindow()?.webContents.send('workflow-run-appeared', { owner, repo, runId });
    });

    ipcMain.handle('fetch-user-prs', async () => {
        const user = getUser();
        return runs.fetchUserPRsHandler(user?.login, { getToken });
    });

    ipcMain.handle('fetch-pr-runs', async (event, url) => {
        return runs.fetchPRRunsHandler(url, { getToken });
    });

    ipcMain.handle('fetch-run-attempts', async (event, opts) => {
        return runs.fetchRunAttemptsHandler(opts, { getToken });
    });

    ipcMain.handle('fetch-pr-reviews', async (event, opts) => {
        return runs.fetchPRReviewsHandler(opts, { getToken });
    });

    ipcMain.handle('start-watching', async (event, opts) => {
        return runs.startWatching(opts, { db, poller, getToken });
    });

    ipcMain.handle('confirm-dialog', async (event, { title, message }) => {
        const { response } = await dialog.showMessageBox(getWindow(), {
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
        return runs.stopWatching(runId, { poller });
    });

    ipcMain.handle('rerun-run', async (event, runId) => {
        return runs.rerunRun(runId, { db, poller, getToken });
    });

    ipcMain.handle('rerun-failed-run', async (event, runId) => {
        return runs.rerunFailedRun(runId, { db, poller, getToken });
    });

    ipcMain.handle('cancel-run', async (event, runId) => {
        return runs.cancelRunHandler(runId, { db, poller, getToken });
    });

    ipcMain.handle('rerun-run-direct', async (event, { owner, repo, runId }) => {
        return runs.rerunRunDirect(owner, repo, runId, { getToken });
    });

    ipcMain.handle('watch-workflow-rerun', async (event, { owner, repo, runId, previousAttemptCount }) => {
        return runs.watchWorkflowRerun({ owner, repo, runId, previousAttemptCount }, { getToken, poller });
    });

    ipcMain.handle('pin-workflow', async (event, url) => {
        return runs.pinWorkflow({ url }, {
            db,
            getToken,
            onUpdate: (data) => getWindow()?.webContents.send('pinned-workflow-update', data),
        });
    });

    ipcMain.handle('unpin-workflow', async (event, id) => {
        return runs.unpinWorkflow(id, { db });
    });
}

module.exports = { register };
