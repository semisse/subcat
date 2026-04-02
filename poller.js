const { EventEmitter } = require('events');
const { fetchRunStatus, fetchFailedTests, rerunWorkflow, delay } = require('./github');
const db = require('./db');

const POLL_INTERVAL_MS = 15_000;
const TRANSIENT_ERRORS = new Set(['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED']);
const isTransient = err => TRANSIENT_ERRORS.has(err.code) || err.status === 429;

class PollManager extends EventEmitter {
    #active = new Set();

    start({ runId, currentRunId, owner, repo, runNumber, repeatTotal, name, url, results = [], reportRows = [] }, getToken) {
        if (this.#active.has(runId)) return false;
        this.#active.add(runId);
        this.#loop(
            { runId, currentRunId, owner, repo, runNumber, repeatTotal, name, url },
            [...results],
            [...reportRows],
            getToken
        );
        return true;
    }

    stop(runId) {
        this.#active.delete(runId);
        db.removeRun(runId);
    }

    isActive(runId) {
        return this.#active.has(runId);
    }

    async #loop({ runId, currentRunId, owner, repo, runNumber, repeatTotal }, results, reportRows, getToken) {
        while (this.#active.has(runId)) {
            await delay(POLL_INTERVAL_MS);
            if (!this.#active.has(runId)) break;

            try {
                const run = await fetchRunStatus(owner, repo, currentRunId, getToken());
                const name = run.display_title || run.name;

                this.emit('run:update', {
                    runId, name,
                    status: run.status,
                    conclusion: run.conclusion,
                    url: run.html_url,
                    repeatCurrent: runNumber,
                    repeatTotal,
                    results,
                });

                if (run.status !== 'completed') continue;

                const failedTests = run.conclusion !== 'success'
                    ? await fetchFailedTests(owner, repo, currentRunId, getToken()).catch(() => [])
                    : [];

                results = [...results, run.conclusion];
                reportRows = [...reportRows, {
                    number: runNumber,
                    conclusion: run.conclusion,
                    url: run.html_url,
                    started_at: run.run_started_at,
                    completed_at: run.updated_at,
                    failedTests,
                }];

                db.addRunResult({
                    runId, number: runNumber,
                    conclusion: run.conclusion,
                    url: run.html_url,
                    startedAt: run.run_started_at,
                    completedAt: run.updated_at,
                    failedTests,
                });

                this.emit('run:repeat-done', {
                    runId, name,
                    runNumber,
                    conclusion: run.conclusion,
                    url: run.html_url,
                    repeatTotal,
                });

                if (runNumber < repeatTotal) {
                    await rerunWorkflow(owner, repo, currentRunId, getToken());
                    runNumber++;
                    db.updateRun(runId, { runNumber });

                    const newRun = await fetchRunStatus(owner, repo, currentRunId, getToken()).catch(() => null);
                    this.emit('run:update', {
                        runId, name,
                        status: newRun?.status ?? 'queued',
                        conclusion: newRun?.conclusion ?? null,
                        url: newRun?.html_url ?? run.html_url,
                        repeatCurrent: runNumber,
                        repeatTotal,
                        results,
                    });
                } else {
                    this.#active.delete(runId);
                    db.updateRun(runId, { status: 'completed' });

                    const passed = results.filter(r => r === 'success').length;
                    this.emit('run:all-done', {
                        runId, name,
                        repeatTotal,
                        passed,
                        failed: repeatTotal - passed,
                    });
                }
            } catch (err) {
                if (isTransient(err)) continue;
                this.#active.delete(runId);
                db.updateRun(runId, { status: 'error' });
                this.emit('run:error', { runId, error: err.message });
                break;
            }
        }
    }
}

module.exports = new PollManager();
