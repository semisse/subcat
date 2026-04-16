const { ipcMain, dialog, Notification } = require('electron');
const fs = require('fs');
const LocalRunner = require('../../core/local-runner');

function handle(channel, handler) {
    try {
        ipcMain.handle(channel, handler);
    } catch {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, handler);
    }
}

function buildLabTestNotification({ results, repeat, status, error }) {
    if (error) {
        return { title: '❌ Lab Test failed', body: error, conclusion: 'failure' };
    }
    const { passed = 0, failed = 0, flaky = 0 } = results || {};
    const ok = status === 'completed' && failed === 0;
    const parts = [`${repeat} run${repeat === 1 ? '' : 's'}`];
    if (passed) parts.push(`${passed} passed`);
    if (failed) parts.push(`${failed} failed`);
    if (flaky) parts.push(`${flaky} flaky`);
    return {
        title: ok ? '✅ Lab Test passed' : '❌ Lab Test failed',
        body: parts.join(' · '),
        conclusion: ok ? 'success' : 'failure',
    };
}

function register({ db, getWindow }) {
    function notifyLabTestDone(payload) {
        const { title, body, conclusion } = buildLabTestNotification(payload);
        if (Notification.isSupported()) new Notification({ title, body }).show();
        if (!db) return;
        const runName = 'Lab Test';
        const record = db.addNotification({ title, body, url: null, conclusion, runName });
        const unread = db.getUnreadNotificationCount();
        getWindow()?.webContents.send('notification-added', {
            id: record.lastInsertRowid,
            title,
            body,
            url: null,
            conclusion,
            run_name: runName,
            triggered_at: new Date().toISOString(),
            read: 0,
            unreadCount: unread,
        });
    }

    const activeRunners = new Map();

    handle('local-run:check-docker', async () => {
        return LocalRunner.checkDocker();
    });

    handle('local-run:browse-folder', async () => {
        const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
        if (result.canceled || !result.filePaths.length) return null;
        return result.filePaths[0];
    });

    handle('local-run:browse-env-file', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openFile', 'showHiddenFiles', 'treatPackageAsDirectory'],
            filters: [{ name: 'All Files', extensions: ['*'] }],
            message: 'Select env file (use Cmd+Shift+. to reveal hidden files)',
        });
        if (result.canceled || !result.filePaths.length) return null;
        return result.filePaths[0];
    });

    handle('local-run:start', async (event, { repoPath, testCommand, repeat, cpus, memoryGb, randomize, timezone, maxWorkers, ulimitNofile, networkLatency, cpuStress, packetLoss, staleRead, envFile, envTarget, installCommand, platform }) => {
        const config = { randomize, timezone, maxWorkers, ulimitNofile, networkLatency, cpuStress, packetLoss, staleRead, envFile, envTarget, installCommand, platform };
        const id = db.insertLocalRun({ repoPath, testCommand, cpus, memoryGb, repeat, config });

        const runner = new LocalRunner({ repoPath, testCommand, repeat, cpus, memoryGb, randomize, timezone, maxWorkers, ulimitNofile, networkLatency, cpuStress, packetLoss, staleRead, envFile, envTarget, installCommand, platform });
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
            notifyLabTestDone({ results, repeat, status });
        });

        runner.on('error', (err) => {
            db.updateLocalRun(id, {
                status: 'failed',
                completedAt: new Date().toISOString(),
            });
            activeRunners.delete(id);
            getWindow()?.webContents.send('local-run:done', { id, results: { error: err.message } });
            notifyLabTestDone({ results: null, repeat, status: 'failed', error: err.message });
        });

        runner.start();
        // Emit docker command after returning id so renderer has activeRunId set
        setImmediate(() => {
            if (runner._dockerCmd) {
                getWindow()?.webContents.send('local-run:output', { id, line: runner._dockerCmd });
            }
        });
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

    handle('local-run:save-report', async (event, { id }) => {
        const run = db.getLocalRun(id);
        if (!run) return { error: 'Run not found.' };

        const project = run.repo_path.replace(/\/+$/, '').split('/').pop();
        const config = run.config ? JSON.parse(run.config) : {};

        const { filePath } = await dialog.showSaveDialog(getWindow(), {
            title: 'Save Lab Test Report',
            defaultPath: `subcat-lab-${project}-${new Date().toISOString().slice(0, 10)}.md`,
            filters: [{ name: 'Markdown', extensions: ['md'] }],
        });
        if (!filePath) return { cancelled: true };

        const repeat = run.repeat_count || 1;
        const perRun = (n) => repeat > 1 ? Math.round((n || 0) / repeat) : (n || 0);
        const p = perRun(run.passed);
        const f = perRun(run.failed);
        const fl = perRun(run.flaky || 0);
        const total = p + f + fl;

        let badge;
        if (f === 0 && fl === 0) badge = 'Stable';
        else if (f < total / 2) badge = 'Probably flaky';
        else badge = 'Flaky';

        const lines = [
            `# Lab Test Report — ${project}`,
            '',
            `**Stability:** ${badge}`,
            `**Runs:** ${repeat} | **Passed:** ${run.passed || 0} | **Failed:** ${run.failed || 0} | **Flaky:** ${run.flaky || 0}`,
            `**Per-run average:** ${p} passed, ${f} failed, ${fl} flaky`,
            `**Command:** \`${run.test_command}\``,
            `**Resources:** ${run.cpus} CPUs, ${run.memory_gb} GB RAM`,
        ];

        const stressItems = [];
        if (config.randomize) stressItems.push('Randomized order');
        if (config.timezone) stressItems.push(`Timezone: ${config.timezone}`);
        if (config.maxWorkers) stressItems.push(`Max workers: ${config.maxWorkers}`);
        if (config.ulimitNofile) stressItems.push(`File descriptor limit: ${config.ulimitNofile}`);
        if (config.networkLatency) stressItems.push(`Network latency: ${config.networkLatency}ms`);
        if (config.cpuStress) stressItems.push(`CPU stress workers: ${config.cpuStress}`);
        if (config.packetLoss) stressItems.push(`Packet loss: ${config.packetLoss}%`);
        if (config.staleRead) stressItems.push(`Stale read delay: ${config.staleRead}ms`);
        if (config.envFile) stressItems.push(`Env file: ${config.envFile}`);
        if (config.installCommand) stressItems.push(`Install: \`${config.installCommand}\``);

        if (stressItems.length > 0) {
            lines.push('', '## Stress Factors', '');
            stressItems.forEach(s => lines.push(`- ${s}`));
        }

        const failedNames = run.failed_test_names ? JSON.parse(run.failed_test_names) : [];
        if (failedNames.length > 0) {
            lines.push('', '## Failed Tests', '');
            failedNames.forEach(n => lines.push(`- ${n}`));
        }

        lines.push('', '---', `*Generated by [SubCat](https://subcat.todaywedream.com) on ${new Date().toISOString().slice(0, 10)}*`);

        fs.writeFileSync(filePath, lines.join('\n'), 'utf8');

        db.addSavedReport({
            title: `Lab: ${project}`,
            type: 'lab-test',
            filePath,
            total: repeat,
            passed: run.passed || 0,
            failed: run.failed || 0,
            flakiness: badge,
        });

        return { saved: true };
    });
}

module.exports = { register };
