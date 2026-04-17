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

    try { db.exec(`ALTER TABLE runs ADD COLUMN pr_number INTEGER`); } catch (_) { /* column already exists */ }
    try { db.exec(`ALTER TABLE runs ADD COLUMN pr_title TEXT`); } catch (_) { /* column already exists */ }
    try { db.exec(`ALTER TABLE runs ADD COLUMN head_sha TEXT`); } catch (_) { /* column already exists */ }
    try { db.exec(`ALTER TABLE local_runs ADD COLUMN config TEXT`); } catch (_) { /* column already exists */ }

    db.exec(`
        CREATE TABLE IF NOT EXISTS failed_only_attempts (
            id TEXT PRIMARY KEY,
            owner TEXT NOT NULL,
            repo TEXT NOT NULL,
            run_id TEXT NOT NULL,
            attempt_num INTEGER NOT NULL
        );
    `);

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

    db.exec(`
        CREATE TABLE IF NOT EXISTS saved_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            type TEXT NOT NULL,
            file_path TEXT NOT NULL,
            total INTEGER NOT NULL DEFAULT 0,
            passed INTEGER NOT NULL DEFAULT 0,
            failed INTEGER NOT NULL DEFAULT 0,
            flakiness TEXT NOT NULL DEFAULT 'Stable',
            saved_at TEXT NOT NULL
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            url TEXT,
            conclusion TEXT NOT NULL,
            run_name TEXT NOT NULL,
            triggered_at TEXT NOT NULL,
            read INTEGER NOT NULL DEFAULT 0
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS local_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            repo_path TEXT NOT NULL,
            test_command TEXT NOT NULL,
            cpus REAL NOT NULL DEFAULT 2,
            memory_gb REAL NOT NULL DEFAULT 7,
            repeat_count INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'running',
            passed INTEGER,
            failed INTEGER,
            flaky INTEGER,
            failed_test_names TEXT,
            config TEXT,
            started_at TEXT NOT NULL DEFAULT (datetime('now')),
            completed_at TEXT
        );
    `);
}

