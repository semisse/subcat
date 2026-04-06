const { ipcMain, dialog } = require('electron');
const runs = require('../../core/runs');

// Wrapper to avoid "Attempted to register a second handler" errors on hot-reload.
// Re-registers the handler atomically so there's no gap where no handler exists.
function handle(channel, handler) {
    try {
        ipcMain.handle(channel, handler);
    } catch {
        // Already registered (hot-reload): replace in place without removing first
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, handler);
    }
}

function register({ db, poller, storage, getWindow, getUser }) {
    const getToken = () => storage.loadToken() || undefined;

    poller.on('run:new-attempt', ({ owner, repo, runId }) => {
        getWindow()?.webContents.send('workflow-run-appeared', { owner, repo, runId });
    });

    handle('fetch-user-prs', async () => {
        const user = getUser();
        return runs.fetchUserPRsHandler(user?.login, { getToken });
    });

    handle('fetch-pr-runs', async (event, url) => {
        return runs.fetchPRRunsHandler(url, { getToken });
    });

    handle('fetch-run-attempts', async (event, opts) => {
        return runs.fetchRunAttemptsHandler(opts, { getToken });
    });

    handle('fetch-pr-reviews', async (event, opts) => {
        return runs.fetchPRReviewsHandler(opts, { getToken });
    });

    handle('start-watching', async (event, opts) => {
        return runs.startWatching(opts, { db, poller, getToken });
    });

    handle('confirm-dialog', async (event, { title, message }) => {
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

    handle('stop-watching', async (event, runId) => {
        return runs.stopWatching(runId, { poller });
    });

    handle('rerun-run', async (event, runId) => {
        return runs.rerunRun(runId, { db, poller, getToken });
    });

    handle('rerun-failed-run', async (event, runId) => {
        return runs.rerunFailedRun(runId, { db, poller, getToken });
    });

    handle('cancel-run', async (event, runId) => {
        return runs.cancelRunHandler(runId, { db, poller, getToken });
    });

    handle('rerun-run-direct', async (event, { owner, repo, runId }) => {
        return runs.rerunRunDirect(owner, repo, runId, { getToken });
    });

    handle('cancel-run-direct', async (event, { owner, repo, runId }) => {
        return runs.cancelRunDirect(owner, repo, runId, { getToken });
    });

    handle('watch-workflow-rerun', async (event, { owner, repo, runId, previousAttemptCount }) => {
        return runs.watchWorkflowRerun({ owner, repo, runId, previousAttemptCount }, { getToken, poller });
    });

    handle('pin-workflow', async (event, url) => {
        return runs.pinWorkflow({ url }, {
            db,
            getToken,
            onUpdate: (data) => getWindow()?.webContents.send('pinned-workflow-update', data),
        });
    });

    handle('unpin-workflow', async (event, id) => {
        return runs.unpinWorkflow(id, { db });
    });

    handle('save-pending-rerun', async (event, opts) => {
        db.savePendingRerun(opts);
    });

    handle('get-pending-rerun', async (event, opts) => {
        return db.getPendingRerun(opts);
    });

    handle('delete-pending-rerun', async (event, opts) => {
        db.deletePendingRerun(opts);
    });
}

module.exports = { register };
