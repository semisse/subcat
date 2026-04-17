// Shared fixture data for E2E tests.

const USER = { login: 'testuser', email: 'test@example.com', avatar_url: '' };

const RUN_COMPLETED = {
    id: 12345,
    name: 'CI / Build',
    status: 'completed',
    conclusion: 'success',
    run_attempt: 1,
    workflow_id: 1,
    head_sha: 'abc123def456',
    html_url: 'https://github.com/owner/repo/actions/runs/12345',
    run_started_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:10:00Z',
    display_title: 'CI / Build',
};

const RUN_IN_PROGRESS = {
    ...RUN_COMPLETED,
    id: 99999,
    status: 'in_progress',
    conclusion: null,
    html_url: 'https://github.com/owner/repo/actions/runs/99999',
};

const PR = {
    number: 42,
    title: 'Add feature X',
    html_url: 'https://github.com/owner/repo/pull/42',
    repository_url: 'https://api.github.com/repos/owner/repo',
    comments: 3,
};

const PR_DETAIL = {
    head: { sha: 'abc123def456', ref: 'feature-x' },
};

// Standard fixtures for an authenticated session (main window)
function baseFixtures() {
    return {
        'GET /user': { status: 200, body: USER },
    };
}

// Fixtures for the My PRs page
function prFixtures() {
    return {
        ...baseFixtures(),
        'GET /search/issues': {
            status: 200,
            body: { items: [PR] },
        },
    };
}

// Fixtures for PR drilldown (after clicking a PR)
function prDrilldownFixtures() {
    return {
        ...prFixtures(),
        'GET /repos/:owner/:repo/pulls/:prNumber': {
            status: 200,
            body: PR_DETAIL,
        },
        'GET /repos/:owner/:repo/actions/runs': {
            status: 200,
            body: {
                workflow_runs: [{
                    id: 12345,
                    workflow_id: 1,
                    name: 'CI',
                    status: 'completed',
                    conclusion: 'success',
                }],
            },
        },
    };
}

// Fixtures for watching a run
function watchRunFixtures() {
    return {
        ...baseFixtures(),
        'GET /repos/:owner/:repo/actions/runs/:runId': { status: 200, body: RUN_COMPLETED },
        'GET /repos/:owner/:repo/actions/runs/:runId/jobs': { status: 200, body: { jobs: [] } },
    };
}

const WORKFLOW_INFO = {
    id: 1001,
    name: 'CI',
    path: '.github/workflows/ci.yml',
    state: 'active',
};

const WORKFLOW_LATEST_RUN = {
    id: 55555,
    status: 'completed',
    conclusion: 'success',
    html_url: 'https://github.com/owner/repo/actions/runs/55555',
};

const RUN_FAILED = {
    ...RUN_COMPLETED,
    id: 77777,
    conclusion: 'failure',
    html_url: 'https://github.com/owner/repo/actions/runs/77777',
};

// Fixtures for pinning a workflow via the watch dock
function pinnedWorkflowFixtures() {
    return {
        ...baseFixtures(),
        'GET /repos/:owner/:repo/actions/workflows/:file': { status: 200, body: WORKFLOW_INFO },
        'GET /repos/:owner/:repo/actions/workflows/:file/runs': {
            status: 200,
            body: { workflow_runs: [WORKFLOW_LATEST_RUN] },
        },
    };
}

// Fixtures for watching an in-progress run that transitions to completed (sequence)
function runTransitionFixtures() {
    return {
        ...baseFixtures(),
        'GET /repos/:owner/:repo/actions/runs/:runId': [
            { status: 200, body: RUN_IN_PROGRESS },
            { status: 200, body: RUN_COMPLETED },
        ],
        'GET /repos/:owner/:repo/actions/runs/:runId/jobs': { status: 200, body: { jobs: [] } },
    };
}

// Fixtures for a completed run that can be cancelled/rerun
function runActionsFixtures() {
    return {
        ...baseFixtures(),
        'GET /repos/:owner/:repo/actions/runs/:runId': { status: 200, body: RUN_IN_PROGRESS },
        'GET /repos/:owner/:repo/actions/runs/:runId/jobs': { status: 200, body: { jobs: [] } },
        'POST /repos/:owner/:repo/actions/runs/:runId/cancel': { status: 202, body: {} },
        'POST /repos/:owner/:repo/actions/runs/:runId/rerun': { status: 201, body: {} },
        'POST /repos/:owner/:repo/actions/runs/:runId/rerun-failed-jobs': { status: 201, body: {} },
    };
}

// Fixtures for a completed+failed run (for notifications and reports)
function completedFailedRunFixtures() {
    return {
        ...baseFixtures(),
        'GET /repos/:owner/:repo/actions/runs/:runId': { status: 200, body: RUN_FAILED },
        'GET /repos/:owner/:repo/actions/runs/:runId/jobs': {
            status: 200,
            body: {
                jobs: [{
                    id: 8001,
                    name: 'build',
                    status: 'completed',
                    conclusion: 'failure',
                    started_at: '2024-01-01T00:00:00Z',
                    completed_at: '2024-01-01T00:05:00Z',
                }],
            },
        },
    };
}

// Fixtures for dashboard with PR stats data
function dashboardStatsFixtures() {
    return {
        ...baseFixtures(),
        'GET /search/issues': {
            status: 200,
            body: { items: [PR] },
        },
    };
}

module.exports = {
    USER, RUN_COMPLETED, RUN_IN_PROGRESS, RUN_FAILED,
    PR, PR_DETAIL, WORKFLOW_INFO, WORKFLOW_LATEST_RUN,
    baseFixtures, prFixtures, prDrilldownFixtures, watchRunFixtures,
    pinnedWorkflowFixtures, runTransitionFixtures, runActionsFixtures,
    completedFailedRunFixtures, dashboardStatsFixtures,
};
