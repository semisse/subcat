const { ipcMain, dialog } = require('electron');
const fs = require('fs');
const { fetchRunArtifacts } = require('../../core/github');
// Single source of truth for the flakiness threshold. renderer/utils.js exports
// the same constant for use in the UI; both must agree or the badge the user
// sees in the app will disagree with the badge on exported reports.
const { FLAKINESS_THRESHOLD_PCT } = require('../../../renderer/utils');

const ROOT_CAUSE_KEYWORDS = {
    Timing: ['timeout', 'timed out', 'element not found', 'not visible', 'wait'],
    'External dependencies': ['network', 'api', 'connection refused', 'econnrefused', 'fetch failed', 'http', 'socket'],
};

function computeFlakiness(failed, total) {
    const pct = total > 0 ? Math.round((failed / total) * 100) : 0;
    if (failed === 0) return 'Stable';
    if (pct < 50) return `Probably flaky — ${failed} of ${total} runs failed (${pct}%) · threshold: ${FLAKINESS_THRESHOLD_PCT}%`;
    return `Flaky — ${failed} of ${total} runs failed (${pct}%) · threshold: ${FLAKINESS_THRESHOLD_PCT}%`;
}

function computeRootCauseHints(rows) {
    const failedRows = rows.filter(r => r.conclusion !== 'success');
    if (failedRows.length === 0 || failedRows.length === rows.length) return [];

    const hints = [];
    const allTestNames = failedRows.flatMap(r => r.failedTests ?? []).join(' ').toLowerCase();

    for (const [category, keywords] of Object.entries(ROOT_CAUSE_KEYWORDS)) {
        if (keywords.some(k => allTestNames.includes(k))) hints.push(category);
    }

    const total = rows.length;
    if (total >= 4) {
        const half = Math.floor(total / 2);
        const firstHalfPassed = rows.slice(0, half).filter(r => r.conclusion === 'success').length;
        const secondHalf = rows.slice(half);
        const secondHalfFailed = secondHalf.filter(r => r.conclusion !== 'success').length;
        if (firstHalfPassed > 0 && secondHalfFailed >= Math.ceil(secondHalf.length / 2)) {
            hints.push('Resource leaks');
        }
    }

    if (hints.length === 0) hints.push('Non-determinism');
    return hints;
}

