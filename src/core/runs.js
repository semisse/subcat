const {
    parseGitHubUrl, parsePRUrl,
    fetchRunStatus, fetchUserPRs, fetchPRRuns, fetchWorkflowRunsForPR, fetchFailedTests,
    rerunWorkflow, rerunFailedJobs, cancelRun,
} = require('./github');

async function startWatching({ url, repeatTotal = 1, source = 'manual' }, { db, poller, getToken }) {
    const parsed = parseGitHubUrl(url);
    if (!parsed) {
        return { error: 'Invalid GitHub Actions URL. Expected format: https://github.com/{owner}/{repo}/actions/runs/{run_id}' };
    }

    const repeat = Math.floor(Number(repeatTotal));
    if (!Number.isFinite(repeat) || repeat < 1 || repeat > 100) {
        return { error: 'Repeat count must be a number between 1 and 100.' };
    }

    const { owner, repo, runId } = parsed;

    if (poller.isActive(runId)) {
        return { error: 'Already watching this run.' };
    }

    try {
        const initial = await fetchRunStatus(owner, repo, runId, getToken());

        if (initial.status === 'completed' && repeat === 1) {
            const name = initial.display_title || initial.name;
            if (db.getRun(runId)) {
                return { error: 'This run is already in the list.' };
            }
            const failedTests = initial.conclusion !== 'success'
                ? await fetchFailedTests(owner, repo, runId, getToken()).catch(() => [])
                : [];
            db.addRun({ id: runId, currentRunId: runId, owner, repo, workflowId: initial.workflow_id, name, url: initial.html_url, repeatTotal: 1, runNumber: 1, source });
            db.addRunResult({ runId, number: 1, conclusion: initial.conclusion, url: initial.html_url, startedAt: initial.run_started_at, completedAt: initial.updated_at, failedTests });
            db.updateRun(runId, { status: 'completed' });
            return {
                started: true,
                runId,
                name,
                status: 'completed',
                conclusion: initial.conclusion,
                url: initial.html_url,
                repeatTotal: 1,
                failed: initial.conclusion !== 'success' ? 1 : 0,
                failedTests,
                source,
            };
        }

        let currentRunId = runId;
        const runNumber = 1;

        if (initial.status === 'completed') {
            await rerunWorkflow(owner, repo, runId, getToken());
        }

        db.addRun({
            id: runId,
            currentRunId,
            owner,
            repo,
            workflowId: initial.workflow_id,
            name: initial.display_title || initial.name,
            url: initial.html_url,
            repeatTotal: repeat,
            runNumber,
            source,
        });

        poller.start({ runId, currentRunId, owner, repo, runNumber, repeatTotal: repeat, name: initial.display_title || initial.name, url: initial.html_url }, getToken);

        return {
            started: true,
            runId,
            name: initial.display_title || initial.name,
            status: initial.status === 'completed' ? 'queued' : initial.status,
            url: initial.html_url,
            repeatTotal: repeat,
            source,
        };
    } catch (err) {
        return { error: err.message };
    }
}

function stopWatching(runId, { poller }) {
    poller.stop(runId);
    return { stopped: true };
}

async function rerunRun(runId, { db, poller, getToken }) {
    const run = db.getRun(runId);
    if (!run) return { error: 'Run not found.' };
    try {
        await rerunWorkflow(run.owner, run.repo, run.current_run_id, getToken());
        db.clearRunResults(runId);
        db.updateRun(runId, { status: 'watching', runNumber: 1 });
        poller.start({
            runId,
            currentRunId: run.current_run_id,
            owner: run.owner,
            repo: run.repo,
            runNumber: 1,
            repeatTotal: run.repeat_total,
            name: run.name,
            url: run.url,
        }, getToken);
        return { started: true, status: 'queued' };
    } catch (err) {
        return { error: err.message };
    }
}

async function rerunFailedRun(runId, { db, poller, getToken }) {
    const run = db.getRun(runId);
    if (!run) return { error: 'Run not found.' };
    try {
        await rerunFailedJobs(run.owner, run.repo, run.current_run_id, getToken());
        db.clearRunResults(runId);
        db.updateRun(runId, { status: 'watching', runNumber: 1 });
        poller.start({
            runId,
            currentRunId: run.current_run_id,
            owner: run.owner,
            repo: run.repo,
            runNumber: 1,
            repeatTotal: run.repeat_total,
            name: run.name,
            url: run.url,
        }, getToken);
        return { started: true, status: 'queued' };
    } catch (err) {
        return { error: err.message };
    }
}

async function cancelRunHandler(runId, { db, poller, getToken }) {
    const run = db.getRun(runId);
    if (!run) return { error: 'Run not found.' };
    try {
        poller.deactivate(runId);
        await cancelRun(run.owner, run.repo, run.current_run_id, getToken());
        db.removeRun(runId);
        return { cancelled: true };
    } catch (err) {
        return { error: err.message };
    }
}

async function fetchUserPRsHandler(login, { getToken }) {
    if (!login) return { prs: [] };
    try {
        const prs = await fetchUserPRs(login, getToken());
        return { prs };
    } catch (err) {
        return { error: err.message };
    }
}

async function fetchPRRunsHandler(url, { getToken }) {
    const parsed = parsePRUrl(url);
    if (!parsed) return { error: 'Invalid GitHub PR URL.' };
    try {
        const result = await fetchPRRuns(parsed.owner, parsed.repo, parsed.prNumber, getToken());
        return result;
    } catch (err) {
        return { error: err.message };
    }
}

async function fetchWorkflowPRRunsHandler({ owner, repo, workflowId, headRef }, { getToken }) {
    try {
        const runs = await fetchWorkflowRunsForPR(owner, repo, workflowId, headRef, getToken());
        return { runs };
    } catch (err) {
        return { error: err.message };
    }
}

function resumeRuns({ db, poller, getToken, sendToWindow }) {
    for (const run of db.getAllRuns()) {
        const runResults = db.getRunResults(run.id);
        const results = runResults.map(r => r.conclusion);

        if (run.status === 'watching') {
            const reportRows = runResults.map(r => ({
                number: r.number,
                conclusion: r.conclusion,
                url: r.url,
                started_at: r.started_at,
                completed_at: r.completed_at,
                failedTests: r.failedTests,
            }));
            poller.start({
                runId: run.id,
                currentRunId: run.current_run_id,
                owner: run.owner,
                repo: run.repo,
                runNumber: run.run_number,
                repeatTotal: run.repeat_total,
                name: run.name,
                url: run.url,
                results,
                reportRows,
            }, getToken);
            sendToWindow('run-restored', {
                runId: run.id,
                name: run.name,
                url: run.url,
                repeatTotal: run.repeat_total,
                repeatCurrent: run.run_number,
                results,
                status: 'watching',
                source: run.source ?? 'manual',
            });
        } else {
            const passed = results.filter(r => r === 'success').length;
            sendToWindow('run-restored', {
                runId: run.id,
                name: run.name,
                url: run.url,
                repeatTotal: run.repeat_total,
                repeatCurrent: run.repeat_total,
                results,
                status: 'completed',
                passed,
                failed: run.repeat_total - passed,
                source: run.source ?? 'manual',
            });
        }
    }
}

module.exports = {
    startWatching,
    stopWatching,
    rerunRun,
    rerunFailedRun,
    cancelRunHandler,
    fetchUserPRsHandler,
    fetchPRRunsHandler,
    fetchWorkflowPRRunsHandler,
    resumeRuns,
};
