const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class LocalRunner extends EventEmitter {
    constructor({ repoPath, testCommand, repeat = 10, cpus = 2, memoryGb = 7, randomize = false, timezone = null, maxWorkers = null, ulimitNofile = null, networkLatency = null, cpuStress = null, packetLoss = null, staleRead = null, envFile = null, envTarget = null, installCommand = null }) {
        super();
        this.repoPath = repoPath;
        this.testCommand = testCommand;
        this.repeat = repeat;
        this.cpus = cpus;
        this.memoryGb = memoryGb;
        this.randomize = randomize;
        this.timezone = timezone;
        this.maxWorkers = maxWorkers;
        this.ulimitNofile = ulimitNofile;
        this.networkLatency = networkLatency;
        this.cpuStress = cpuStress;
        this.packetLoss = packetLoss;
        this.staleRead = staleRead;
        this.envFile = envFile;
        this.envTarget = envTarget;
        this.installCommand = installCommand;
        this.containerName = `subcat-stress-${Date.now()}`;
        this._process = null;
        this._outputLines = [];
    }

    static checkDocker() {
        return new Promise((resolve) => {
            let proc;
            try {
                proc = spawn('docker', ['info'], { stdio: 'ignore' });
            } catch (err) {
                resolve({ available: false, error: err.message });
                return;
            }
            proc.on('error', (err) => resolve({ available: false, error: err.message }));
            proc.on('close', (code) => resolve({ available: code === 0 }));
        });
    }

    static isPlaywright(testCommand) {
        return /playwright/.test(testCommand);
    }

    static detectImage(repoPath) {
        try {
            const pkgPath = path.join(repoPath, 'package.json');
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            const deps = { ...pkg.dependencies, ...pkg.devDependencies };
            const raw = deps['@playwright/test'];
            if (!raw) return Promise.resolve('node:22');

            // Strip semver range operators and extract X.Y.Z
            const match = raw.replace(/^[^0-9]*/, '').match(/^(\d+\.\d+\.\d+)/);
            if (!match) return Promise.resolve('node:22');

            return Promise.resolve(`mcr.microsoft.com/playwright:v${match[1]}-noble`);
        } catch {
            return Promise.resolve('node:22');
        }
    }

    async start() {
        const image = await LocalRunner.detectImage(this.repoPath);
        this._isPlaywright = LocalRunner.isPlaywright(this.testCommand);

        // Build test command with stress flags
        let baseCmd = this.testCommand;

        if (this.maxWorkers !== null) {
            baseCmd += this._isPlaywright
                ? ` --workers=${this.maxWorkers}`
                : ` --maxWorkers=${this.maxWorkers}`;
        }

        if (this.randomize && !this._isPlaywright) {
            baseCmd += ' --randomize';
        }

        // Build shell command with repeat logic
        let shellCmd;
        if (this._isPlaywright) {
            shellCmd = this.repeat > 1
                ? `${baseCmd} --repeat-each=${this.repeat}`
                : baseCmd;
        } else {
            // Inject a sentinel after each iteration so progress tracking is
            // tool-agnostic (avoids depending on Jest/Vitest/Nx output format).
            shellCmd = this.repeat > 1
                ? `for i in $(seq 1 ${this.repeat}); do ${baseCmd}; echo __SUBCAT_DONE__; done`
                : baseCmd;
        }

        // Prepend setup steps to shell command (executed inside the container)
        const setupParts = [];

        // Load env file: export as env vars for the shell process
        if (this.envFile) {
            setupParts.push('set -a && . /tmp/subcat.env && set +a');
        }

        // Install dependencies inside the container (avoids host/Linux binary mismatch)
        if (this.installCommand) {
            setupParts.push(this.installCommand);
        }

        // apt packages needed for stress factors
        const needsNetem = this.networkLatency !== null || this.packetLoss !== null || this.staleRead !== null;
        const aptPkgs = [];
        if (this.cpuStress !== null) aptPkgs.push('stress-ng');
        if (needsNetem) aptPkgs.push('iproute2');
        if (aptPkgs.length) {
            setupParts.push(`apt-get update -qq > /dev/null 2>&1 && apt-get install -y ${aptPkgs.join(' ')} -qq > /dev/null 2>&1`);
        }

        // CPU stress: run stress-ng in background to create real CPU contention
        // Backgrounded with &, so it must be joined with ; not && (& is already a separator)
        let cpuStressPrefix = '';
        if (this.cpuStress !== null) {
            cpuStressPrefix = `stress-ng --cpu ${this.cpuStress} --timeout 0 & `;
        }

        // Network stress setup (requires --cap-add NET_ADMIN in Docker args)
        if (needsNetem) {
            const netemParts = ['tc qdisc add dev eth0 root netem'];
            if (this.networkLatency !== null) netemParts.push(`delay ${this.networkLatency}ms 20ms`);
            if (this.packetLoss !== null) netemParts.push(`loss ${this.packetLoss}%`);
            if (this.staleRead !== null) netemParts.push(`delay ${this.staleRead}ms 25% reorder 50% 25%`);
            setupParts.push(`${netemParts.join(' ')} 2>/dev/null || true`);
        }

        if (setupParts.length) {
            shellCmd = setupParts.join(' && ') + ' && ' + cpuStressPrefix + shellCmd;
        } else if (cpuStressPrefix) {
            shellCmd = cpuStressPrefix + shellCmd;
        }

        const args = [
            'run', '--rm',
            `--name=${this.containerName}`,
            `--cpus=${this.cpus}`,
            `--memory=${this.memoryGb}g`,
            `--memory-swap=${this.memoryGb}g`,
            '--shm-size=1g',
        ];

        if (this.timezone) {
            args.push('-e', `TZ=${this.timezone}`);
        }

        if (this.ulimitNofile !== null) {
            args.push('--ulimit', `nofile=${this.ulimitNofile}:${this.ulimitNofile}`);
        }

        if (needsNetem) {
            args.push('--cap-add', 'NET_ADMIN');
        }

        if (this.envFile) {
            args.push('-v', `${this.envFile}:/tmp/subcat.env:ro`);
            if (this.envTarget) {
                // Also mount over the project's .env so dotenv/Nx reads our values
                // Strip repoPath prefix if user pasted an absolute path
                let target = this.envTarget;
                if (target.startsWith(this.repoPath)) {
                    target = target.slice(this.repoPath.length).replace(/^\/+/, '');
                }
                args.push('-v', `${this.envFile}:/app/${target}:ro`);
            }
        }

        args.push('-v', `${this.repoPath}:/app`, '-w', '/app', image, 'sh', '-c', shellCmd);

        // Quote args that contain spaces/special chars for display purposes
        const displayArgs = args.map(a => /[\s&|;$]/.test(a) ? `'${a}'` : a);
        this._dockerCmd = `$ docker ${displayArgs.join(' ')}`;
        this._process = spawn('docker', args);

        let stdoutBuf = '';
        let stderrBuf = '';
        let completedCount = 0;

        this._process.stdout.on('data', (chunk) => {
            stdoutBuf += chunk.toString();
            const parts = stdoutBuf.split('\n');
            stdoutBuf = parts.pop(); // keep incomplete line
            for (const line of parts) {
                this._addLine(line);
                if (this._isPlaywright) {
                    // Playwright: count individual test result lines
                    if (/^\s+[✓✘·-]/.test(line)) {
                        completedCount++;
                        this.emit('progress', { completed: completedCount, total: this.repeat });
                    }
                } else {
                    // Jest/Vitest/Nx: sentinel injected into the shell loop
                    // fires once per iteration regardless of tool output format.
                    if (line.trim() === '__SUBCAT_DONE__') {
                        completedCount++;
                        this.emit('progress', { completed: completedCount, total: this.repeat });
                    }
                }
            }
        });

        this._process.stderr.on('data', (chunk) => {
            stderrBuf += chunk.toString();
            const parts = stderrBuf.split('\n');
            stderrBuf = parts.pop();
            for (const line of parts) {
                this._addLine(line);
            }
        });

        this._process.on('error', (err) => {
            this.emit('error', err);
        });

        this._process.on('close', (code) => {
            // Flush remaining buffers
            if (stdoutBuf) this._addLine(stdoutBuf);
            if (stderrBuf) this._addLine(stderrBuf);

            const results = this._parseResults(this._outputLines);
            results.exitCode = code;
            this.emit('done', results);
        });
    }

    stop() {
        spawn('docker', ['kill', this.containerName], { stdio: 'ignore' });
        this._process?.kill();
    }

    _addLine(line) {
        if (this._outputLines.length >= 2000) this._outputLines.shift();
        this._outputLines.push(line);
        this.emit('line', line);
    }

    _parseResults(lines) {
        const text = lines.join('\n');

        let passed, failed, flaky;
        if (this._isPlaywright) {
            // Playwright prints a single summary at the end with total counts
            const passedMatch = text.match(/(\d+) passed/);
            const failedMatch = text.match(/(\d+) failed/);
            const flakyMatch  = text.match(/(\d+) flaky/);
            passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
            failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;
            flaky  = flakyMatch  ? parseInt(flakyMatch[1],  10) : 0;
        } else {
            // Jest/Vitest/Nx loop: N summary lines — sum all occurrences
            passed = [...text.matchAll(/(\d+) passed/g)].reduce((s, m) => s + parseInt(m[1], 10), 0);
            failed = [...text.matchAll(/(\d+) failed/g)].reduce((s, m) => s + parseInt(m[1], 10), 0);
            flaky  = 0;
        }

        const failedTestNames = [];
        for (const line of lines) {
            const m = line.match(/^\s+\d+\)\s+(.+)/);
            if (m) failedTestNames.push(m[1].trim());
        }

        return { passed, failed, flaky, failedTestNames };
    }
}

module.exports = LocalRunner;
