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

// ── LocalRunner.isPlaywright ──────────────────────────────────────────────────

describe('LocalRunner.isPlaywright()', () => {
    test('returns true for "npx playwright test"', () => {
        expect(LocalRunner.isPlaywright('npx playwright test')).toBe(true);
    });

    test('returns true for "playwright test --grep=@smoke"', () => {
        expect(LocalRunner.isPlaywright('playwright test --grep=@smoke')).toBe(true);
    });

    test('returns false for "npx nx test myapp"', () => {
        expect(LocalRunner.isPlaywright('npx nx test myapp')).toBe(false);
    });

    test('returns false for "npx jest"', () => {
        expect(LocalRunner.isPlaywright('npx jest')).toBe(false);
    });

    test('returns false for "npx vitest run"', () => {
        expect(LocalRunner.isPlaywright('npx vitest run')).toBe(false);
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

// ── LocalRunner._parseResults (Playwright) ───────────────────────────────────

describe('LocalRunner._parseResults() — Playwright', () => {
    let runner;
    beforeEach(() => {
        runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx playwright test' });
        runner._isPlaywright = true;
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

// ── LocalRunner._parseResults (Jest/Nx loop) ─────────────────────────────────

describe('LocalRunner._parseResults() — Jest/Nx loop mode', () => {
    let runner;
    beforeEach(() => {
        runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx nx test myapp', repeat: 3 });
        runner._isPlaywright = false;
    });

    test('sums passed counts across N iterations', () => {
        const lines = [
            'Tests: 5 passed, 5 total',
            'Tests: 5 passed, 5 total',
            'Tests: 5 passed, 5 total',
        ];
        const r = runner._parseResults(lines);
        expect(r.passed).toBe(15);
    });

    test('sums failed counts across N iterations', () => {
        const lines = [
            'Tests: 1 failed, 4 passed, 5 total',
            'Tests: 0 failed, 5 passed, 5 total',
            'Tests: 2 failed, 3 passed, 5 total',
        ];
        const r = runner._parseResults(lines);
        expect(r.failed).toBe(3);
        expect(r.passed).toBe(12);
    });

    test('flaky is always 0 for non-Playwright', () => {
        const r = runner._parseResults(['Tests: 5 passed, 5 total']);
        expect(r.flaky).toBe(0);
    });

    test('returns zeros when no summary lines present', () => {
        const r = runner._parseResults(['PASS src/foo.test.js', 'some output']);
        expect(r).toEqual({ passed: 0, failed: 0, flaky: 0, failedTestNames: [] });
    });
});

// ── LocalRunner shell command (Playwright vs loop) ────────────────────────────

describe('LocalRunner.start() — shell command selection', () => {
    function captureDockerArgs() {
        const calls = [];
        mockSpawnImpl = jest.fn((...args) => {
            calls.push(args);
            return makeFakeProcess();
        });
        return calls;
    }

    function getDockerArgs(calls) {
        return calls.find(([cmd]) => cmd === 'docker')[1];
    }

    function getShellCmd(calls) {
        const args = getDockerArgs(calls);
        return args.at(-1);
    }

    test('Playwright with repeat uses --repeat-each flag', async () => {
        const calls = captureDockerArgs();
        const runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx playwright test', repeat: 5 });
        runner.on('done', () => {});
        await runner.start();
        expect(getShellCmd(calls)).toBe('npx playwright test --repeat-each=5');
    });

    test('non-Playwright with repeat uses shell loop with sentinel', async () => {
        const calls = captureDockerArgs();
        const runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx nx test myapp', repeat: 3 });
        runner.on('done', () => {});
        await runner.start();
        expect(getShellCmd(calls)).toBe('for i in $(seq 1 3); do npx nx test myapp; echo __SUBCAT_DONE__; done');
    });

    test('non-Playwright with repeat=1 runs command directly', async () => {
        const calls = captureDockerArgs();
        const runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx nx test myapp', repeat: 1 });
        runner.on('done', () => {});
        await runner.start();
        expect(getShellCmd(calls)).toBe('npx nx test myapp');
    });

    // ── Progress sentinel ─────────────────────────────────────────────────────

    test('non-Playwright repeat=1 has no sentinel (single run, no loop)', async () => {
        const calls = captureDockerArgs();
        const runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx nx test myapp', repeat: 1 });
        runner.on('done', () => {});
        await runner.start();
        expect(getShellCmd(calls)).not.toContain('__SUBCAT_DONE__');
    });

    // ── Stress factors — randomize ─────────────────────────────────────────────

    test('randomize: appends --randomize for Jest/Nx', async () => {
        const calls = captureDockerArgs();
        const runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx nx test myapp', repeat: 1, randomize: true });
        runner.on('done', () => {});
        await runner.start();
        expect(getShellCmd(calls)).toBe('npx nx test myapp --randomize');
    });

    test('randomize: does NOT append --randomize for Playwright', async () => {
        const calls = captureDockerArgs();
        const runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx playwright test', repeat: 1, randomize: true });
        runner.on('done', () => {});
        await runner.start();
        expect(getShellCmd(calls)).not.toContain('--randomize');
    });

    test('randomize: works with repeat loop for Jest/Nx', async () => {
        const calls = captureDockerArgs();
        const runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx nx test myapp', repeat: 3, randomize: true });
        runner.on('done', () => {});
        await runner.start();
        expect(getShellCmd(calls)).toBe('for i in $(seq 1 3); do npx nx test myapp --randomize; echo __SUBCAT_DONE__; done');
    });

    // ── Stress factors — maxWorkers ────────────────────────────────────────────

    test('maxWorkers: appends --maxWorkers=N for Jest/Nx', async () => {
        const calls = captureDockerArgs();
        const runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx nx test myapp', repeat: 1, maxWorkers: 1 });
        runner.on('done', () => {});
        await runner.start();
        expect(getShellCmd(calls)).toBe('npx nx test myapp --maxWorkers=1');
    });

    test('maxWorkers: appends --workers=N for Playwright', async () => {
        const calls = captureDockerArgs();
        const runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx playwright test', repeat: 1, maxWorkers: 2 });
        runner.on('done', () => {});
        await runner.start();
        expect(getShellCmd(calls)).toBe('npx playwright test --workers=2');
    });

    test('maxWorkers: null leaves command unchanged', async () => {
        const calls = captureDockerArgs();
        const runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx nx test myapp', repeat: 1, maxWorkers: null });
        runner.on('done', () => {});
        await runner.start();
        expect(getShellCmd(calls)).toBe('npx nx test myapp');
    });

    // ── Stress factors — timezone ──────────────────────────────────────────────

    test('timezone: adds -e TZ=... to Docker args', async () => {
        const calls = captureDockerArgs();
        const runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx nx test myapp', repeat: 1, timezone: 'America/New_York' });
        runner.on('done', () => {});
        await runner.start();
        const args = getDockerArgs(calls);
        const tzIdx = args.indexOf('-e');
        const tzValues = [];
        for (let i = 0; i < args.length - 1; i++) {
            if (args[i] === '-e') tzValues.push(args[i + 1]);
        }
        expect(tzValues).toContain('TZ=America/New_York');
    });

    test('timezone: null does not add TZ env var', async () => {
        const calls = captureDockerArgs();
        const runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx nx test myapp', repeat: 1, timezone: null });
        runner.on('done', () => {});
        await runner.start();
        const args = getDockerArgs(calls);
        const envValues = [];
        for (let i = 0; i < args.length - 1; i++) {
            if (args[i] === '-e') envValues.push(args[i + 1]);
        }
        expect(envValues.some(v => v.startsWith('TZ='))).toBe(false);
    });

    // ── Stress factors — ulimitNofile ──────────────────────────────────────────

    test('ulimitNofile: adds --ulimit nofile=N:N to Docker args', async () => {
        const calls = captureDockerArgs();
        const runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx nx test myapp', repeat: 1, ulimitNofile: 512 });
        runner.on('done', () => {});
        await runner.start();
        const args = getDockerArgs(calls);
        const ulimitIdx = args.indexOf('--ulimit');
        expect(ulimitIdx).toBeGreaterThan(-1);
        expect(args[ulimitIdx + 1]).toBe('nofile=512:512');
    });

    test('ulimitNofile: null does not add --ulimit flag', async () => {
        const calls = captureDockerArgs();
        const runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx nx test myapp', repeat: 1, ulimitNofile: null });
        runner.on('done', () => {});
        await runner.start();
        const args = getDockerArgs(calls);
        expect(args).not.toContain('--ulimit');
    });

    // ── Stress factors — networkLatency ────────────────────────────────────────

    test('networkLatency: adds --cap-add NET_ADMIN to Docker args', async () => {
        const calls = captureDockerArgs();
        const runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx nx test myapp', repeat: 1, networkLatency: 100 });
        runner.on('done', () => {});
        await runner.start();
        const args = getDockerArgs(calls);
        expect(args).toContain('--cap-add');
        expect(args[args.indexOf('--cap-add') + 1]).toBe('NET_ADMIN');
    });

    test('networkLatency: prepends tc netem setup to shell command', async () => {
        const calls = captureDockerArgs();
        const runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx nx test myapp', repeat: 1, networkLatency: 150 });
        runner.on('done', () => {});
        await runner.start();
        const shCmd = getShellCmd(calls);
        expect(shCmd).toContain('tc qdisc add dev eth0 root netem delay 150ms 20ms');
        expect(shCmd).toContain('npx nx test myapp');
    });

    test('networkLatency: null does not add --cap-add or tc setup', async () => {
        const calls = captureDockerArgs();
        const runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx nx test myapp', repeat: 1, networkLatency: null });
        runner.on('done', () => {});
        await runner.start();
        const args = getDockerArgs(calls);
        const shCmd = getShellCmd(calls);
        expect(args).not.toContain('--cap-add');
        expect(shCmd).not.toContain('tc qdisc');
    });

    // ── Stress factors — combinations ──────────────────────────────────────────

    test('randomize + maxWorkers + timezone combined', async () => {
        const calls = captureDockerArgs();
        const runner = new LocalRunner({
            repoPath: '/r', testCommand: 'npx nx test myapp', repeat: 2,
            randomize: true, maxWorkers: 1, timezone: 'UTC',
        });
        runner.on('done', () => {});
        await runner.start();
        const shCmd = getShellCmd(calls);
        const args = getDockerArgs(calls);
        expect(shCmd).toContain('--randomize');
        expect(shCmd).toContain('--maxWorkers=1');
        const envValues = [];
        for (let i = 0; i < args.length - 1; i++) {
            if (args[i] === '-e') envValues.push(args[i + 1]);
        }
        expect(envValues).toContain('TZ=UTC');
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

    test('emits "progress" once per iteration via __SUBCAT_DONE__ sentinel', (done) => {
        const lines = [
            'Tests: 3 passed, 3 total',  // tool output (should NOT trigger progress)
            '__SUBCAT_DONE__',            // sentinel (SHOULD trigger)
            'Tests: 3 passed, 3 total',
            '__SUBCAT_DONE__',
        ];
        mockSpawnImpl = jest.fn(() => makeProcWithOutput(lines));

        const runner = new LocalRunner({ repoPath: '/r', testCommand: 'npx nx test myapp', repeat: 2 });
        const progressEvents = [];
        runner.on('progress', (p) => progressEvents.push(p));
        runner.on('done', () => {
            expect(progressEvents).toHaveLength(2);
            expect(progressEvents[0]).toEqual({ completed: 1, total: 2 });
            expect(progressEvents[1]).toEqual({ completed: 2, total: 2 });
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
