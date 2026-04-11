const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class LocalRunner extends EventEmitter {
    constructor({ repoPath, testCommand, repeat = 10, cpus = 2, memoryGb = 7 }) {
        super();
        this.repoPath = repoPath;
        this.testCommand = testCommand;
        this.repeat = repeat;
        this.cpus = cpus;
        this.memoryGb = memoryGb;
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

        let shellCmd;
        if (this._isPlaywright) {
            shellCmd = this.repeat > 1
                ? `${this.testCommand} --repeat-each=${this.repeat}`
                : this.testCommand;
        } else {
            shellCmd = this.repeat > 1
                ? `for i in $(seq 1 ${this.repeat}); do ${this.testCommand}; done`
                : this.testCommand;
        }

        const args = [
            'run', '--rm',
            `--name=${this.containerName}`,
            `--cpus=${this.cpus}`,
            `--memory=${this.memoryGb}g`,
            `--memory-swap=${this.memoryGb}g`,
            '--shm-size=1g',
            '-e', 'CI=true',
            '-v', `${this.repoPath}:/app`,
            '-w', '/app',
            image,
            'sh', '-c',
            shellCmd,
        ];

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
                    // Jest/Vitest/Nx: count completed iterations via summary lines
                    if (/\bTests:\s/.test(line)) {
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
