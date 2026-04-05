const {
    parseGitHubUrl, parsePRUrl, parseWorkflowUrl,
    fetchRunStatus, fetchUserPRs, fetchPRRuns, fetchRunAttempts, fetchFailedTests,
    fetchWorkflowInfo, fetchLatestWorkflowRun, fetchPRReviews,
    rerunWorkflow, rerunFailedJobs, cancelRun,
} = require('./github');

const PINNED_POLL_INTERVAL_MS = 30_000;
const pinnedPollers = new Map();

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

async function fetchRunAttemptsHandler({ owner, repo, runId }, { getToken }) {
    try {
        const { attempts, totalAttempts } = await fetchRunAttempts(owner, repo, runId, getToken());
        return { runs: attempts, totalAttempts };
    } catch (err) {
        return { error: err.message };
    }
}

async function fetchPRReviewsHandler({ owner, repo, prNumber }, { getToken }) {
    try {
        return await fetchPRReviews(owner, repo, prNumber, getToken());
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

async function rerunRunDirect(owner, repo, runId, { getToken }) {
    try {
        await rerunWorkflow(owner, repo, runId, getToken());
        return { started: true };
    } catch (err) {
        return { error: err.message };
    }
}

async function watchWorkflowRerun({ owner, repo, runId, previousAttemptCount }, { getToken, poller }) {
    try {
        await rerunWorkflow(owner, repo, runId, getToken());
    } catch (err) {
        return { error: err.message };
    }
    poller.watchAttempt({ owner, repo, runId, previousAttemptCount }, getToken);
    return { started: true };
}

async function pinWorkflow({ url }, { db, getToken, onUpdate }) {
    const parsed = parseWorkflowUrl(url);
    if (!parsed) {
        return { error: 'Invalid GitHub workflow URL. Expected: https://github.com/{owner}/{repo}/actions/workflows/{file}' };
    }

    const { owner, repo, workflowFile } = parsed;
    const id = `${owner}/${repo}/${workflowFile}`;

    if (db.getPinnedWorkflow(id)) {
        return { error: 'This workflow is already pinned.' };
    }

    try {
        const [workflowInfo, latestRun] = await Promise.all([
            fetchWorkflowInfo(owner, repo, workflowFile, getToken()),
            fetchLatestWorkflowRun(owner, repo, workflowFile, getToken()).catch(() => null),
        ]);

        const name = workflowInfo.name;
        const latestRunId = latestRun ? String(latestRun.id) : null;
        const latestRunStatus = latestRun?.status ?? null;
        const latestRunConclusion = latestRun?.conclusion ?? null;
        const latestRunUrl = latestRun ? `https://github.com/${owner}/${repo}/actions/runs/${latestRun.id}` : null;

        db.addPinnedWorkflow({ id, owner, repo, workflowFile, name, url, latestRunId, latestRunStatus, latestRunConclusion, latestRunUrl });
        startPinnedPolling({ id, owner, repo, workflowFile }, { db, getToken, onUpdate });

        return { pinned: true, id, name, url, latestRunId, latestRunStatus, latestRunConclusion, latestRunUrl };
    } catch (err) {
        return { error: err.message };
    }
}

function unpinWorkflow(id, { db }) {
    stopPinnedPolling(id);
    db.removePinnedWorkflow(id);
    return { unpinned: true };
}

function startPinnedPolling({ id, owner, repo, workflowFile }, { db, getToken, onUpdate }) {
    if (pinnedPollers.has(id)) return;

    const intervalId = setInterval(async () => {
        try {
            const run = await fetchLatestWorkflowRun(owner, repo, workflowFile, getToken());
            const stored = db.getPinnedWorkflow(id);
            if (!stored) { stopPinnedPolling(id); return; }

            const newRunId = run ? String(run.id) : null;
            const newStatus = run?.status ?? null;
            const newConclusion = run?.conclusion ?? null;
            const newUrl = run ? `https://github.com/${owner}/${repo}/actions/runs/${run.id}` : null;

            if (newRunId !== stored.latest_run_id || newStatus !== stored.latest_run_status || newConclusion !== stored.latest_run_conclusion) {
                db.updatePinnedWorkflow(id, { latestRunId: newRunId, latestRunStatus: newStatus, latestRunConclusion: newConclusion, latestRunUrl: newUrl });
                onUpdate({ id, latestRunId: newRunId, latestRunStatus: newStatus, latestRunConclusion: newConclusion, latestRunUrl: newUrl });
            }
        } catch (_) { /* ignore polling errors */ }
    }, PINNED_POLL_INTERVAL_MS);

    pinnedPollers.set(id, intervalId);
}

function stopPinnedPolling(id) {
    const intervalId = pinnedPollers.get(id);
    if (intervalId !== undefined) {
        clearInterval(intervalId);
        pinnedPollers.delete(id);
    }
}

function resumePinnedWorkflows({ db, getToken, sendToWindow }) {
    const onUpdate = (data) => sendToWindow('pinned-workflow-update', data);
    for (const pw of db.getAllPinnedWorkflows()) {
        sendToWindow('pinned-workflow-restored', {
            id: pw.id,
            name: pw.name,
            url: pw.url,
            latestRunId: pw.latest_run_id,
            latestRunStatus: pw.latest_run_status,
            latestRunConclusion: pw.latest_run_conclusion,
            latestRunUrl: pw.latest_run_url,
        });
        startPinnedPolling(
            { id: pw.id, owner: pw.owner, repo: pw.repo, workflowFile: pw.workflow_file },
            { db, getToken, onUpdate }
        );
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
    fetchRunAttemptsHandler,
    fetchPRReviewsHandler,
    rerunRunDirect,
    watchWorkflowRerun,
    resumeRuns,
    pinWorkflow,
    unpinWorkflow,
    resumePinnedWorkflows,
};
