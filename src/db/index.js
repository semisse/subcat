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

    try {
        db.exec(`ALTER TABLE runs ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'`);
    } catch (_) { /* column already exists */ }
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

module.exports = { getDb, addRun, updateRun, addRunResult, getActiveRuns, getAllRuns, getRun, getRunResults, removeRun, clearRunResults, getReport };
