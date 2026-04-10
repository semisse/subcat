jest.mock('https');
jest.mock('electron', () => ({
    safeStorage: { isEncryptionAvailable: () => true },
    app: { getPath: () => '/tmp' },
}));

const https = require('https');
const { fetchUser, startDeviceFlow, pollForToken } = require('../../src/core/auth');

// GET-style mock (no req.write needed)
function mockResponse(statusCode, body) {
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

// POST-style mock (req.write + req.end)
function mockPost(body) {
    const EventEmitter = require('events');
    const res = new EventEmitter();
    res.statusCode = 200;
    const req = new EventEmitter();
    req.write = jest.fn();
    req.end = jest.fn(() => {
        res.emit('data', JSON.stringify(body));
        res.emit('end');
    });
    https.request.mockImplementationOnce((_, cb) => { cb(res); return req; });
}

// ─── fetchUser ────────────────────────────────────────────────────────────────

describe('fetchUser', () => {
    test('resolves with user data on 200', async () => {
        mockResponse(200, { login: 'semisse', avatar_url: 'https://avatars.githubusercontent.com/u/1' });
        const user = await fetchUser('token');
        expect(user).toEqual({ login: 'semisse', avatar_url: 'https://avatars.githubusercontent.com/u/1' });
    });

    test('sends Authorization header with token', async () => {
        mockResponse(200, { login: 'semisse' });
        await fetchUser('my-token');
        expect(https.request).toHaveBeenCalledWith(
            expect.objectContaining({
                headers: expect.objectContaining({ 'Authorization': 'Bearer my-token' })
            }),
            expect.any(Function)
        );
    });

    test('rejects on non-200 status', async () => {
        mockResponse(401, { message: 'Unauthorized' });
        await expect(fetchUser('bad-token')).rejects.toThrow('GitHub API returned 401');
    });

    test('rejects on network error', async () => {
        const EventEmitter = require('events');
        const req = new EventEmitter();
        req.end = jest.fn(() => req.emit('error', new Error('ECONNREFUSED')));
        https.request.mockImplementationOnce((_, cb) => req);
        await expect(fetchUser('tok')).rejects.toThrow('ECONNREFUSED');
    });
});

// ─── startDeviceFlow ──────────────────────────────────────────────────────────

describe('startDeviceFlow', () => {
    test('maps response fields correctly', async () => {
        mockPost({
            device_code: 'dc123',
            user_code: 'ABCD-1234',
            verification_uri: 'https://github.com/login/device',
            expires_in: 900,
            interval: 5,
        });
        const result = await startDeviceFlow();
        expect(result).toEqual({
            deviceCode: 'dc123',
            userCode: 'ABCD-1234',
            verificationUri: 'https://github.com/login/device',
            expiresIn: 900,
            interval: 5,
        });
    });

    test('throws when response contains error', async () => {
        mockPost({ error: 'not_supported', error_description: 'Device flow not supported' });
        await expect(startDeviceFlow()).rejects.toThrow('Device flow not supported');
    });

    test('falls back to error code when error_description is absent', async () => {
        mockPost({ error: 'not_supported' });
        await expect(startDeviceFlow()).rejects.toThrow('not_supported');
    });

    test('defaults interval to 5 when missing from response', async () => {
        mockPost({
            device_code: 'dc', user_code: 'AB-12',
            verification_uri: 'https://github.com/login/device', expires_in: 900,
        });
        const result = await startDeviceFlow();
        expect(result.interval).toBe(5);
    });

    test('posts to correct GitHub endpoint', async () => {
        mockPost({ device_code: 'dc', user_code: 'AB', verification_uri: 'u', expires_in: 900, interval: 5 });
        await startDeviceFlow();
        expect(https.request).toHaveBeenCalledWith(
            expect.objectContaining({ hostname: 'github.com', path: '/login/device/code', method: 'POST' }),
            expect.any(Function)
        );
    });
});

// ─── pollForToken ─────────────────────────────────────────────────────────────
//
// Fake timers control setTimeout so tests don't actually wait.
// Rejection tests pre-attach the assertion before advancing timers to prevent
// Jest 30 from treating the rejection as unhandled before .rejects is set up.

describe('pollForToken', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    test('returns access_token when server grants it', async () => {
        mockPost({ access_token: 'ghp_abc123' });
        const promise = pollForToken('devicecode', 5);
        await jest.advanceTimersByTimeAsync(5000);
        expect(await promise).toBe('ghp_abc123');
    });

    test('throws on access_denied', async () => {
        mockPost({ error: 'access_denied' });
        const promise = pollForToken('devicecode', 5);
        const assertion = expect(promise).rejects.toThrow('Login was denied.');
        await jest.advanceTimersByTimeAsync(5000);
        await assertion;
    });

    test('throws on expired_token', async () => {
        mockPost({ error: 'expired_token' });
        const promise = pollForToken('devicecode', 5);
        const assertion = expect(promise).rejects.toThrow('Login timed out. Please try again.');
        await jest.advanceTimersByTimeAsync(5000);
        await assertion;
    });

    test('increases interval on slow_down then succeeds on next poll', async () => {
        // interval=0 → first delay=0ms; after slow_down interval=5 → second delay=5000ms
        mockPost({ error: 'slow_down' });
        mockPost({ access_token: 'ghp_ok' });
        const promise = pollForToken('devicecode', 0);
        await jest.advanceTimersByTimeAsync(5001); // covers both the 0ms and 5s delays
        expect(await promise).toBe('ghp_ok');
    });

    test('continues on authorization_pending then succeeds', async () => {
        mockPost({ error: 'authorization_pending' });
        mockPost({ access_token: 'ghp_ok' });
        const promise = pollForToken('devicecode', 5);
        await jest.advanceTimersByTimeAsync(5000); // first iteration → pending
        await jest.advanceTimersByTimeAsync(5000); // second iteration → token
        expect(await promise).toBe('ghp_ok');
    });

    test('throws after 10-minute deadline is exceeded', async () => {
        // interval=600_001 means a single delay() call overshoots the 600s deadline.
        // Only one postForm call occurs, so only one mock is needed.
        mockPost({ error: 'authorization_pending' });
        const promise = pollForToken('devicecode', 600_001);
        const assertion = expect(promise).rejects.toThrow('Login timed out after 10 minutes.');
        await jest.advanceTimersByTimeAsync(600_001_000);
        await assertion;
    });
});
