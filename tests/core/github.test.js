jest.mock('https');
const https = require('https');
const { parseGitHubUrl, parsePRUrl, githubGet, fetchFailedTests, fetchPRRuns, rerunWorkflow, rerunFailedJobs, cancelRun } = require('../../src/core/github');

// Helper to create a mock https response
function mockResponse(statusCode, body) {
    const EventEmitter = require('events');
    const res = new EventEmitter();
    res.statusCode = statusCode;
    const req = new EventEmitter();
    req.end = jest.fn(() => {
        res.emit('data', JSON.stringify(body));
        res.emit('end');
    });
    https.request.mockImplementation((_, cb) => { cb(res); return req; });
}

// ─── parseGitHubUrl ───────────────────────────────────────────────────────────

describe('parseGitHubUrl', () => {
    test('parses a valid run URL', () => {
        const result = parseGitHubUrl('https://github.com/Alfresco/hxp-frontend-apps/actions/runs/23505290394');
        expect(result).toEqual({ owner: 'Alfresco', repo: 'hxp-frontend-apps', runId: '23505290394' });
    });

    test('parses URL with query string', () => {
        const result = parseGitHubUrl('https://github.com/Alfresco/hxp-frontend-apps/actions/runs/23505290394?pr=16230');
        expect(result).toEqual({ owner: 'Alfresco', repo: 'hxp-frontend-apps', runId: '23505290394' });
    });

    test('returns null for a PR URL', () => {
        expect(parseGitHubUrl('https://github.com/Alfresco/hxp-frontend-apps/pull/16230')).toBeNull();
    });

    test('returns null for an arbitrary URL', () => {
        expect(parseGitHubUrl('https://github.com/owner/repo')).toBeNull();
    });

    test('returns null for empty string', () => {
        expect(parseGitHubUrl('')).toBeNull();
    });
});

// ─── parsePRUrl ───────────────────────────────────────────────────────────────

describe('parsePRUrl', () => {
    test('parses a valid PR URL', () => {
        const result = parsePRUrl('https://github.com/Alfresco/hxp-frontend-apps/pull/16230');
        expect(result).toEqual({ owner: 'Alfresco', repo: 'hxp-frontend-apps', prNumber: '16230' });
    });

    test('returns null for a run URL', () => {
        expect(parsePRUrl('https://github.com/owner/repo/actions/runs/123')).toBeNull();
    });

    test('returns null for empty string', () => {
        expect(parsePRUrl('')).toBeNull();
    });
});

// ─── githubGet ────────────────────────────────────────────────────────────────

describe('githubGet', () => {
    test('resolves with parsed JSON on 200', async () => {
        mockResponse(200, { id: 1, status: 'in_progress' });
        const result = await githubGet('/repos/owner/repo/actions/runs/1', 'token');
        expect(result).toEqual({ id: 1, status: 'in_progress' });
    });

    test('rejects with error message on non-200', async () => {
        mockResponse(404, { message: 'Not Found' });
        await expect(githubGet('/repos/owner/repo/actions/runs/999', 'token'))
            .rejects.toThrow('GitHub API 404');
    });

    test('sets Authorization header when token provided', async () => {
        mockResponse(200, {});
        await githubGet('/some/path', 'my-token');
        expect(https.request).toHaveBeenCalledWith(
            expect.objectContaining({
                headers: expect.objectContaining({ 'Authorization': 'Bearer my-token' })
            }),
            expect.any(Function)
        );
    });

    test('omits Authorization header when no token', async () => {
        mockResponse(200, {});
        await githubGet('/some/path', null);
        expect(https.request).toHaveBeenCalledWith(
            expect.objectContaining({
                headers: expect.not.objectContaining({ 'Authorization': expect.anything() })
            }),
            expect.any(Function)
        );
    });
});

// ─── rerunWorkflow ────────────────────────────────────────────────────────────

describe('rerunWorkflow', () => {
    beforeEach(() => {
        https.request.mockClear();
    });

    function mockRerunResponse(statusCode = 201) {
        const EventEmitter = require('events');
        const res = new EventEmitter();
        res.statusCode = statusCode;
        const req = new EventEmitter();
        req.end = jest.fn(() => res.emit('end'));
        https.request.mockImplementationOnce((_, cb) => { cb(res); return req; });
    }

    test('returns the same runId after triggering rerun', async () => {
        mockRerunResponse(201);
        await expect(rerunWorkflow('owner', 'repo', '99999', 'token')).resolves.toBe('99999');
    });

    test('does not query workflow runs list after rerun', async () => {
        mockRerunResponse(201);
        await rerunWorkflow('owner', 'repo', '99999', 'token');
        // Only one request: the POST /rerun — no secondary GET for workflow runs
        expect(https.request).toHaveBeenCalledTimes(1);
        expect(https.request).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'POST', path: expect.stringContaining('/rerun') }),
            expect.any(Function)
        );
    });

    test('rejects when rerun POST fails', async () => {
        mockRerunResponse(403);
        await expect(rerunWorkflow('owner', 'repo', '99999', 'token')).rejects.toThrow('Rerun failed: 403');
    });
});

