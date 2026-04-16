// lab-test.js — Local Stress Test page
// Depends on: utils.js (escapeHtml, flakinessSummary)

let activeRunId = null;
let lastCompletedRunId = null;
let outputLines = [];

function setNavRunningDot(show) {
    const dot = document.getElementById('labTestNavDot');
    if (!dot) return;
    dot.style.visibility = show ? 'visible' : 'hidden';
    dot.className = show ? 'status-dot in_progress lab-test-nav-dot' : 'status-dot lab-test-nav-dot';
}

function initLabTest() {
    window.api.onLocalRunOutput(({ id, line }) => {
        if (id !== activeRunId) return;
        appendOutputLine(line);
    });

    window.api.onLocalRunProgress(({ id, completed, total }) => {
        if (id !== activeRunId) return;
        const el = document.getElementById('labTestProgress');
        if (el) el.innerHTML = `Running<span class="lab-test-dots"></span> ${completed} / ${total}`;

        const barWrap = document.getElementById('labTestProgressBarWrap');
        const barFill = document.getElementById('labTestProgressBarFill');
        const barLabel = document.getElementById('labTestProgressBarLabel');
        if (barWrap) barWrap.style.display = '';
        if (barFill && total > 0) {
            const pct = Math.round((completed / total) * 100);
            barFill.style.width = `${pct}%`;
            if (barLabel) barLabel.textContent = `${pct}%`;
        }
    });

    window.api.onLocalRunDone(({ id, results }) => {
        if (id !== activeRunId) return;
        lastCompletedRunId = id;
        activeRunId = null;
        setNavRunningDot(false);
        renderDoneState(results);
        renderHistory();
    });

    const repoInput = document.getElementById('labTestRepoPath');
    document.getElementById('labTestBrowse')?.addEventListener('click', async () => {
        const folder = await window.api.browseFolder();
        if (folder) {
            document.getElementById('labTestRepoPath').value = folder;
        }
    });

    document.getElementById('labTestBrowseEnv')?.addEventListener('click', async () => {
        const file = await window.api.browseEnvFile();
        if (file) document.getElementById('labTestEnvFile').value = file;
    });

    document.getElementById('labTestRunBtn')?.addEventListener('click', handleRun);
    document.getElementById('labTestStopBtn')?.addEventListener('click', handleStop);
    document.getElementById('labTestRunAgainBtn')?.addEventListener('click', handleRunAgain);
    document.getElementById('labTestSaveReportBtn')?.addEventListener('click', handleSaveReport);
    document.getElementById('labTestCopyOutputBtn')?.addEventListener('click', handleCopyOutput);
    document.getElementById('labTestDockerRetry')?.addEventListener('click', checkDockerStatus);

    document.querySelectorAll('.lab-stress-preset-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // don't toggle the <details>
            if (btn.classList.contains('active')) {
                applyStressPreset('none');
            } else {
                applyStressPreset(btn.dataset.preset);
            }
        });
    });
}

const STRESS_PRESETS = {
    none: {
        randomize: false, timezone: '',
        maxWorkers: '', ulimit: false, ulimitValue: 512,
        networkLatency: false, networkLatencyMs: 100,
        cpuStress: false, cpuStressWorkers: 1,
        packetLoss: false, packetLossPercent: 2,
        staleRead: false, staleReadMs: 100,
    },
    light: {
        randomize: true, timezone: 'America/New_York',
        maxWorkers: null, ulimit: false, ulimitValue: 512,
        networkLatency: false, networkLatencyMs: 100,
        cpuStress: false, cpuStressWorkers: 1,
        packetLoss: false, packetLossPercent: 2,
        staleRead: false, staleReadMs: 100,
    },
    medium: {
        randomize: true, timezone: 'America/New_York',
        maxWorkers: '2', ulimit: true, ulimitValue: 1024,
        networkLatency: true, networkLatencyMs: 50,
        cpuStress: true, cpuStressWorkers: 1,
        packetLoss: true, packetLossPercent: 2,
        staleRead: false, staleReadMs: 100,
    },
    heavy: {
        randomize: true, timezone: 'America/New_York',
        maxWorkers: '1', ulimit: true, ulimitValue: 512,
        networkLatency: true, networkLatencyMs: 100,
        cpuStress: true, cpuStressWorkers: 2,
        packetLoss: true, packetLossPercent: 5,
        staleRead: true, staleReadMs: 200,
    },
};

