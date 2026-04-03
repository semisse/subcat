const addBtn = document.getElementById('addBtn');
const urlForm = document.getElementById('urlForm');
const urlInput = document.getElementById('urlInput');
const repeatInput = document.getElementById('repeatInput');
const watchBtn = document.getElementById('watchBtn');
const cancelBtn = document.getElementById('cancelBtn');
const runsList = document.getElementById('runsList');
const emptyState = document.getElementById('emptyState');
const loadingState = document.getElementById('loadingState');
const errorContainer = document.getElementById('errorContainer');

const logoutBtn = document.getElementById('logoutBtn');
const authAvatar = document.getElementById('authAvatar');
const authUsername = document.getElementById('authUsername');
const appVersion = document.getElementById('appVersion');

const watchedRuns = new Map();

async function initUser() {
    const [status, version] = await Promise.all([
        window.api.authGetStatus(),
        window.api.getVersion()
    ]);
    appVersion.textContent = `v${version}`;
    if (status.loggedIn) {
        authUsername.textContent = status.login;
        if (status.avatarUrl) {
            authAvatar.src = status.avatarUrl;
            authAvatar.style.display = 'block';
        }
    }
}

appVersion.addEventListener('click', () => window.api.showAbout());

const refreshBtn = document.getElementById('refreshBtn');
refreshBtn.addEventListener('click', async () => {
    refreshBtn.classList.add('spinning');
    refreshBtn.addEventListener('animationend', () => refreshBtn.classList.remove('spinning'), { once: true });

    // clear before refresh so run-restored events populate the fresh list
    runsList.innerHTML = '';
    watchedRuns.clear();
    runsList.style.display = 'none';
    emptyState.style.display = 'none';
    loadingState.classList.add('visible');

    await Promise.all([
        window.api.refreshRuns(),
        new Promise(r => setTimeout(r, 1000)),
    ]);

    // extra tick for run-restored events to be processed
    await new Promise(r => setTimeout(r, 150));

    loadingState.classList.add('hiding');
    loadingState.addEventListener('animationend', () => {
        loadingState.classList.remove('visible', 'hiding');
        runsList.style.display = '';
        if (watchedRuns.size === 0) emptyState.style.display = 'flex';
    }, { once: true });
});

logoutBtn.addEventListener('click', async () => {
    await window.api.authLogout();
});

initUser();

addBtn.addEventListener('click', () => {
    urlForm.style.display = 'block';
    addBtn.style.display = 'none';
    urlInput.focus();
});

cancelBtn.addEventListener('click', () => resetForm());

const prPicker = document.getElementById('prPicker');
let selectedRunUrl = null;

function resetForm() {
    urlInput.value = '';
    repeatInput.value = '1';
    repeatInput.disabled = false;
    urlForm.style.display = 'none';
    addBtn.style.display = 'block';
    prPicker.innerHTML = '';
    prPicker.style.display = 'none';
    selectedRunUrl = null;
    watchBtn.textContent = 'Watch';
    watchBtn.disabled = false;
    errorContainer.innerHTML = '';
}

function isPRUrl(url) {
    return /github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(url);
}

watchBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) return;

    errorContainer.innerHTML = '';

    if (isPRUrl(url) && !selectedRunUrl) {
        watchBtn.disabled = true;
        watchBtn.textContent = 'Loading…';
        prPicker.innerHTML = '';
        prPicker.style.display = 'none';

        const result = await window.api.fetchPRRuns(url);

        watchBtn.disabled = false;
        watchBtn.textContent = 'Watch';

        if (result.error) {
            errorContainer.innerHTML = `<div class="error-msg">${escapeHtml(result.error)}</div>`;
            return;
        }

        if (!result.runs.length) {
            errorContainer.innerHTML = `<div class="error-msg">No workflow runs found for this PR.</div>`;
            return;
        }

        prPicker.style.display = 'block';
        const label = document.createElement('div');
        label.className = 'pr-picker-label';
        label.textContent = 'Pick a workflow to watch:';
        prPicker.appendChild(label);
        for (const run of result.runs) {
            const item = document.createElement('div');
            item.className = 'pr-picker-item';
            item.dataset.url = run.url;
            const dotClass = run.status === 'completed' ? run.conclusion : run.status;
            item.innerHTML = `
                <span class="status-dot ${escapeHtml(dotClass ?? '')}"></span>
                <span class="pr-picker-name">${escapeHtml(run.name)}</span>
                <span class="pr-picker-status">${escapeHtml(run.status === 'completed' ? (run.conclusion ?? '') : run.status)}</span>
            `;
            item.addEventListener('click', () => {
                prPicker.querySelectorAll('.pr-picker-item').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
                selectedRunUrl = run.url;
                watchBtn.disabled = false;
                watchBtn.textContent = 'Watch Selected';
                // completed runs can only be added as-is (no repeat)
                repeatInput.disabled = run.status === 'completed';
                if (run.status === 'completed') repeatInput.value = '1';
            });
            prPicker.appendChild(item);
        }

        watchBtn.disabled = true;
        watchBtn.textContent = 'Watch Selected';
        return;
    }

    const runUrl = selectedRunUrl || url;
    watchBtn.disabled = true;
    watchBtn.textContent = 'Connecting…';

    const repeatTotal = parseInt(repeatInput.value, 10) || 1;
    const result = await window.api.startWatching({ url: runUrl, repeatTotal });

    watchBtn.disabled = false;
    watchBtn.textContent = selectedRunUrl ? 'Watch Selected' : 'Watch';

    if (result.error) {
        errorContainer.innerHTML = `<div class="error-msg">${escapeHtml(result.error)}</div>`;
        return;
    }

    if (result.started) {
        if (result.status === 'completed') {
            addRunCard(result.runId, result.name, 'completed', result.conclusion, result.url, 1, 1, [result.conclusion]);
            applyCompletedState(result.runId, { repeatTotal: 1, failed: result.failed, failedTests: result.failedTests });
        } else {
            addRunCard(result.runId, result.name, result.status, null, result.url, result.repeatTotal);
        }
        resetForm();
    }
});

urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') watchBtn.click();
});

urlInput.addEventListener('input', () => {
    if (selectedRunUrl) {
        selectedRunUrl = null;
        prPicker.innerHTML = '';
        prPicker.style.display = 'none';
        watchBtn.textContent = 'Watch';
        watchBtn.disabled = false;
        repeatInput.disabled = false;
    }
});

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function addRunCard(runId, name, status, conclusion, url, repeatTotal = 1, repeatCurrent = 1, results = []) {
    emptyState.style.display = 'none';

    const passed = results.filter(r => r === 'success').length;
    const failed = results.filter(r => r !== 'success').length;
    const resultsStr = repeatTotal > 1 && results.length > 0 ? ` · ✅ ${passed} ❌ ${failed}` : '';
    const repeatLabel = repeatTotal > 1 ? `Run ${repeatCurrent}/${repeatTotal}${resultsStr}` : '';

    const card = document.createElement('div');
    card.className = `run-card ${getCardClass(status, conclusion)}`;
    card.id = `run-${runId}`;
    card.dataset.active = status !== 'completed' ? 'true' : 'false';
    card.innerHTML = `
        <div class="run-card-header">
            <div class="run-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
            <div class="run-actions">
                <button class="open-btn">Open</button>
                ${status !== 'completed' ? '<button class="cancel-run-btn">Stop</button>' : ''}
                <button class="remove-btn" title="Remove">×</button>
            </div>
        </div>
        <div class="run-status">
            <span class="status-dot ${status === 'completed' ? conclusion : status}"></span>
            <span class="status-text">${formatStatus(status, conclusion)}</span>
            ${repeatTotal > 1 ? `<span class="run-repeat">${escapeHtml(repeatLabel)}</span>` : ''}
        </div>
    `;

    card.querySelector('.open-btn').addEventListener('click', () => window.api.openExternal(url));
    card.querySelector('.cancel-run-btn')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Stopping…';
        await window.api.cancelRun(runId);
        card.remove();
        watchedRuns.delete(runId);
        if (watchedRuns.size === 0) emptyState.style.display = 'flex';
    });
    card.querySelector('.remove-btn').addEventListener('click', async () => {
        if (card.dataset.active === 'true') {
            const confirmed = await window.api.confirm(
                'Stop and remove run?',
                'This run is still active. It will be stopped but not cancelled on GitHub.'
            );
            if (!confirmed) return;
        }
        await window.api.stopWatching(runId);
        card.remove();
        watchedRuns.delete(runId);
        if (watchedRuns.size === 0) emptyState.style.display = 'flex';
    });

    runsList.prepend(card);
    watchedRuns.set(runId, { name, status, conclusion, url, repeatTotal });
}

