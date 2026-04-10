const { ipcMain, dialog } = require('electron');
const fs = require('fs');

function register({ db, getWindow }) {
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
        let flakinessSummary;
        if (failed === 0) {
            flakinessSummary = 'Stable';
        } else if (failed < total / 2) {
            flakinessSummary = `Probably flaky — ${failed} failure${failed > 1 ? 's' : ''} in ${total} runs`;
        } else {
            flakinessSummary = `Flaky — failed ${failed}/${total} runs`;
        }
        const lines = [
            `# ${report.name}`,
            '',
            `**Result:** ${flakinessSummary}`,
            `**Runs:** ${total} · **Passed:** ${passed} · **Failed:** ${failed}`,
            '',
            '| Run # | Result | Started At | Completed At | Failed Tests |',
            '|-------|--------|------------|--------------|--------------|',
            ...report.rows.map(r => {
                const emoji = r.conclusion === 'success' ? '✅' : '❌';
                const tests = r.failedTests?.length ? r.failedTests.join(', ') : '—';
                return `| [${r.number}](${r.url}) | ${emoji} ${r.conclusion} | ${r.started_at ?? '—'} | ${r.completed_at ?? '—'} | ${tests} |`;
            }),
        ];
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
}

module.exports = { register };