function applyStressPreset(presetName) {
    const preset = STRESS_PRESETS[presetName];
    if (!preset) return;

    const details = document.getElementById('labTestStressDetails');
    if (details) details.open = true;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    const check = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val; };

    check('labTestRandomize', preset.randomize);
    set('labTestTimezone', preset.timezone);
    set('labTestMaxWorkers', preset.maxWorkers ?? '');
    check('labTestUlimitEnabled', preset.ulimit);
    set('labTestUlimitValue', preset.ulimitValue);
    check('labTestNetworkLatencyEnabled', preset.networkLatency);
    set('labTestNetworkLatencyMs', preset.networkLatencyMs);
    check('labTestCpuStressEnabled', preset.cpuStress);
    set('labTestCpuStressWorkers', preset.cpuStressWorkers);
    check('labTestPacketLossEnabled', preset.packetLoss);
    set('labTestPacketLossPercent', preset.packetLossPercent);
    check('labTestStaleReadEnabled', preset.staleRead);
    set('labTestStaleReadMs', preset.staleReadMs);

    // Highlight active preset button
    document.querySelectorAll('.lab-stress-preset-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.preset === presetName);
    });
}

function initLabTestPage() {
    checkDockerStatus();
    renderHistory();
}

async function checkDockerStatus() {
    const chip = document.getElementById('labTestDockerChip');
    const page = document.getElementById('pageLabtest');
    const setChip = (state, label) => {
        if (!chip) return;
        chip.className = `lab-docker-chip lab-docker-chip--${state}`;
        const labelEl = chip.querySelector('.lab-docker-chip-label');
        if (labelEl) labelEl.textContent = label;
    };

    setChip('checking', 'Checking…');
    if (page) page.dataset.docker = 'checking';

    const result = await window.api.checkDocker();
    const runBtn = document.getElementById('labTestRunBtn');
    if (result.available) {
        setChip('ok', 'Docker ready');
        if (page) page.dataset.docker = 'ok';
        if (runBtn) runBtn.disabled = false;
    } else {
        setChip('error', 'Docker not found');
        if (page) page.dataset.docker = 'error';
        if (runBtn) runBtn.disabled = true;
    }
}

async function handleRun() {
    const repoPath   = document.getElementById('labTestRepoPath')?.value.trim();
    const testCmd    = document.getElementById('labTestCommand')?.value.trim();
    const repeat     = parseInt(document.getElementById('labTestRepeat')?.value, 10) || 10;
    const cpus       = parseFloat(document.getElementById('labTestCpus')?.value) || 2;
    const memoryGb   = parseFloat(document.getElementById('labTestMemory')?.value) || 7;

    const randomize  = document.getElementById('labTestRandomize')?.checked ?? false;
    const timezone   = document.getElementById('labTestTimezone')?.value || null;
    const maxWorkersRaw = document.getElementById('labTestMaxWorkers')?.value;
    const maxWorkers = maxWorkersRaw ? parseInt(maxWorkersRaw, 10) : null;
    const ulimitEnabled = document.getElementById('labTestUlimitEnabled')?.checked ?? false;
    const ulimitNofile  = ulimitEnabled ? (parseInt(document.getElementById('labTestUlimitValue')?.value, 10) || 512) : null;
    const networkLatencyEnabled = document.getElementById('labTestNetworkLatencyEnabled')?.checked ?? false;
    const networkLatency = networkLatencyEnabled ? (parseInt(document.getElementById('labTestNetworkLatencyMs')?.value, 10) || 100) : null;
    const cpuStressEnabled = document.getElementById('labTestCpuStressEnabled')?.checked ?? false;
    const cpuStress = cpuStressEnabled ? (parseInt(document.getElementById('labTestCpuStressWorkers')?.value, 10) || 2) : null;
    const packetLossEnabled = document.getElementById('labTestPacketLossEnabled')?.checked ?? false;
    const packetLoss = packetLossEnabled ? (parseInt(document.getElementById('labTestPacketLossPercent')?.value, 10) || 5) : null;
    const staleReadEnabled = document.getElementById('labTestStaleReadEnabled')?.checked ?? false;
    const staleRead = staleReadEnabled ? (parseInt(document.getElementById('labTestStaleReadMs')?.value, 10) || 200) : null;
    const envFile = document.getElementById('labTestEnvFile')?.value.trim() || null;
    const envTarget = document.getElementById('labTestEnvTarget')?.value.trim() || null;
    const platform = document.getElementById('labTestForceAmd64')?.checked ? 'linux/amd64' : null;
    const installCommand = document.getElementById('labTestInstallCommand')?.value.trim() || null;

    if (!repoPath || !testCmd) return;

    outputLines = [];
    setPageState('running');
    const progressEl = document.getElementById('labTestProgress');
    if (progressEl) progressEl.innerHTML = `Running<span class="lab-test-dots"></span> 0 / ${repeat}`;

    const outputEl = document.getElementById('labTestOutput');
    if (outputEl) outputEl.textContent = '';

    const barWrap = document.getElementById('labTestProgressBarWrap');
    const barFill = document.getElementById('labTestProgressBarFill');
    const barLabel = document.getElementById('labTestProgressBarLabel');
    if (barWrap) barWrap.style.display = 'none';
    if (barFill) { barFill.style.width = '0%'; barFill.classList.remove('done', 'has-failures'); }
    if (barLabel) barLabel.textContent = '0%';

    const { id } = await window.api.startLocalRun({ repoPath, testCommand: testCmd, repeat, cpus, memoryGb, randomize, timezone, maxWorkers, ulimitNofile, networkLatency, cpuStress, packetLoss, staleRead, envFile, envTarget, installCommand, platform });
    activeRunId = id;
    setNavRunningDot(true);
}

