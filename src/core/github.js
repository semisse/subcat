const https = require('https');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function parseGitHubUrl(url) {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/actions\/runs\/(\d+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2], runId: match[3] };
}

function parseWorkflowUrl(url) {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/actions\/workflows\/([^/?#]+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2], workflowFile: match[3] };
}

function fetchWorkflowInfo(owner, repo, workflowFile, token) {
    return githubGet(`/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}`, token);
}

async function fetchLatestWorkflowRun(owner, repo, workflowFile, token) {
    const { workflow_runs } = await githubGet(
        `/repos/${owner}/${repo}/actions/workflows/${encodeURIComponent(workflowFile)}/runs?per_page=1`,
        token
    );
    return workflow_runs[0] ?? null;
}

function parsePRUrl(url) {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2], prNumber: match[3] };
}

async function fetchUserPRs(login, token) {
    const data = await githubGet(
        `/search/issues?q=is:pr+is:open+author:${encodeURIComponent(login)}&per_page=20&sort=updated`,
        token
    );
    return data.items.map(pr => {
        const repoPath = pr.repository_url.replace('https://api.github.com/repos/', '');
        const [owner, repo] = repoPath.split('/');
        return { number: pr.number, title: pr.title, owner, repo, url: pr.html_url };
    });
}

async function fetchPRRuns(owner, repo, prNumber, token) {
    const pr = await githubGet(`/repos/${owner}/${repo}/pulls/${prNumber}`, token);
    const headSha = pr.head.sha;
    const { workflow_runs } = await githubGet(
        `/repos/${owner}/${repo}/actions/runs?head_sha=${headSha}&per_page=30`,
        token
    );
    // deduplicate: one entry per workflow (API returns newest first)
    const seen = new Set();
    const unique = [];
    for (const r of workflow_runs) {
        if (!seen.has(r.workflow_id)) {
            seen.add(r.workflow_id);
            unique.push({
                runId: String(r.id),
                workflowId: r.workflow_id,
                name: r.name,
                status: r.status,
                conclusion: r.conclusion,
                url: `https://github.com/${owner}/${repo}/actions/runs/${r.id}`,
            });
        }
    }
    return { runs: unique, owner, repo, headSha, headRef: pr.head.ref };
}

async function fetchRunAttempts(owner, repo, runId, token) {
    const run = await githubGet(`/repos/${owner}/${repo}/actions/runs/${runId}`, token);
    const total = run.run_attempt;

    const attempts = await Promise.all(
        Array.from({ length: total }, (_, i) => {
            const attempt = total - i; // newest first
            return githubGet(`/repos/${owner}/${repo}/actions/runs/${runId}/attempts/${attempt}`, token)
                .then(r => ({
                    runId: String(runId),
                    runAttempt: r.run_attempt,
                    status: r.status,
                    conclusion: r.conclusion,
                    url: `https://github.com/${owner}/${repo}/actions/runs/${runId}/attempts/${r.run_attempt}`,
                    started_at: r.run_started_at ?? r.created_at ?? null,
                    completed_at: r.status === 'completed' ? (r.updated_at ?? null) : null,
                }));
        })
    );

    return { attempts, totalAttempts: total };
}

function githubGet(path, token) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.github.com',
            path,
            method: 'GET',
            headers: {
                'User-Agent': 'SubCat-Electron',
                'Accept': 'application/vnd.github+json',
                ...(token && { 'Authorization': `Bearer ${token}` })
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode === 200) resolve(JSON.parse(data));
                else {
                    const err = new Error(`GitHub API ${res.statusCode}: ${path}`);
                    err.status = res.statusCode;
                    reject(err);
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function fetchRunStatus(owner, repo, runId, token) {
    return githubGet(`/repos/${owner}/${repo}/actions/runs/${runId}`, token);
}

async function fetchFailedTests(owner, repo, runId, token) {
    const { jobs } = await githubGet(`/repos/${owner}/${repo}/actions/runs/${runId}/jobs`, token);
    const failedJobs = jobs.filter(j => j.conclusion === 'failure');

    const allAnnotations = await Promise.all(
        failedJobs.map(job => githubGet(`/repos/${owner}/${repo}/check-runs/${job.id}/annotations`, token))
    );

    const useful = allAnnotations
        .flat()
        .filter(a => a.annotation_level === 'failure' && a.path !== '.github')
        .map(a => a.title || a.message?.split('\n')[0])
        .filter(t => t && !/process completed with exit code/i.test(t));

    if (useful.length > 0) return useful;

    // fall back to failed job names
    return failedJobs.map(j => j.name);
}

function triggerRerun(owner, repo, runId, token) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.github.com',
            path: `/repos/${owner}/${repo}/actions/runs/${runId}/rerun`,
            method: 'POST',
            headers: {
                'User-Agent': 'SubCat-Electron',
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${token}`,
                'Content-Length': 0
            }
        }, (res) => {
            res.on('data', () => {});
            res.on('end', () => {
                if (res.statusCode === 201) resolve();
                else reject(new Error(`Rerun failed: ${res.statusCode}`));
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function cancelRun(owner, repo, runId, token) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.github.com',
            path: `/repos/${owner}/${repo}/actions/runs/${runId}/cancel`,
            method: 'POST',
            headers: {
                'User-Agent': 'SubCat-Electron',
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${token}`,
                'Content-Length': 0
            }
        }, (res) => {
            res.on('data', () => {});
            res.on('end', () => {
                if (res.statusCode === 202) resolve();
                else reject(new Error(`Cancel failed: ${res.statusCode}`));
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function rerunWorkflow(owner, repo, runId, token) {
    await triggerRerun(owner, repo, runId, token);
    return runId;
}

function rerunFailedJobs(owner, repo, runId, token) {
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname: 'api.github.com',
            path: `/repos/${owner}/${repo}/actions/runs/${runId}/rerun-failed-jobs`,
            method: 'POST',
            headers: {
                'User-Agent': 'SubCat-Electron',
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${token}`,
                'Content-Length': 0
            }
        }, (res) => {
            res.on('data', () => {});
            res.on('end', () => {
                if (res.statusCode === 201) resolve();
                else reject(new Error(`Rerun failed jobs: ${res.statusCode}`));
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function fetchPRReviews(owner, repo, prNumber, token) {
    const reviews = await githubGet(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, token);
    // Last non-comment state per reviewer wins
    const stateByUser = {};
    for (const r of reviews) {
        if (r.state !== 'COMMENTED') stateByUser[r.user.login] = r.state;
    }
    const states = Object.values(stateByUser);
    return {
        approved: states.some(s => s === 'APPROVED'),
        changesRequested: states.some(s => s === 'CHANGES_REQUESTED'),
        reviewCount: states.length,
    };
}

module.exports = { delay, parseGitHubUrl, parsePRUrl, parseWorkflowUrl, githubGet, fetchRunStatus, fetchUserPRs, fetchPRRuns, fetchRunAttempts, fetchFailedTests, fetchWorkflowInfo, fetchLatestWorkflowRun, fetchPRReviews, triggerRerun, rerunWorkflow, rerunFailedJobs, cancelRun };
