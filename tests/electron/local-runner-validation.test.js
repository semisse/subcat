jest.mock('electron', () => ({
    ipcMain: { handle: jest.fn(), removeHandler: jest.fn() },
    dialog: {},
    Notification: class {},
}));

const { validateStartInput } = require('../../src/electron/ipc/local-runner');

const VALID = Object.freeze({
    repoPath: '/Users/me/repo',
    testCommand: 'npm test',
    repeat: 10,
    cpus: 2,
    memoryGb: 4,
});

describe('validateStartInput', () => {
    test('accepts minimal valid payload', () => {
        expect(validateStartInput({ ...VALID })).toBeNull();
    });

    test('rejects missing/empty repoPath', () => {
        expect(validateStartInput({ ...VALID, repoPath: '' })).toMatch(/Repository path is required/);
        expect(validateStartInput({ ...VALID, repoPath: undefined })).toMatch(/Repository path is required/);
    });

    test('rejects missing/empty testCommand', () => {
        expect(validateStartInput({ ...VALID, testCommand: '' })).toMatch(/Test command is required/);
    });

    test('rejects colons in repoPath (docker -v injection)', () => {
        expect(validateStartInput({ ...VALID, repoPath: '/foo:/etc' })).toMatch(/Repository path contains invalid/);
    });

    test('rejects colons/semicolons/commas/newlines in envFile', () => {
        for (const bad of ['/a:/b', '/a;rm', '/a,b', '/a\nb']) {
            expect(validateStartInput({ ...VALID, envFile: bad })).toMatch(/Env file path contains invalid/);
        }
    });

    test('rejects colons and parent traversal in envTarget', () => {
        expect(validateStartInput({ ...VALID, envTarget: 'a:b' })).toMatch(/Env target contains invalid/);
        expect(validateStartInput({ ...VALID, envTarget: '../secret.env' })).toMatch(/traverse parent/);
        expect(validateStartInput({ ...VALID, envTarget: 'sub/../../etc' })).toMatch(/traverse parent/);
    });

    test('accepts envTarget without unsafe chars', () => {
        expect(validateStartInput({ ...VALID, envTarget: '.env.local' })).toBeNull();
        expect(validateStartInput({ ...VALID, envTarget: 'apps/web/.env' })).toBeNull();
    });

    test('rejects out-of-range numerics', () => {
        expect(validateStartInput({ ...VALID, repeat: 0 })).toMatch(/Repeat must be/);
        expect(validateStartInput({ ...VALID, repeat: 99999 })).toMatch(/Repeat must be/);
        expect(validateStartInput({ ...VALID, cpus: 0 })).toMatch(/CPUs must be/);
        expect(validateStartInput({ ...VALID, memoryGb: 99999 })).toMatch(/Memory/);
        expect(validateStartInput({ ...VALID, packetLoss: 101 })).toMatch(/Packet loss/);
        expect(validateStartInput({ ...VALID, ulimitNofile: 1 })).toMatch(/ulimit/);
    });

    test('accepts zero for fields where zero is meaningful', () => {
        expect(validateStartInput({ ...VALID, networkLatency: 0 })).toBeNull();
        expect(validateStartInput({ ...VALID, packetLoss: 0 })).toBeNull();
        expect(validateStartInput({ ...VALID, staleRead: 0 })).toBeNull();
    });

    test('rejects non-integer where integer required', () => {
        expect(validateStartInput({ ...VALID, repeat: 1.5 })).toMatch(/integer/);
        expect(validateStartInput({ ...VALID, networkLatency: 'fast' })).toMatch(/integer/);
    });

    test('rejects unknown platform', () => {
        expect(validateStartInput({ ...VALID, platform: 'linux/arm64' })).toMatch(/Invalid platform/);
        expect(validateStartInput({ ...VALID, platform: null })).toBeNull();
        expect(validateStartInput({ ...VALID, platform: 'linux/amd64' })).toBeNull();
    });

    test('rejects non-object payload', () => {
        expect(validateStartInput(null)).toMatch(/Invalid request/);
        expect(validateStartInput('hack')).toMatch(/Invalid request/);
    });

    test('rejects newlines and null bytes in testCommand', () => {
        for (const bad of ['npm test\nrm -rf /', 'npm test\r', 'npm test\0']) {
            expect(validateStartInput({ ...VALID, testCommand: bad })).toMatch(/Test command contains invalid/);
        }
    });

    test('rejects the progress sentinel inside testCommand', () => {
        expect(validateStartInput({ ...VALID, testCommand: 'echo __SUBCAT_DONE__' }))
            .toMatch(/reserved sentinel/);
    });

    test('rejects overly long testCommand', () => {
        expect(validateStartInput({ ...VALID, testCommand: 'a'.repeat(4097) }))
            .toMatch(/too long/);
    });

    test('validates installCommand when provided', () => {
        expect(validateStartInput({ ...VALID, installCommand: 'npm install' })).toBeNull();
        expect(validateStartInput({ ...VALID, installCommand: null })).toBeNull();
        expect(validateStartInput({ ...VALID, installCommand: '' })).toBeNull();
        expect(validateStartInput({ ...VALID, installCommand: 'npm i\nrm -rf /' }))
            .toMatch(/Install command contains invalid/);
        expect(validateStartInput({ ...VALID, installCommand: 'echo __SUBCAT_DONE__' }))
            .toMatch(/reserved sentinel/);
        expect(validateStartInput({ ...VALID, installCommand: 123 }))
            .toMatch(/must be a string/);
    });

    test('validates timezone format', () => {
        expect(validateStartInput({ ...VALID, timezone: 'Europe/Lisbon' })).toBeNull();
        expect(validateStartInput({ ...VALID, timezone: 'UTC' })).toBeNull();
        expect(validateStartInput({ ...VALID, timezone: 'Etc/GMT+3' })).toBeNull();
        expect(validateStartInput({ ...VALID, timezone: null })).toBeNull();
        expect(validateStartInput({ ...VALID, timezone: '' })).toBeNull();
        expect(validateStartInput({ ...VALID, timezone: 'Europe/Lisbon; rm -rf /' }))
            .toMatch(/Timezone contains invalid/);
        expect(validateStartInput({ ...VALID, timezone: 'a'.repeat(65) }))
            .toMatch(/Timezone contains invalid/);
    });
});
