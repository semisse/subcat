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

module.exports = { USER, RUN_COMPLETED, RUN_IN_PROGRESS, PR, PR_DETAIL, baseFixtures, prFixtures, prDrilldownFixtures, watchRunFixtures };