async function handleStop() {
    if (activeRunId != null) {
        await window.api.stopLocalRun(activeRunId);
        activeRunId = null;
        setNavRunningDot(false);
    }
    setPageState('idle');
}

function handleRunAgain() {
    setPageState('idle');
}

async function handleCopyOutput() {
    const btn = document.getElementById('labTestCopyOutputBtn');
    const text = outputLines.join('\n');
    if (!text) return;
    try {
        await navigator.clipboard.writeText(text);
        if (btn) {
            const original = btn.textContent;
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = original; }, 1500);
        }
    } catch {
        // clipboard API unavailable — no-op
    }
}

async function handleSaveReport() {
    if (!lastCompletedRunId) return;
    const btn = document.getElementById('labTestSaveReportBtn');
    const result = await window.api.saveLocalRunReport(lastCompletedRunId);
    if (result?.saved && btn) {
        btn.textContent = 'Saved!';
        setTimeout(() => { btn.textContent = 'Save Report'; }, 2000);
    }
}

function appendOutputLine(line) {
    const outputEl = document.getElementById('labTestOutput');
    if (!outputEl) return;

    outputLines.push(line);
    // Keep DOM bounded
    if (outputEl.childElementCount > 1000) {
        outputEl.firstChild?.remove();
    }

    const span = document.createElement('span');
    span.textContent = line + '\n';
    if (/[✘✗]|failed|error/i.test(line)) span.className = 'output-fail';
    else if (/[✓✔]|passed/i.test(line)) span.className = 'output-pass';
    outputEl.appendChild(span);
    outputEl.scrollTop = outputEl.scrollHeight;
}