function register({ db, getWindow, getToken }) {
    ipcMain.handle('save-report', async (event, runId) => {
        const report = db.getReport(runId);
        if (!report) return { error: 'No report available.' };

        const { filePath } = await dialog.showSaveDialog(getWindow(), {
            title: 'Save Run Report',
            defaultPath: `subcat-report-${runId}.md`,
            filters: [{ name: 'Markdown', extensions: ['md'] }],
        });

        if (!filePath) return { cancelled: true };

        const passed = report.rows.filter(r => r.conclusion === 'success').length;
        const failed = report.rows.length - passed;
        const total = report.rows.length;

        const flakinessSummary = computeFlakiness(failed, total);
        const hints = computeRootCauseHints(report.rows);

        // Fetch artifacts for failed runs (best-effort; skip if no token or API error)
        const token = getToken ? getToken() : undefined;
        const artifactsByRunId = new Map();
        if (token) {
            const run = db.getRun ? db.getRun(runId) : null;
            if (run) {
                const failedRows = report.rows.filter(r => r.conclusion !== 'success');
                await Promise.all(failedRows.map(async r => {
                    // Extract the actual run ID from the URL
                    const m = r.url?.match(/\/runs\/(\d+)/);
                    const actualRunId = m?.[1];
                    if (!actualRunId) return;
                    try {
                        const artifacts = await fetchRunArtifacts(run.owner, run.repo, actualRunId, token);
                        if (artifacts.length > 0) artifactsByRunId.set(r.number, artifacts[0].url);
                    } catch (_) { /* ignore */ }
                }));
            }
        }

        const lines = [
            `# ${report.name}`,
            '',
            `**Result:** ${flakinessSummary}`,
            `**Runs:** ${total} · **Passed:** ${passed} · **Failed:** ${failed}`,
        ];

        if (hints.length > 0) {
            lines.push('');
            lines.push(`**Probable root causes:** ${hints.join(', ')}`);
        }

        lines.push(
            '',
            '| Run # | Result | Started At | Completed At | Failed Tests | Artifacts |',
            '|-------|--------|------------|--------------|--------------|-----------|',
            ...report.rows.map(r => {
                const emoji = r.conclusion === 'success' ? '✅' : '❌';
                const tests = r.failedTests?.length ? r.failedTests.join(', ') : '—';
                const artifactLink = artifactsByRunId.has(r.number) ? `[View logs →](${artifactsByRunId.get(r.number)})` : '—';
                return `| [${r.number}](${r.url}) | ${emoji} ${r.conclusion} | ${r.started_at ?? '—'} | ${r.completed_at ?? '—'} | ${tests} | ${artifactLink} |`;
            }),
        );
        lines.push('', '---', '*Made by [SubCat](https://subcat.todaywedream.com)*');
        fs.writeFileSync(filePath, lines.join('\n'), 'utf8');

        db.addSavedReport({
            title: report.name,
            type: 'run',
            filePath,
            total,
            passed,
            failed,
            flakiness: flakinessSummary,
        });

        return { saved: true };
    });

    ipcMain.handle('save-pr-workflow-report', async (event, { workflowName, runs }) => {
        const { filePath } = await dialog.showSaveDialog(getWindow(), {
            title: 'Save Workflow Report',
            defaultPath: `subcat-report-${workflowName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${new Date().toISOString().slice(0,19).replace(/[T:]/g, '-')}.md`,
            filters: [{ name: 'Markdown', extensions: ['md'] }],
        });

        if (!filePath) return { cancelled: true };

        const passed = runs.filter(r => r.conclusion === 'success').length;
        const failed = runs.filter(r => r.conclusion && r.conclusion !== 'success').length;
        function formatDuration(started, completed) {
            if (!started || !completed) return '—';
            const ms = new Date(completed) - new Date(started);
            if (isNaN(ms) || ms < 0) return '—';
            const s = Math.round(ms / 1000);
            if (s < 60) return `${s}s`;
            return `${Math.floor(s / 60)}m ${s % 60}s`;
        }

        const lines = [
            `# ${workflowName}`,
            '',
            `**Runs:** ${runs.length} · **Passed:** ${passed} · **Failed:** ${failed}`,
            '',
            '| Attempt | Result | Duration | Link |',
            '|---------|--------|----------|------|',
            ...runs.map((r, i) => {
                const emoji = r.conclusion === 'success' ? '✅' : r.conclusion ? '❌' : '🔄';
                const result = r.conclusion ?? r.status ?? '—';
                const attempt = runs.length - i;
                const duration = formatDuration(r.started_at, r.completed_at);
                return `| #${attempt} | ${emoji} ${result} | ${duration} | [Open](${r.url}) |`;
            }),
            '',
            '---',
            '*Made by [SubCat](https://subcat.todaywedream.com)*',
        ];
        fs.writeFileSync(filePath, lines.join('\n'), 'utf8');

        db.addSavedReport({
            title: workflowName,
            type: 'pr-workflow',
            filePath,
            total: runs.length,
            passed,
            failed,
            flakiness: failed === 0 ? 'Stable' : failed < runs.length / 2 ? 'Probably flaky' : 'Flaky',
        });

        return { saved: true };
    });

    ipcMain.handle('get-saved-reports', () => {
        return db.getAllSavedReports();
    });

    ipcMain.handle('delete-saved-report', (event, id) => {
        db.deleteSavedReport(id);
        return { deleted: true };
    });

    ipcMain.handle('read-report-file', (event, filePath) => {
        if (!filePath || typeof filePath !== 'string') return { error: 'Invalid path.' };
        if (!fs.existsSync(filePath)) return { error: 'File not found.' };
        return { content: fs.readFileSync(filePath, 'utf8') };
    });
}

module.exports = { register };