// ─── cancelRun ────────────────────────────────────────────────────────────────

describe('cancelRun', () => {
    beforeEach(() => {
        https.request.mockClear();
    });

    function mockCancelResponse(statusCode = 202) {
        const EventEmitter = require('events');
        const res = new EventEmitter();
        res.statusCode = statusCode;
        const req = new EventEmitter();
        req.end = jest.fn(() => res.emit('end'));
        https.request.mockImplementationOnce((_, cb) => { cb(res); return req; });
    }

    test('resolves on 202', async () => {
        mockCancelResponse(202);
        await expect(cancelRun('owner', 'repo', '99', 'token')).resolves.toBeUndefined();
    });

    test('sends POST to the cancel endpoint', async () => {
        mockCancelResponse(202);
        await cancelRun('owner', 'repo', '99', 'token');
        expect(https.request).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'POST', path: '/repos/owner/repo/actions/runs/99/cancel' }),
            expect.any(Function)
        );
    });

    test('rejects when cancel POST fails', async () => {
        mockCancelResponse(403);
        await expect(cancelRun('owner', 'repo', '99', 'token')).rejects.toThrow('Cancel failed: 403');
    });
});

// ─── rerunFailedJobs ─────────────────────────────────────────────────────────

describe('rerunFailedJobs', () => {
    beforeEach(() => https.request.mockClear());

    function mockPostResponse(statusCode) {
        const EventEmitter = require('events');
        const res = new EventEmitter();
        res.statusCode = statusCode;
        const req = new EventEmitter();
        req.end = jest.fn(() => res.emit('end'));
        https.request.mockImplementationOnce((_, cb) => { cb(res); return req; });
    }

    test('resolves on 201', async () => {
        mockPostResponse(201);
        await expect(rerunFailedJobs('owner', 'repo', '99', 'token')).resolves.toBeUndefined();
    });

    test('sends POST to rerun-failed-jobs endpoint', async () => {
        mockPostResponse(201);
        await rerunFailedJobs('owner', 'repo', '99', 'token');
        expect(https.request).toHaveBeenCalledWith(
            expect.objectContaining({ method: 'POST', path: '/repos/owner/repo/actions/runs/99/rerun-failed-jobs' }),
            expect.any(Function)
        );
    });

    test('rejects on non-201', async () => {
        mockPostResponse(403);
        await expect(rerunFailedJobs('owner', 'repo', '99', 'token')).rejects.toThrow('Rerun failed jobs: 403');
    });
});

// ─── fetchPRRuns ──────────────────────────────────────────────────────────────

describe('fetchPRRuns', () => {
    function mockGetSequence(...responses) {
        for (const [statusCode, body] of responses) {
            const EventEmitter = require('events');
            const res = new EventEmitter();
            res.statusCode = statusCode;
            const req = new EventEmitter();
            req.end = jest.fn(() => {
                res.emit('data', JSON.stringify(body));
                res.emit('end');
            });
            https.request.mockImplementationOnce((_, cb) => { cb(res); return req; });
        }
    }

    test('returns deduplicated runs by workflow_id', async () => {
        mockGetSequence(
            [200, { head: { sha: 'abc123' } }],
            [200, { workflow_runs: [
                { id: 1, workflow_id: 10, name: 'CI', status: 'completed', conclusion: 'failure', html_url: 'https://github.com/o/r/actions/runs/1' },
                { id: 2, workflow_id: 10, name: 'CI', status: 'completed', conclusion: 'success', html_url: 'https://github.com/o/r/actions/runs/2' },
                { id: 3, workflow_id: 20, name: 'Lint', status: 'in_progress', conclusion: null, html_url: 'https://github.com/o/r/actions/runs/3' },
            ]}]
        );
        const result = await fetchPRRuns('owner', 'repo', '42', 'token');
        expect(result).toHaveLength(2);
        expect(result[0]).toMatchObject({ runId: '1', name: 'CI', status: 'completed', conclusion: 'failure' });
        expect(result[1]).toMatchObject({ runId: '3', name: 'Lint', status: 'in_progress' });
    });

    test('returns empty array when no runs exist for PR', async () => {
        mockGetSequence(
            [200, { head: { sha: 'abc123' } }],
            [200, { workflow_runs: [] }]
        );
        const result = await fetchPRRuns('owner', 'repo', '42', 'token');
        expect(result).toEqual([]);
    });

    test('rejects when PR fetch fails', async () => {
        mockGetSequence([404, { message: 'Not Found' }]);
        await expect(fetchPRRuns('owner', 'repo', '999', 'token')).rejects.toThrow('GitHub API 404');
    });
});

