const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

let db;

function getDb() {
    if (!db) {
        const dbPath = path.join(app.getPath('userData'), 'subcat.db');
        db = new Database(dbPath);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        migrate(db);
    }
    return db;
}

function migrate(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS runs (
            id TEXT PRIMARY KEY,
            current_run_id TEXT NOT NULL,
            owner TEXT NOT NULL,
            repo TEXT NOT NULL,
            workflow_id INTEGER,
            name TEXT,
            url TEXT,
            repeat_total INTEGER NOT NULL DEFAULT 1,
            run_number INTEGER NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'watching',
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS run_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
            number INTEGER NOT NULL,
            conclusion TEXT NOT NULL,
            url TEXT,
            started_at TEXT,
            completed_at TEXT,
            failed_tests TEXT
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS pinned_workflows (
            id TEXT PRIMARY KEY,
            owner TEXT NOT NULL,
            repo TEXT NOT NULL,
            workflow_file TEXT NOT NULL,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            latest_run_id TEXT,
            latest_run_status TEXT,
            latest_run_conclusion TEXT,
            latest_run_url TEXT,
            created_at TEXT NOT NULL
        );
    `);

    try {
        db.exec(`ALTER TABLE runs ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'`);
    } catch (_) { /* column already exists */ }

    db.exec(`
        CREATE TABLE IF NOT EXISTS pending_reruns (
            id TEXT PRIMARY KEY,
            owner TEXT NOT NULL,
            repo TEXT NOT NULL,
            run_id TEXT NOT NULL,
            from_attempt INTEGER NOT NULL,
            total INTEGER NOT NULL,
            created_at TEXT NOT NULL
        );
    `);
}

function addRun({ id, currentRunId, owner, repo, workflowId, name, url, repeatTotal, runNumber, source = 'manual' }) {
    getDb().prepare(`
        INSERT INTO runs (id, current_run_id, owner, repo, workflow_id, name, url, repeat_total, run_number, status, source, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'watching', ?, ?)
    `).run(id, currentRunId, owner, repo, workflowId ?? null, name, url, repeatTotal, runNumber, source, new Date().toISOString());
}

