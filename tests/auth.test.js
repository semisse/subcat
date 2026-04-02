jest.mock('electron');
jest.mock('https');
jest.mock('fs');

// ─── Helper ───────────────────────────────────────────────────────────────────

function makeMockRequest(httpsModule, response) {
    const EventEmitter = require('events');
    const res = new EventEmitter();
    res.statusCode = 200;
    const req = new EventEmitter();
    req.write = jest.fn();
    req.end = jest.fn(() => {
        res.emit('data', JSON.stringify(response));
        res.emit('end');
    });
    httpsModule.request.mockImplementationOnce((_, cb) => { cb(res); return req; });
}

// ─── pollForToken ─────────────────────────────────────────────────────────────

describe('pollForToken', () => {
    let pollForToken;
    let https;

    beforeEach(() => {
        jest.resetModules();
        jest.useFakeTimers();
        jest.mock('electron');
        jest.mock('https');
        https = require('https');
        pollForToken = require('../auth').pollForToken;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test('resolves with access token on success', async () => {
        makeMockRequest(https, { access_token: 'ghp_abc123' });
        const promise = pollForToken('device-code', 0);
        await jest.runAllTimersAsync();
        await expect(promise).resolves.toBe('ghp_abc123');
    });

    test('retries on authorization_pending and resolves eventually', async () => {
        makeMockRequest(https, { error: 'authorization_pending' });
        makeMockRequest(https, { access_token: 'ghp_abc123' });
        const promise = pollForToken('device-code', 0);
        await jest.runAllTimersAsync();
        await expect(promise).resolves.toBe('ghp_abc123');
    });

    test('rejects on access_denied', async () => {
        makeMockRequest(https, { error: 'access_denied' });
        const promise = pollForToken('device-code', 0);
        const assertion = expect(promise).rejects.toThrow('Login was denied.');
        await jest.runAllTimersAsync();
        await assertion;
    });

    test('rejects on expired_token', async () => {
        makeMockRequest(https, { error: 'expired_token' });
        const promise = pollForToken('device-code', 0);
        const assertion = expect(promise).rejects.toThrow('Login timed out. Please try again.');
        await jest.runAllTimersAsync();
        await assertion;
    });

    test('increases interval on slow_down and continues', async () => {
        makeMockRequest(https, { error: 'slow_down' });
        makeMockRequest(https, { access_token: 'ghp_abc123' });
        const promise = pollForToken('device-code', 0);
        await jest.runAllTimersAsync();
        await expect(promise).resolves.toBe('ghp_abc123');
    });
});

// ─── token storage ────────────────────────────────────────────────────────────

describe('token storage', () => {
    let storeToken, loadToken, clearToken;
    let safeStorage, fs;

    beforeEach(() => {
        jest.resetModules();
        jest.mock('electron');
        jest.mock('fs');
        safeStorage = require('electron').safeStorage;
        fs = require('fs');
        ({ storeToken, loadToken, clearToken } = require('../auth'));
    });

    test('storeToken encrypts and writes to file', () => {
        fs.writeFileSync = jest.fn();
        storeToken('ghp_test');
        expect(safeStorage.encryptString).toHaveBeenCalledWith('ghp_test');
        expect(fs.writeFileSync).toHaveBeenCalled();
    });

    test('loadToken returns null when file does not exist', () => {
        fs.existsSync = jest.fn(() => false);
        expect(loadToken()).toBeNull();
    });

    test('loadToken decrypts and returns token', () => {
        fs.existsSync = jest.fn(() => true);
        fs.readFileSync = jest.fn(() => Buffer.from('ghp_test'));
        expect(loadToken()).toBe('ghp_test');
    });

    test('clearToken deletes the file', () => {
        fs.unlinkSync = jest.fn();
        clearToken();
        expect(fs.unlinkSync).toHaveBeenCalled();
    });
});