function getCardClass(status, conclusion) {
    if (status === 'completed') {
        return conclusion === 'success' ? 'completed-success' : 'completed-failure';
    }
    return 'in-progress';
}

function formatStatus(status, conclusion) {
    if (status === 'completed') return conclusion;
    return status.replace(/_/g, ' ');
}

function updateRunCard(runId, status, conclusion, name, repeatCurrent, repeatTotal, results = []) {
    const card = document.getElementById(`run-${runId}`);
    if (!card) return;

    card.className = `run-card ${getCardClass(status, conclusion)}`;
    card.querySelector('.status-dot').className = `status-dot ${status === 'completed' ? conclusion : status}`;
    card.querySelector('.status-text').textContent = formatStatus(status, conclusion);

    if (status === 'completed') {
        card.dataset.active = 'false';
        card.querySelector('.cancel-run-btn')?.remove();
        if (!card.querySelector('.rerun-btn')) {
            const rerunBtn = document.createElement('button');
            rerunBtn.className = 'rerun-btn';
            rerunBtn.textContent = '↩ Rerun';
            rerunBtn.addEventListener('click', async () => {
                rerunBtn.disabled = true;
                rerunBtn.textContent = 'Starting…';
                const result = await window.api.rerunRun(runId);
                if (result.error) {
                    rerunBtn.disabled = false;
                    rerunBtn.textContent = '↩ Rerun';
                } else {
                    rerunBtn.remove();
                    card.dataset.active = 'true';
                }
            });
            card.querySelector('.run-actions').prepend(rerunBtn);
        }
    }

    if (name) card.querySelector('.run-name').textContent = name;

    if (repeatTotal > 1) {
        let repeatEl = card.querySelector('.run-repeat');
        if (!repeatEl) {
            repeatEl = document.createElement('span');
            repeatEl.className = 'run-repeat';
            card.querySelector('.run-status').appendChild(repeatEl);
        }
        const passed = results.filter(r => r === 'success').length;
        const failed = results.filter(r => r !== 'success').length;
        const resultsStr = results.length > 0 ? ` · ✅ ${passed} ❌ ${failed}` : '';
        repeatEl.textContent = `Run ${repeatCurrent}/${repeatTotal}${resultsStr}`;
    }
}


window.api.onRunUpdate((data) => {
    updateRunCard(data.runId, data.status, data.conclusion, data.name, data.repeatCurrent, data.repeatTotal, data.results);
    watchedRuns.set(data.runId, data);
});

window.api.onRunError((data) => {
    const card = document.getElementById(`run-${data.runId}`);
    if (card) {
        card.querySelector('.status-text').textContent = `Error: ${data.error}`;
    }
});

