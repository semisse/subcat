const https = require('https');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function parseGitHubUrl(url) {
    const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/actions\/runs\/(\d+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2], runId: match[3] };
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

    return allAnnotations
        .flat()
        .filter(a => a.annotation_level === 'failure')
        .map(a => a.title || a.message?.split('\n')[0])
        .filter(Boolean);
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

module.exports = { delay, parseGitHubUrl, githubGet, fetchRunStatus, fetchFailedTests, triggerRerun, rerunWorkflow, rerunFailedJobs, cancelRun };
