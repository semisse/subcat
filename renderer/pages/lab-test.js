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
}

function initLabTestPage() {
    checkDockerStatus();
    const repoPath = document.getElementById('labTestRepoPath')?.value.trim();
    if (repoPath) refreshImageDetection(repoPath);
}

async function checkDockerStatus() {
    const statusEl = document.getElementById('labTestDockerStatus');
    if (!statusEl) return;
    statusEl.textContent = 'Checking Docker…';
    statusEl.className = 'lab-test-docker-status';

    const result = await window.api.checkDocker();
    const runBtn = document.getElementById('labTestRunBtn');
    if (result.available) {
        statusEl.textContent = 'Docker: available';
        statusEl.classList.add('docker-ok');
        if (runBtn) runBtn.disabled = false;
    } else {
        statusEl.textContent = 'Docker: not available — install Docker to use this feature';
        statusEl.classList.add('docker-error');
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

    if (!repoPath || !testCmd) return;

    outputLines = [];
    setPageState('running');
    const progressEl = document.getElementById('labTestProgress');
    if (progressEl) progressEl.textContent = `Running… 0 / ${repeat}`;

    const outputEl = document.getElementById('labTestOutput');
    if (outputEl) outputEl.textContent = '';

    const { id } = await window.api.startLocalRun({ repoPath, testCommand: testCmd, repeat, cpus, memoryGb });
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

    const repeat = parseInt(document.getElementById('labTestRepeat')?.value, 10) || 10;
    const total = results.passed + results.failed + results.flaky;

    // Flakiness badge — adapt flakinessSummary logic for local runs
    let flakinessLabel;
    if (results.failed === 0 && results.flaky === 0) {
        flakinessLabel = 'Stable';
    } else if (results.failed < total / 2) {
        flakinessLabel = 'Probably flaky';
    } else {
        flakinessLabel = 'Flaky';
    }
    const badgeClass = flakinessLabel === 'Stable' ? 'badge-stable'
        : flakinessLabel === 'Probably flaky' ? 'badge-probably-flaky'
        : 'badge-flaky';

    let html = `
        <div class="lab-result-badge ${badgeClass}">${escapeHtml(flakinessLabel)}</div>
        <div class="lab-result-counts">
            <span class="count-pass">${results.passed} passed</span>
            <span class="count-fail">${results.failed} failed</span>
            <span class="count-flaky">${results.flaky} flaky</span>
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

function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