window.api.onRunRestored((data) => {
    if (data.status === 'completed') {
        const conclusion = data.failed === 0 ? 'success' : 'failure';
        addRunCard(data.runId, data.name, 'completed', conclusion, data.url, data.repeatTotal, data.repeatCurrent, data.results);
        const card = document.getElementById(`run-${data.runId}`);
        card?.querySelector('.cancel-run-btn')?.remove();
        if (card && data.repeatTotal > 1) {
            const reportBtn = document.createElement('button');
            reportBtn.className = 'report-btn';
            reportBtn.textContent = 'Report';
            reportBtn.addEventListener('click', () => window.api.saveReport(data.runId));
            card.querySelector('.run-actions').prepend(reportBtn);
        }
    } else {
        addRunCard(data.runId, data.name, 'in_progress', null, data.url, data.repeatTotal, data.repeatCurrent, data.results);
    }
});

function applyCompletedState(runId, { failed, failedTests }) {
    const card = document.getElementById(`run-${runId}`);
    if (!card) return;
    const actions = card.querySelector('.run-actions');
    const openBtn = actions.querySelector('.open-btn');

    // 3. Report — insert before Open
    const reportBtn = document.createElement('button');
    reportBtn.className = 'report-btn';
    reportBtn.textContent = 'Report';
    reportBtn.addEventListener('click', () => window.api.saveReport(runId));
    actions.insertBefore(reportBtn, openBtn);

    // 2. Rerun All — insert before Report (add only if not already there from updateRunCard)
    if (!actions.querySelector('.rerun-btn')) {
        const rerunBtn = document.createElement('button');
        rerunBtn.className = 'rerun-btn';
        rerunBtn.textContent = '↩ Rerun';
        rerunBtn.addEventListener('click', async () => {
            rerunBtn.disabled = true;
            rerunBtn.textContent = 'Starting…';
            const result = await window.api.rerunRun(runId);
            if (result.error) {
                rerunBtn.disabled = false;
                rerunBtn.textContent = '↩ Rerun';
            } else {
                rerunBtn.remove();
                card.dataset.active = 'true';
            }
        });
        actions.insertBefore(rerunBtn, reportBtn);
    } else {
        // rerun-btn exists from updateRunCard — move it before report
        actions.insertBefore(actions.querySelector('.rerun-btn'), reportBtn);
    }

    // 1. Rerun Failed — insert before Rerun All
    if (failed > 0) {
        const rerunBtn = actions.querySelector('.rerun-btn');
        const rerunFailedBtn = document.createElement('button');
        rerunFailedBtn.className = 'rerun-failed-btn';
        rerunFailedBtn.textContent = '↩ Rerun Failed';
        rerunFailedBtn.addEventListener('click', async () => {
            rerunFailedBtn.disabled = true;
            rerunFailedBtn.textContent = 'Starting…';

            // optimistic UI update
            card.className = 'run-card in-progress';
            card.querySelector('.status-dot').className = 'status-dot queued';
            card.querySelector('.status-text').textContent = 'queued';
            card.querySelector('.failed-tests')?.remove();
            card.dataset.active = 'true';

            const result = await window.api.rerunFailedRun(runId);
            if (result.error) {
                card.className = 'run-card completed-failure';
                card.querySelector('.status-dot').className = 'status-dot failure';
                card.querySelector('.status-text').textContent = 'failure';
                card.dataset.active = 'false';
                rerunFailedBtn.disabled = false;
                rerunFailedBtn.textContent = '↩ Rerun Failed';
            } else {
                rerunFailedBtn.remove();
            }
        });
        actions.insertBefore(rerunFailedBtn, rerunBtn);

        if (failedTests?.length > 0) {
            const list = document.createElement('ul');
            list.className = 'failed-tests';
            for (const t of failedTests) {
                const li = document.createElement('li');
                li.textContent = t;
                list.appendChild(li);
            }
            card.appendChild(list);
        }
    }
}

window.api.onRunReportReady((data) => {
    applyCompletedState(data.runId, data);
});
