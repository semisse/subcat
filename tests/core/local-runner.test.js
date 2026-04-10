const { EventEmitter } = require('events');

// ── child_process mock ────────────────────────────────────────────────────────

let mockSpawnImpl;

jest.mock('child_process', () => ({
    spawn: (...args) => mockSpawnImpl(...args),
}));

// ── fs mock ───────────────────────────────────────────────────────────────────

let mockFsExistsImpl = () => false;
let mockFsReadFileImpl = () => { throw new Error('not found'); };

jest.mock('fs', () => ({
    existsSync: (...args) => mockFsExistsImpl(...args),
    readFileSync: (...args) => mockFsReadFileImpl(...args),
}));

const LocalRunner = require('../../src/core/local-runner');

// ── helpers ───────────────────────────────────────────────────────────────────

function makeFakeProcess({ exitCode = 0, errorEvent = null } = {}) {
    const proc = new EventEmitter();
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.kill = jest.fn();
    // Emit close asynchronously so listeners can attach
    setImmediate(() => {
        if (errorEvent) proc.emit('error', errorEvent);
        else proc.emit('close', exitCode);
    });
    return proc;
}

beforeEach(() => {
    mockSpawnImpl = jest.fn(() => makeFakeProcess());
    mockFsExistsImpl = () => false;
    mockFsReadFileImpl = () => { throw new Error('not found'); };
});

// ── LocalRunner.checkDocker ───────────────────────────────────────────────────

describe('LocalRunner.checkDocker()', () => {
    test('returns { available: true } when docker info exits 0', async () => {
        mockSpawnImpl = jest.fn(() => makeFakeProcess({ exitCode: 0 }));
        const result = await LocalRunner.checkDocker();
        expect(result).toEqual({ available: true });
        expect(mockSpawnImpl).toHaveBeenCalledWith('docker', ['info'], { stdio: 'ignore' });
    });

    test('returns { available: false } when docker info exits non-zero', async () => {
        mockSpawnImpl = jest.fn(() => makeFakeProcess({ exitCode: 1 }));
        const result = await LocalRunner.checkDocker();
        expect(result).toEqual({ available: false });
    });

    test('returns { available: false, error } when spawn throws (docker not installed)', async () => {
        mockSpawnImpl = jest.fn(() => { throw new Error('spawn ENOENT'); });
        const result = await LocalRunner.checkDocker();
        expect(result.available).toBe(false);
        expect(result.error).toMatch('spawn ENOENT');
    });
});

// ── LocalRunner.detectImage ───────────────────────────────────────────────────

describe('LocalRunner.detectImage()', () => {
    test('returns node:22 when package.json has no @playwright/test', async () => {
        mockFsReadFileImpl = () => JSON.stringify({ devDependencies: {} });
        const img = await LocalRunner.detectImage('/some/repo');
        expect(img).toBe('node:22');
    });

    test('returns node:22 when package.json cannot be read', async () => {
        mockFsReadFileImpl = () => { throw new Error('ENOENT'); };
        const img = await LocalRunner.detectImage('/some/repo');
        expect(img).toBe('node:22');
    });

    test('returns mcr playwright image when @playwright/test found in devDependencies', async () => {
        mockFsReadFileImpl = () => JSON.stringify({
            devDependencies: { '@playwright/test': '^1.52.0' },
        });
        const img = await LocalRunner.detectImage('/some/repo');
        expect(img).toBe('mcr.microsoft.com/playwright:v1.52.0-noble');
    });

    test('returns mcr playwright image when @playwright/test found in dependencies', async () => {
        mockFsReadFileImpl = () => JSON.stringify({
            dependencies: { '@playwright/test': '1.48.2' },
        });
        const img = await LocalRunner.detectImage('/some/repo');
        expect(img).toBe('mcr.microsoft.com/playwright:v1.48.2-noble');
    });

    test('strips ^ and ~ from version strings', async () => {
        mockFsReadFileImpl = () => JSON.stringify({
            dependencies: { '@playwright/test': '~1.48.2' },
        });
        const img = await LocalRunner.detectImage('/some/repo');
        expect(img).toBe('mcr.microsoft.com/playwright:v1.48.2-noble');
    });

    test('strips >= range prefixes', async () => {
        mockFsReadFileImpl = () => JSON.stringify({
            devDependencies: { '@playwright/test': '>=1.50.0' },
        });
        const img = await LocalRunner.detectImage('/some/repo');
        expect(img).toBe('mcr.microsoft.com/playwright:v1.50.0-noble');
    });
});