// ─── fetchFailedTests ─────────────────────────────────────────────────────────

describe('fetchFailedTests', () => {
    test('returns titles of failure annotations from failed jobs', async () => {
        https.request.mockImplementationOnce((opts, cb) => {
            const EventEmitter = require('events');
            const res = new EventEmitter();
            res.statusCode = 200;
            const req = new EventEmitter();
            req.end = jest.fn(() => {
                res.emit('data', JSON.stringify({ jobs: [{ id: 101, conclusion: 'failure' }] }));
                res.emit('end');
            });
            cb(res);
            return req;
        }).mockImplementationOnce((opts, cb) => {
            const EventEmitter = require('events');
            const res = new EventEmitter();
            res.statusCode = 200;
            const req = new EventEmitter();
            req.end = jest.fn(() => {
                res.emit('data', JSON.stringify([
                    { annotation_level: 'failure', title: 'AuthService should validate token' },
                    { annotation_level: 'failure', title: 'UserService should return 404' },
                    { annotation_level: 'warning', title: 'Unused import' },
                ]));
                res.emit('end');
            });
            cb(res);
            return req;
        });

        const result = await fetchFailedTests('owner', 'repo', '123', 'token');
        expect(result).toEqual(['AuthService should validate token', 'UserService should return 404']);
    });

    test('returns empty array when no jobs failed', async () => {
        mockResponse(200, { jobs: [{ id: 101, conclusion: 'success' }] });
        const result = await fetchFailedTests('owner', 'repo', '123', 'token');
        expect(result).toEqual([]);
    });

    test('filters out generic "Process completed with exit code" annotations', async () => {
        https.request
            .mockImplementationOnce((_, cb) => {
                const EventEmitter = require('events');
                const res = new EventEmitter();
                res.statusCode = 200;
                const req = new EventEmitter();
                req.end = jest.fn(() => {
                    res.emit('data', JSON.stringify({ jobs: [{ id: 10, name: 'Run tests', conclusion: 'failure' }] }));
                    res.emit('end');
                });
                cb(res); return req;
            })
            .mockImplementationOnce((_, cb) => {
                const EventEmitter = require('events');
                const res = new EventEmitter();
                res.statusCode = 200;
                const req = new EventEmitter();
                req.end = jest.fn(() => {
                    res.emit('data', JSON.stringify([
                        { annotation_level: 'failure', path: '.github', title: 'Process completed with exit code 1.' },
                    ]));
                    res.emit('end');
                });
                cb(res); return req;
            });

        const result = await fetchFailedTests('owner', 'repo', '123', 'token');
        expect(result).toEqual(['Run tests']);
    });

    test('falls back to failed job names when no useful annotations exist', async () => {
        https.request
            .mockImplementationOnce((_, cb) => {
                const EventEmitter = require('events');
                const res = new EventEmitter();
                res.statusCode = 200;
                const req = new EventEmitter();
                req.end = jest.fn(() => {
                    res.emit('data', JSON.stringify({ jobs: [
                        { id: 10, name: 'Build', conclusion: 'failure' },
                        { id: 11, name: 'Deploy', conclusion: 'failure' },
                    ]}));
                    res.emit('end');
                });
                cb(res); return req;
            })
            .mockImplementationOnce((_, cb) => {
                const EventEmitter = require('events');
                const res = new EventEmitter();
                res.statusCode = 200;
                const req = new EventEmitter();
                req.end = jest.fn(() => { res.emit('data', JSON.stringify([])); res.emit('end'); });
                cb(res); return req;
            })
            .mockImplementationOnce((_, cb) => {
                const EventEmitter = require('events');
                const res = new EventEmitter();
                res.statusCode = 200;
                const req = new EventEmitter();
                req.end = jest.fn(() => { res.emit('data', JSON.stringify([])); res.emit('end'); });
                cb(res); return req;
            });

        const result = await fetchFailedTests('owner', 'repo', '123', 'token');
        expect(result).toEqual(['Build', 'Deploy']);
    });
});