function updateRun(id, { currentRunId, runNumber, status, name, url } = {}) {
    const fields = [];
    const values = [];
    if (currentRunId !== undefined) { fields.push('current_run_id = ?'); values.push(currentRunId); }
    if (runNumber !== undefined)    { fields.push('run_number = ?');      values.push(runNumber); }
    if (status !== undefined)       { fields.push('status = ?');          values.push(status); }
    if (name !== undefined)         { fields.push('name = ?');            values.push(name); }
    if (url !== undefined)          { fields.push('url = ?');             values.push(url); }
    if (!fields.length) return;
    values.push(id);
    getDb().prepare(`UPDATE runs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

function addRunResult({ runId, number, conclusion, url, startedAt, completedAt, failedTests }) {
    getDb().prepare(`
        INSERT INTO run_results (run_id, number, conclusion, url, started_at, completed_at, failed_tests)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(runId, number, conclusion, url, startedAt ?? null, completedAt ?? null, JSON.stringify(failedTests ?? []));
}

function getActiveRuns() {
    return getDb().prepare(`SELECT * FROM runs WHERE status = 'watching'`).all();
}

function getAllRuns() {
    return getDb().prepare(`SELECT * FROM runs ORDER BY created_at DESC`).all();
}

function getRun(id) {
    return getDb().prepare(`SELECT * FROM runs WHERE id = ?`).get(id) ?? null;
}

function getRunResults(runId) {
    return getDb().prepare(`SELECT * FROM run_results WHERE run_id = ? ORDER BY number`).all(runId)
        .map(r => ({ ...r, failedTests: JSON.parse(r.failed_tests ?? '[]') }));
}

function removeRun(id) {
    getDb().prepare(`DELETE FROM runs WHERE id = ?`).run(id);
}

function clearRunResults(runId) {
    getDb().prepare(`DELETE FROM run_results WHERE run_id = ?`).run(runId);
}

function getReport(runId) {
    const run = getDb().prepare(`SELECT * FROM runs WHERE id = ?`).get(runId);
    if (!run) return null;
    const rows = getRunResults(runId);
    return { name: run.name, rows };
}

function addPinnedWorkflow({ id, owner, repo, workflowFile, name, url, latestRunId, latestRunStatus, latestRunConclusion, latestRunUrl }) {
    getDb().prepare(`
        INSERT INTO pinned_workflows (id, owner, repo, workflow_file, name, url, latest_run_id, latest_run_status, latest_run_conclusion, latest_run_url, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, owner, repo, workflowFile, name, url, latestRunId ?? null, latestRunStatus ?? null, latestRunConclusion ?? null, latestRunUrl ?? null, new Date().toISOString());
}

function updatePinnedWorkflow(id, { name, latestRunId, latestRunStatus, latestRunConclusion, latestRunUrl } = {}) {
    const fields = [];
    const values = [];
    if (name !== undefined)                { fields.push('name = ?');                  values.push(name); }
    if (latestRunId !== undefined)         { fields.push('latest_run_id = ?');         values.push(latestRunId); }
    if (latestRunStatus !== undefined)     { fields.push('latest_run_status = ?');     values.push(latestRunStatus); }
    if (latestRunConclusion !== undefined) { fields.push('latest_run_conclusion = ?'); values.push(latestRunConclusion); }
    if (latestRunUrl !== undefined)        { fields.push('latest_run_url = ?');        values.push(latestRunUrl); }
    if (!fields.length) return;
    values.push(id);
    getDb().prepare(`UPDATE pinned_workflows SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

function getPinnedWorkflow(id) {
    return getDb().prepare(`SELECT * FROM pinned_workflows WHERE id = ?`).get(id) ?? null;
}

function getAllPinnedWorkflows() {
    return getDb().prepare(`SELECT * FROM pinned_workflows ORDER BY created_at DESC`).all();
}

function removePinnedWorkflow(id) {
    getDb().prepare(`DELETE FROM pinned_workflows WHERE id = ?`).run(id);
}

function savePendingRerun({ owner, repo, runId, fromAttempt, total }) {
    const id = `${owner}/${repo}/${runId}`;
    getDb().prepare(`
        INSERT OR REPLACE INTO pending_reruns (id, owner, repo, run_id, from_attempt, total, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, owner, repo, runId, fromAttempt, total, new Date().toISOString());
}

function getPendingRerun({ owner, repo, runId }) {
    const id = `${owner}/${repo}/${runId}`;
    return getDb().prepare(`SELECT * FROM pending_reruns WHERE id = ?`).get(id) ?? null;
}

function deletePendingRerun({ owner, repo, runId }) {
    const id = `${owner}/${repo}/${runId}`;
    getDb().prepare(`DELETE FROM pending_reruns WHERE id = ?`).run(id);
}

function getPRStats() {
    const db = getDb();
    
    const totalRuns = db.prepare(`SELECT COUNT(*) as count FROM run_results`).get().count;
    const totalSuccess = db.prepare(`SELECT COUNT(*) as count FROM run_results WHERE conclusion = 'success'`).get().count;
    const totalFailed = db.prepare(`SELECT COUNT(*) as count FROM run_results WHERE conclusion != 'success'`).get().count;
    
    const durationResult = db.prepare(`
        SELECT SUM(CASE 
            WHEN started_at IS NOT NULL AND completed_at IS NOT NULL 
            THEN (julianday(completed_at) - julianday(started_at)) * 86400 
            ELSE 0 
        END) as total
        FROM run_results
    `).get();
    const totalDuration = durationResult?.total || 0;
    
    const failureRate = totalRuns > 0 ? (totalFailed / totalRuns) * 100 : 0;
    const painScore = totalRuns > 0 ? Math.round((totalRuns * (failureRate / 100) * (totalDuration / 60)) / 100) : 0;
    
    const mostExpensiveRun = db.prepare(`
        SELECT r.owner, r.repo, r.name as workflow_name, COUNT(rr.id) as run_count
        FROM runs r
        LEFT JOIN run_results rr ON r.id = rr.run_id
        GROUP BY r.owner, r.repo
        ORDER BY run_count DESC
        LIMIT 1
    `).get();
    
    return {
        totalRuns,
        totalSuccess,
        totalFailed,
        totalDuration,
        failureRate: Math.round(failureRate * 10) / 10,
        painScore,
        mostExpensivePR: mostExpensiveRun?.owner ? {
            owner: mostExpensiveRun.owner,
            repo: mostExpensiveRun.repo,
            workflowName: mostExpensiveRun.workflow_name,
            runCount: mostExpensiveRun.run_count
        } : null
    };
}

module.exports = { getDb, addRun, updateRun, addRunResult, getActiveRuns, getAllRuns, getRun, getRunResults, removeRun, clearRunResults, getReport, addPinnedWorkflow, updatePinnedWorkflow, getPinnedWorkflow, getAllPinnedWorkflows, removePinnedWorkflow, savePendingRerun, getPendingRerun, deletePendingRerun, getPRStats };
