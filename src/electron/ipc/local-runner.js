const { ipcMain, dialog } = require('electron');
const LocalRunner = require('../../core/local-runner');

function handle(channel, handler) {
    try {
        ipcMain.handle(channel, handler);
    } catch {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, handler);
    }
}

function register({ db, getWindow }) {
    const activeRunners = new Map();

    handle('local-run:check-docker', async () => {
        return LocalRunner.checkDocker();
    });

    handle('local-run:detect-image', async (event, { repoPath }) => {
        const image = await LocalRunner.detectImage(repoPath);
        return { image };
    });

    handle('local-run:browse-folder', async () => {
        const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
        if (result.canceled || !result.filePaths.length) return null;
        return result.filePaths[0];
    });

    handle('local-run:start', async (event, { repoPath, testCommand, repeat, cpus, memoryGb, randomize, timezone, maxWorkers, ulimitNofile, networkLatency }) => {
        const id = db.insertLocalRun({ repoPath, testCommand, cpus, memoryGb, repeat });

        const runner = new LocalRunner({ repoPath, testCommand, repeat, cpus, memoryGb, randomize, timezone, maxWorkers, ulimitNofile, networkLatency });
        activeRunners.set(id, runner);

        runner.on('line', (line) => {
            getWindow()?.webContents.send('local-run:output', { id, line });
        });

        runner.on('progress', ({ completed, total }) => {
            getWindow()?.webContents.send('local-run:progress', { id, completed, total });
        });

        runner.on('done', (results) => {
            const hasResults = results.passed > 0 || results.failed > 0 || results.flaky > 0;
            const status = results.exitCode === 0 || hasResults ? 'completed' : 'failed';
            db.updateLocalRun(id, {
                status,
                passed: results.passed,
                failed: results.failed,
                flaky: results.flaky,
                failedTestNames: results.failedTestNames,
                completedAt: new Date().toISOString(),
            });
            activeRunners.delete(id);
            getWindow()?.webContents.send('local-run:done', { id, results: { ...results, repeat } });
        });

        runner.on('error', (err) => {
            db.updateLocalRun(id, {
                status: 'failed',
                completedAt: new Date().toISOString(),
            });
            activeRunners.delete(id);
            getWindow()?.webContents.send('local-run:done', { id, results: { error: err.message } });
        });

        runner.start();
        return { id };
    });

    handle('local-run:stop', async (event, { id }) => {
        const runner = activeRunners.get(id);
        if (runner) {
            runner.stop();
            activeRunners.delete(id);
        }
        db.updateLocalRun(id, { status: 'cancelled', completedAt: new Date().toISOString() });
    });

    handle('local-run:list', async () => {
        return db.getLocalRuns();
    });

    handle('local-run:get', async (event, { id }) => {
        return db.getLocalRun(id);
    });

    handle('local-run:delete', async (event, { id }) => {
        db.deleteLocalRun(id);
    });
}

module.exports = { register };
