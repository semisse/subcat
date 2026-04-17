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

// Paths flow into `docker -v src:dest:opts` args. A `:` in any of the three
// volume fields would let docker reinterpret tokens (e.g. mount arbitrary host
// paths or inject read/write flags). Also reject `..` in envTarget to prevent
// the resolved container path from escaping /app.
function validateStartInput(payload) {
    if (!payload || typeof payload !== 'object') return 'Invalid request payload.';
    const { repoPath, testCommand, envFile, envTarget, repeat, cpus, memoryGb,
        maxWorkers, ulimitNofile, networkLatency, cpuStress, packetLoss, staleRead,
        platform, installCommand, timezone } = payload;

    if (typeof repoPath !== 'string' || !repoPath.trim()) return 'Repository path is required.';
    if (typeof testCommand !== 'string' || !testCommand.trim()) return 'Test command is required.';

    const unsafePathChars = /[:,;\n\r]/;
    if (unsafePathChars.test(repoPath)) return 'Repository path contains invalid characters.';
    if (typeof envFile === 'string' && envFile && unsafePathChars.test(envFile)) {
        return 'Env file path contains invalid characters.';
    }
    if (typeof envTarget === 'string' && envTarget) {
        if (unsafePathChars.test(envTarget)) return 'Env target contains invalid characters.';
        if (envTarget.split('/').some(seg => seg === '..')) return 'Env target cannot traverse parent directories.';
    }

    // testCommand and installCommand are concatenated into a `sh -c` string
    // inside the container. Newlines would break the `for i in $(seq ...); do
    // CMD; done` loop that drives repeat runs, and a null byte would truncate
    // the command silently. The __SUBCAT_DONE__ sentinel is injected between
    // iterations; if the user's command prints it, progress tracking breaks.
    const unsafeCmdChars = /[\n\r\0]/;
    const SENTINEL = '__SUBCAT_DONE__';
    if (unsafeCmdChars.test(testCommand)) return 'Test command contains invalid characters.';
    if (testCommand.includes(SENTINEL)) return 'Test command cannot contain the reserved sentinel.';
    if (testCommand.length > 4096) return 'Test command is too long.';

    if (installCommand != null) {
        if (typeof installCommand !== 'string') return 'Install command must be a string.';
        if (installCommand) {
            if (unsafeCmdChars.test(installCommand)) return 'Install command contains invalid characters.';
            if (installCommand.includes(SENTINEL)) return 'Install command cannot contain the reserved sentinel.';
            if (installCommand.length > 4096) return 'Install command is too long.';
        }
    }

    // Timezone becomes `-e TZ=<value>` on the docker CLI. It's an array arg so
    // shell metacharacters can't escape, but bad values still produce confusing
    // container errors. IANA tz names are [A-Za-z0-9_/+-] with a reasonable cap.
    if (timezone != null && timezone !== '') {
        if (typeof timezone !== 'string') return 'Timezone must be a string.';
        if (!/^[A-Za-z0-9_/+-]{1,64}$/.test(timezone)) return 'Timezone contains invalid characters.';
    }

    const intBound = (v, name, min, max) => {
        if (v == null) return null;
        if (!Number.isInteger(v) || v < min || v > max) return `${name} must be an integer between ${min} and ${max}.`;
        return null;
    };
    const numBound = (v, name, min, max) => {
        if (v == null) return null;
        if (!Number.isFinite(v) || v < min || v > max) return `${name} must be between ${min} and ${max}.`;
        return null;
    };

    const bounds = [
        intBound(repeat, 'Repeat', 1, 1000),
        numBound(cpus, 'CPUs', 0.1, 128),
        numBound(memoryGb, 'Memory (GB)', 0.25, 2048),
        intBound(maxWorkers, 'Max workers', 1, 256),
        intBound(ulimitNofile, 'ulimit nofile', 256, 1048576),
        intBound(networkLatency, 'Network latency (ms)', 0, 60000),
        intBound(cpuStress, 'CPU stress workers', 1, 256),
        intBound(packetLoss, 'Packet loss %', 0, 100),
        intBound(staleRead, 'Stale read (ms)', 0, 60000),
    ].find(Boolean);
    if (bounds) return bounds;

    if (platform != null && platform !== 'linux/amd64') return 'Invalid platform.';
    return null;
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
    // Runs explicitly cancelled by the user. The runner still emits `done`/
    // `error` after docker kill, but we must not override the 'cancelled' DB
    // status nor fire a "Lab Test failed" notification for a user-requested stop.
    const cancelledRuns = new Set();

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

    handle('local-run:start', async (event, payload) => {
        const validationError = validateStartInput(payload);
        if (validationError) return { error: validationError };
        const { repoPath, testCommand, repeat, cpus, memoryGb, randomize, timezone, maxWorkers, ulimitNofile, networkLatency, cpuStress, packetLoss, staleRead, envFile, envTarget, installCommand, platform } = payload;
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
            if (cancelledRuns.has(id)) {
                cancelledRuns.delete(id);
                activeRunners.delete(id);
                return;
            }
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
            if (cancelledRuns.has(id)) {
                cancelledRuns.delete(id);
                activeRunners.delete(id);
                return;
            }
            db.updateLocalRun(id, {
                status: 'failed',
                completedAt: new Date().toISOString(),
            });
            activeRunners.delete(id);
            getWindow()?.webContents.send('local-run:done', { id, results: { error: err.message } });
            notifyLabTestDone({ results: null, repeat, status: 'failed', error: err.message });
        });

        runner.start().catch(err => runner.emit('error', err));
        return { id };
    });

    handle('local-run:stop', async (event, { id }) => {
        const runner = activeRunners.get(id);
        if (runner) {
            cancelledRuns.add(id);
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

module.exports = { register, validateStartInput };
