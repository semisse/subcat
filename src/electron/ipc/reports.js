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
        fs.writeFileSync(filePath, lines.join('\n'), 'utf8');

        return { saved: true };
    });

    ipcMain.handle('save-pr-workflow-report', async (event, { workflowName, runs }) => {
        const { filePath } = await dialog.showSaveDialog(getWindow(), {
            title: 'Save Workflow Report',
            defaultPath: `subcat-report-${workflowName.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`,
            filters: [{ name: 'Markdown', extensions: ['md'] }],
        });

        if (!filePath) return { cancelled: true };

        const passed = runs.filter(r => r.conclusion === 'success').length;
        const failed = runs.filter(r => r.conclusion && r.conclusion !== 'success').length;
        const lines = [
            `# ${workflowName}`,
            '',
            `**Runs:** ${runs.length} · **Passed:** ${passed} · **Failed:** ${failed}`,
            '',
            '| Attempt | Result | Link |',
            '|---------|--------|------|',
            ...runs.map(r => {
                const emoji = r.conclusion === 'success' ? '✅' : r.conclusion ? '❌' : '🔄';
                const result = r.conclusion ?? r.status ?? '—';
                return `| #${r.runAttempt ?? r.runNumber} | ${emoji} ${result} | [Open](${r.url}) |`;
            }),
        ];
        fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
        return { saved: true };
    });
}

module.exports = { register };