// ── LocalRunner._parseResults ─────────────────────────────────────────────────

describe('LocalRunner._parseResults()', () => {
    let runner;
    beforeEach(() => {
        runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx playwright test' });
    });

    test('parses "5 passed" correctly', () => {
        const r = runner._parseResults(['5 passed (30s)']);
        expect(r.passed).toBe(5);
    });

    test('parses "2 failed" correctly', () => {
        const r = runner._parseResults(['2 failed']);
        expect(r.failed).toBe(2);
    });

    test('parses "1 flaky" correctly', () => {
        const r = runner._parseResults(['1 flaky']);
        expect(r.flaky).toBe(1);
    });

    test('extracts failed test names', () => {
        const lines = [
            '  1) tests/flaky.spec.ts:10:5 › My flaky test',
            '  2) tests/other.spec.ts:20 › Another test',
        ];
        const r = runner._parseResults(lines);
        expect(r.failedTestNames).toEqual([
            'tests/flaky.spec.ts:10:5 › My flaky test',
            'tests/other.spec.ts:20 › Another test',
        ]);
    });

    test('returns zeros when output has no summary', () => {
        const r = runner._parseResults(['some random output', 'without test summary']);
        expect(r).toEqual({ passed: 0, failed: 0, flaky: 0, failedTestNames: [] });
    });
});

// ── LocalRunner events ────────────────────────────────────────────────────────

describe('LocalRunner events', () => {
    function makeProcWithOutput(lines) {
        const proc = new EventEmitter();
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.kill = jest.fn();
        setImmediate(() => {
            for (const line of lines) {
                proc.stdout.emit('data', line + '\n');
            }
            proc.emit('close', 0);
        });
        return proc;
    }

    test('emits "line" for each stdout line', (done) => {
        const lines = ['line one', 'line two', '3 passed'];
        mockSpawnImpl = jest.fn(() => makeProcWithOutput(lines));

        const runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx playwright test' });
        const received = [];
        runner.on('line', (l) => received.push(l));
        runner.on('done', () => {
            expect(received).toEqual(expect.arrayContaining(['line one', 'line two']));
            done();
        });
        runner.start();
    });

    test('emits "done" with parsed results on close', (done) => {
        mockSpawnImpl = jest.fn(() => makeProcWithOutput(['5 passed (10s)', '1 failed']));

        const runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx playwright test' });
        runner.on('done', (results) => {
            expect(results.passed).toBe(5);
            expect(results.failed).toBe(1);
            expect(results.exitCode).toBe(0);
            done();
        });
        runner.start();
    });

    test('emits "error" when spawn throws', (done) => {
        const err = new Error('spawn ENOENT');
        mockSpawnImpl = jest.fn(() => {
            const proc = makeProcWithOutput([]);
            setImmediate(() => proc.emit('error', err));
            return proc;
        });

        const runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx playwright test' });
        runner.on('error', (e) => {
            expect(e.message).toBe('spawn ENOENT');
            done();
        });
        runner.on('done', () => {}); // prevent unhandled
        runner.start();
    });

    test('stop() calls docker kill with the container name', async () => {
        const killProc = new EventEmitter();
        killProc.stdout = new EventEmitter();
        killProc.stderr = new EventEmitter();
        killProc.kill = jest.fn();

        const spawnCalls = [];
        mockSpawnImpl = jest.fn((...args) => {
            spawnCalls.push(args);
            return makeFakeProcess();
        });

        const runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx playwright test' });
        runner.on('done', () => {});
        await runner.start();
        runner.stop();

        expect(mockSpawnImpl).toHaveBeenCalledWith(
            'docker', ['kill', runner.containerName], { stdio: 'ignore' }
        );
    });
});