function addRun({ id, currentRunId, owner, repo, workflowId, name, url, repeatTotal, runNumber, source = 'manual', prNumber = null, prTitle = null, headSha = null }) {
    getDb().prepare(`
        INSERT INTO runs (id, current_run_id, owner, repo, workflow_id, name, url, repeat_total, run_number, status, source, pr_number, pr_title, head_sha, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'watching', ?, ?, ?, ?, ?)
    `).run(id, currentRunId, owner, repo, workflowId ?? null, name, url, repeatTotal, runNumber, source, prNumber, prTitle, headSha, new Date().toISOString());
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

function addSavedReport({ title, type, filePath, total, passed, failed, flakiness }) {
    return getDb().prepare(`
        INSERT INTO saved_reports (title, type, file_path, total, passed, failed, flakiness, saved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, type, filePath, total, passed, failed, flakiness, new Date().toISOString());
}

function getAllSavedReports() {
    return getDb().prepare(`SELECT * FROM saved_reports ORDER BY saved_at DESC`).all();
}

function deleteSavedReport(id) {
    getDb().prepare(`DELETE FROM saved_reports WHERE id = ?`).run(id);
}

function addNotification({ title, body, url, conclusion, runName }) {
    return getDb().prepare(`
        INSERT INTO notifications (title, body, url, conclusion, run_name, triggered_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(title, body, url ?? null, conclusion, runName, new Date().toISOString());
}

function getNotifications(limit = 100) {
    return getDb().prepare(`SELECT * FROM notifications ORDER BY triggered_at DESC LIMIT ?`).all(limit);
}

function getUnreadNotificationCount() {
    return getDb().prepare(`SELECT COUNT(*) as count FROM notifications WHERE read = 0`).get().count;
}

function markAllNotificationsRead() {
    getDb().prepare(`UPDATE notifications SET read = 1 WHERE read = 0`).run();
}

function clearNotifications() {
    getDb().prepare(`DELETE FROM notifications`).run();
}

function getLabRuns() {
    return getDb().prepare(`
        SELECT r.*,
            COUNT(rr.id) AS completed_count,
            SUM(CASE WHEN rr.conclusion = 'success' THEN 1 ELSE 0 END) AS passed_count,
            SUM(CASE WHEN rr.conclusion != 'success' AND rr.conclusion IS NOT NULL THEN 1 ELSE 0 END) AS failed_count
        FROM runs r
        LEFT JOIN run_results rr ON r.id = rr.run_id
        GROUP BY r.id
        ORDER BY r.created_at DESC
    `).all();
}

function getRunResultById(id) {
    const r = getDb().prepare(`SELECT * FROM run_results WHERE id = ?`).get(id);
    if (!r) return null;
    return { ...r, failedTests: JSON.parse(r.failed_tests ?? '[]') };
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

function saveFailedOnlyAttempt({ owner, repo, runId, attemptNum }) {
    const id = `${owner}/${repo}/${runId}/${attemptNum}`;
    getDb().prepare(`
        INSERT OR IGNORE INTO failed_only_attempts (id, owner, repo, run_id, attempt_num)
        VALUES (?, ?, ?, ?, ?)
    `).run(id, owner, repo, runId, attemptNum);
}

function getFailedOnlyAttempts({ owner, repo, runId }) {
    return getDb().prepare(
        `SELECT attempt_num FROM failed_only_attempts WHERE owner = ? AND repo = ? AND run_id = ?`
    ).all(owner, repo, runId).map(r => r.attempt_num);
}

function insertLocalRun({ repoPath, testCommand, cpus, memoryGb, repeat, config }) {
    const result = getDb().prepare(`
        INSERT INTO local_runs (repo_path, test_command, cpus, memory_gb, repeat_count, config)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(repoPath, testCommand, cpus, memoryGb, repeat, config ? JSON.stringify(config) : null);
    return result.lastInsertRowid;
}

function updateLocalRun(id, { status, passed, failed, flaky, failedTestNames, completedAt } = {}) {
    const fields = [];
    const values = [];
    if (status !== undefined)          { fields.push('status = ?');             values.push(status); }
    if (passed !== undefined)          { fields.push('passed = ?');             values.push(passed); }
    if (failed !== undefined)          { fields.push('failed = ?');             values.push(failed); }
    if (flaky !== undefined)           { fields.push('flaky = ?');              values.push(flaky); }
    if (failedTestNames !== undefined) { fields.push('failed_test_names = ?'); values.push(JSON.stringify(failedTestNames)); }
    if (completedAt !== undefined)     { fields.push('completed_at = ?');       values.push(completedAt); }
    if (!fields.length) return;
    values.push(id);
    getDb().prepare(`UPDATE local_runs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

function getLocalRuns(limit = 50) {
    return getDb().prepare(`SELECT * FROM local_runs ORDER BY started_at DESC LIMIT ?`).all(limit);
}

function getLocalRun(id) {
    return getDb().prepare(`SELECT * FROM local_runs WHERE id = ?`).get(id) ?? null;
}

function deleteLocalRun(id) {
    getDb().prepare(`DELETE FROM local_runs WHERE id = ?`).run(id);
}

module.exports = { getDb, addRun, updateRun, addRunResult, getActiveRuns, getAllRuns, getRun, getRunResults, removeRun, clearRunResults, getReport, addPinnedWorkflow, updatePinnedWorkflow, getPinnedWorkflow, getAllPinnedWorkflows, removePinnedWorkflow, savePendingRerun, getPendingRerun, deletePendingRerun, saveFailedOnlyAttempt, getFailedOnlyAttempts, getPRStats, addSavedReport, getAllSavedReports, deleteSavedReport, getLabRuns, getRunResultById, addNotification, getNotifications, getUnreadNotificationCount, markAllNotificationsRead, clearNotifications, insertLocalRun, updateLocalRun, getLocalRuns, getLocalRun, deleteLocalRun };