function renderDoneState(results) {
    setPageState('done');

    const infraFailure = (results.passed + results.failed + results.flaky) === 0 && !results.error;

    const barFill = document.getElementById('labTestProgressBarFill');
    if (barFill) {
        barFill.style.width = '100%';
        barFill.classList.add((results.failed > 0 || infraFailure) ? 'has-failures' : 'done');
    }

    if (results.error) {
        document.getElementById('labTestResultSummary').innerHTML =
            `<span class="lab-result-error">Error: ${escapeHtml(results.error)}</span>`;
        return;
    }

    if (infraFailure) {
        const exitInfo = results.exitCode != null ? ` (exit code ${results.exitCode})` : '';
        document.getElementById('labTestResultSummary').innerHTML =
            `<span class="lab-result-error">No tests executed${escapeHtml(exitInfo)} — likely a setup failure (install, env vars, target path, or container crash). Check the output log.</span>`;
        return;
    }

    const repeat = results.repeat || parseInt(document.getElementById('labTestRepeat')?.value, 10) || 1;
    const perRun = (n) => repeat > 1 ? Math.round(n / repeat) : n;
    const passedPerRun = perRun(results.passed);
    const failedPerRun = perRun(results.failed);
    const flakyPerRun  = perRun(results.flaky);
    const totalPerRun  = passedPerRun + failedPerRun + flakyPerRun;

    // Flakiness badge — adapt flakinessSummary logic for local runs
    let flakinessLabel;
    if (failedPerRun === 0 && flakyPerRun === 0) {
        flakinessLabel = 'Stable';
    } else if (failedPerRun < totalPerRun / 2) {
        flakinessLabel = 'Probably flaky';
    } else {
        flakinessLabel = 'Flaky';
    }
    const badgeClass = flakinessLabel === 'Stable' ? 'badge-stable'
        : flakinessLabel === 'Probably flaky' ? 'badge-probably-flaky'
        : 'badge-flaky';

    const runsLabel = repeat > 1 ? `<div class="lab-result-runs">Results for ${repeat} runs</div>` : '';

    let html = `
        <div class="lab-result-badge ${badgeClass}">${escapeHtml(flakinessLabel)}</div>
        ${runsLabel}
        <div class="lab-result-counts">
            <span class="count-pass">${passedPerRun} passed</span>
            <span class="count-fail">${failedPerRun} failed</span>
            <span class="count-flaky">${flakyPerRun} flaky</span>
        </div>
    `;

    if (results.failedTestNames?.length) {
        html += `<div class="lab-result-failed-tests"><strong>Failed tests:</strong><ul>`;
        for (const name of results.failedTestNames) {
            html += `<li>${escapeHtml(name)}</li>`;
        }
        html += `</ul></div>`;
    }

    document.getElementById('labTestResultSummary').innerHTML = html;
}

function setPageState(state) {
    const page = document.getElementById('pageLabtest');
    if (!page) return;
    page.dataset.state = state;
}

async function renderHistory() {
    const container = document.getElementById('labTestHistory');
    if (!container) return;

    const runs = await window.api.getLocalRuns();

    if (!runs || runs.length === 0) {
        container.innerHTML = '';
        return;
    }

    let rows = '';
    for (const run of runs) {
        const date = run.started_at
            ? new Date(run.started_at + 'Z').toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : '—';

        let badge = '';
        if (run.status === 'cancelled') {
            badge = '<span class="lab-history-badge cancelled">Cancelled</span>';
        } else if (run.status === 'failed') {
            badge = '<span class="lab-history-badge failed">Error</span>';
        } else if (run.passed != null || run.failed != null) {
            const perRun = (n) => run.repeat_count > 1 ? Math.round((n || 0) / run.repeat_count) : (n || 0);
            const p = perRun(run.passed);
            const f = perRun(run.failed);
            const total = p + f;
            let label, cls;
            if (total === 0) { label = 'No tests'; cls = 'failed'; }
            else if (f === 0) { label = 'Stable'; cls = 'stable'; }
            else if (f < total / 2) { label = 'Probably flaky'; cls = 'probably-flaky'; }
            else { label = 'Flaky'; cls = 'flaky'; }
            badge = `<span class="lab-history-badge ${cls}">${label}</span>`;
        } else {
            badge = '<span class="lab-history-badge running">Running</span>';
        }

        const project = run.repo_path
            ? run.repo_path.replace(/\/+$/, '').split('/').pop()
            : '—';

        const cmd = run.test_command.length > 40
            ? run.test_command.slice(0, 37) + '…'
            : run.test_command;

        rows += `
            <div class="lab-history-row">
                <span class="lab-history-date">${escapeHtml(date)}</span>
                <span class="lab-history-project" title="${escapeHtml(run.repo_path)}">${escapeHtml(project)}</span>
                <span class="lab-history-cmd" title="${escapeHtml(run.test_command)}">${escapeHtml(cmd)}</span>
                <span class="lab-history-repeat">×${run.repeat_count}</span>
                ${badge}
                <button class="lab-history-delete" data-id="${run.id}" title="Delete">×</button>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="lab-history-header">Past runs</div>
        <div class="lab-history-list">${rows}</div>
    `;

    container.querySelectorAll('.lab-history-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id, 10);
            await window.api.deleteLocalRun(id);
            renderHistory();
        });
    });
}
