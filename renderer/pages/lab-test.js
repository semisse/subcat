// lab-test.js — Local Stress Test page
// Depends on: utils.js (escapeHtml, flakinessSummary)

let activeRunId = null;
let outputLines = [];

function initLabTest() {
    window.api.onLocalRunOutput(({ id, line }) => {
        if (id !== activeRunId) return;
        appendOutputLine(line);
    });

    window.api.onLocalRunProgress(({ id, completed, total }) => {
        if (id !== activeRunId) return;
        const el = document.getElementById('labTestProgress');
        if (el) el.textContent = `Running… ${completed} / ${total}`;
    });

    window.api.onLocalRunDone(({ id, results }) => {
        if (id !== activeRunId) return;
        activeRunId = null;
        renderDoneState(results);
        renderHistory();
    });

    const repoInput = document.getElementById('labTestRepoPath');
    if (repoInput) {
        repoInput.addEventListener('input', debounce(() => {
            const val = repoInput.value.trim();
            if (val) refreshImageDetection(val);
        }, 400));
    }

    document.getElementById('labTestBrowse')?.addEventListener('click', async () => {
        const folder = await window.api.browseFolder();
        if (folder) {
            document.getElementById('labTestRepoPath').value = folder;
            refreshImageDetection(folder);
        }
    });

    document.getElementById('labTestRunBtn')?.addEventListener('click', handleRun);
    document.getElementById('labTestStopBtn')?.addEventListener('click', handleStop);
    document.getElementById('labTestRunAgainBtn')?.addEventListener('click', handleRunAgain);
    document.getElementById('labTestCompleteStress')?.addEventListener('click', handleCompleteStress);
}

function handleCompleteStress(e) {
    e.stopPropagation(); // don't toggle the <details>

    // Ensure the section is open
    const details = document.getElementById('labTestStressDetails');
    if (details) details.open = true;

    // Activate all checkboxes
    const randomize = document.getElementById('labTestRandomize');
    const ulimit    = document.getElementById('labTestUlimitEnabled');
    const netLatency = document.getElementById('labTestNetworkLatencyEnabled');
    if (randomize)   randomize.checked = true;
    if (ulimit)      ulimit.checked    = true;
    if (netLatency)  netLatency.checked = true;

    // Set maximum stress values for numeric fields
    const ulimitVal  = document.getElementById('labTestUlimitValue');
    const latencyMs  = document.getElementById('labTestNetworkLatencyMs');
    const maxWorkers = document.getElementById('labTestMaxWorkers');
    if (ulimitVal)  ulimitVal.value  = '512';
    if (latencyMs)  latencyMs.value  = '100';
    if (maxWorkers) maxWorkers.value = '1';

    // Timezone: pick a different timezone to force non-determinism
    const timezone = document.getElementById('labTestTimezone');
    if (timezone && !timezone.value) timezone.value = 'America/New_York';
}

function initLabTestPage() {
    checkDockerStatus();
    const repoPath = document.getElementById('labTestRepoPath')?.value.trim();
    if (repoPath) refreshImageDetection(repoPath);
    renderHistory();
}

async function checkDockerStatus() {
    const chip = document.getElementById('labTestDockerChip');
    const setChip = (state, label) => {
        if (!chip) return;
        chip.className = `lab-docker-chip lab-docker-chip--${state}`;
        const labelEl = chip.querySelector('.lab-docker-chip-label');
        if (labelEl) labelEl.textContent = label;
    };

    setChip('checking', 'Checking…');

    const result = await window.api.checkDocker();
    const runBtn = document.getElementById('labTestRunBtn');
    if (result.available) {
        setChip('ok', 'Docker ready');
        if (runBtn) runBtn.disabled = false;
    } else {
        setChip('error', 'Docker not found');
        if (runBtn) runBtn.disabled = true;
    }
}

async function refreshImageDetection(repoPath) {
    const imageEl = document.getElementById('labTestImage');
    if (!imageEl) return;
    imageEl.textContent = 'Detecting…';
    const { image } = await window.api.detectLabImage(repoPath);
    imageEl.textContent = `Image: ${image}`;
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

    if (!repoPath || !testCmd) return;

    outputLines = [];
    setPageState('running');
    const progressEl = document.getElementById('labTestProgress');
    if (progressEl) progressEl.textContent = `Running… 0 / ${repeat}`;

    const outputEl = document.getElementById('labTestOutput');
    if (outputEl) outputEl.textContent = '';

    const { id } = await window.api.startLocalRun({ repoPath, testCommand: testCmd, repeat, cpus, memoryGb, randomize, timezone, maxWorkers, ulimitNofile, networkLatency });
    activeRunId = id;
}

async function handleStop() {
    if (activeRunId != null) {
        await window.api.stopLocalRun(activeRunId);
        activeRunId = null;
    }
    setPageState('idle');
}

function handleRunAgain() {
    setPageState('idle');
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

    if (results.error) {
        document.getElementById('labTestResultSummary').innerHTML =
            `<span class="lab-result-error">Error: ${escapeHtml(results.error)}</span>`;
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
            if (f === 0) { label = 'Stable'; cls = 'stable'; }
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

function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
