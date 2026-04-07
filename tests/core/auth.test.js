jest.mock('https');
jest.mock('electron', () => ({
    safeStorage: { isEncryptionAvailable: () => true },
    app: { getPath: () => '/tmp' },
}));

const https = require('https');
const { fetchUser } = require('../../src/core/auth');

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
});
