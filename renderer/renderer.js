const myPrsSection = document.getElementById('myPrsSection');
const myPrsList = document.getElementById('myPrsList');
const myPrsNav = document.getElementById('myPrsNav');
const prDetailNav = document.getElementById('prDetailNav');
const prDetailBack = document.getElementById('prDetailBack');
const prDetailTitle = document.getElementById('prDetailTitle');
const prDetailList = document.getElementById('prDetailList');

const addBtn = document.getElementById('addBtn');
const urlForm = document.getElementById('urlForm');
const urlInput = document.getElementById('urlInput');
const repeatInput = document.getElementById('repeatInput');
const watchBtn = document.getElementById('watchBtn');
const cancelBtn = document.getElementById('cancelBtn');
const runsList = document.getElementById('runsList');
const sectionPinned = document.getElementById('sectionPinned');
const sectionMyPrs = document.getElementById('sectionMyPrs');
const sectionWatching = document.getElementById('sectionWatching');
const sectionPinnedItems = document.getElementById('sectionPinnedItems');
const sectionMyPrsItems = document.getElementById('sectionMyPrsItems');
const sectionWatchingItems = document.getElementById('sectionWatchingItems');
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
    sectionPinnedItems.innerHTML = '';
    sectionMyPrsItems.innerHTML = '';
    sectionWatchingItems.innerHTML = '';
    updateSectionVisibility();

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
        updateSectionVisibility();
    }, { once: true });
});

logoutBtn.addEventListener('click', async () => {
    await window.api.authLogout();
});

initUser();
loadUserPRs();

async function loadUserPRs() {
    const result = await window.api.fetchUserPRs();
    if (result.error || !result.prs?.length) return;

    myPrsSection.style.display = 'block';
    myPrsList.innerHTML = '';

    if (result.prs.length > 4) myPrsList.classList.add('scrollable');

    for (const pr of result.prs) {
        const item = document.createElement('div');
        item.className = 'my-pr-item';
        item.innerHTML = `
            <span class="my-pr-title">${escapeHtml(pr.title)}</span>
            <span class="my-pr-number">#${pr.number}</span>
        `;
        item.addEventListener('click', () => openPRDetail(pr));
        myPrsList.appendChild(item);
    }
}

function updateSectionVisibility() {
    sectionPinned.style.display = sectionPinnedItems.children.length > 0 ? '' : 'none';
    sectionMyPrs.style.display = sectionMyPrsItems.children.length > 0 ? '' : 'none';
    sectionWatching.style.display = sectionWatchingItems.children.length > 0 ? '' : 'none';
}

function getSectionItems(source) {
    if (source === 'pinned') return sectionPinnedItems;
    if (source === 'pr') return sectionMyPrsItems;
    return sectionWatchingItems;
}

function showMainView() {
    myPrsList.style.display = '';
    prDetailList.style.display = 'none';
    prDetailNav.style.display = 'none';
    myPrsNav.style.display = 'flex';
    prDetailList.innerHTML = '';
    prDetailTitle.textContent = '';
    runsList.style.display = '';
    emptyState.style.display = watchedRuns.size === 0 ? 'flex' : 'none';
    document.querySelector('.input-section').style.display = '';
}

function showPRDetailView() {
    myPrsList.style.display = 'none';
    prDetailList.style.display = 'block';
    myPrsNav.style.display = 'none';
    prDetailNav.style.display = 'flex';
    runsList.style.display = 'none';
    emptyState.style.display = 'none';
    document.querySelector('.input-section').style.display = 'none';
}

async function openPRDetail(pr) {
    showPRDetailView();
    prDetailTitle.textContent = `${pr.title} #${pr.number}`;
    prDetailList.innerHTML = '<div class="pr-detail-loading">Loading workflows…</div>';

    const result = await window.api.fetchPRRuns(`https://github.com/${pr.owner}/${pr.repo}/pull/${pr.number}`);
    prDetailList.innerHTML = '';

    if (result.error || !result.runs?.length) {
        prDetailList.innerHTML = '<div class="pr-detail-empty">No workflows found.</div>';
        return;
    }

    for (const run of result.runs) {
        const dotClass = run.status === 'completed' ? (run.conclusion ?? '') : run.status;
        const statusText = run.status === 'completed' ? (run.conclusion ?? 'completed') : run.status;
        const item = document.createElement('div');
        item.className = 'pr-detail-run';
        item.innerHTML = `
            <span class="status-dot ${escapeHtml(dotClass)}"></span>
            <span class="pr-detail-run-name">${escapeHtml(run.name)}</span>
            <span class="pr-detail-run-status">${escapeHtml(statusText)}</span>
            <div class="pr-detail-run-actions">
                <button class="watch-run-btn">Watch</button>
                <button class="open-run-btn">↗</button>
            </div>
        `;
        const watchBtn = item.querySelector('.watch-run-btn');
        watchBtn.addEventListener('click', async () => {
            watchBtn.disabled = true;
            watchBtn.textContent = '…';
            const r = await window.api.startWatching({ url: run.url, repeatTotal: 1, source: 'pr' });
            console.log('[watch]', run.url, r);
            if (r.error) {
                watchBtn.textContent = r.error === 'This run is already in the list.' ? 'Already added' : 'Error';
                setTimeout(() => {
                    watchBtn.disabled = false;
                    watchBtn.textContent = 'Watch';
                }, 2000);
            } else if (r.started) {
                watchBtn.textContent = 'Added';
                showMainView();
                if (r.status === 'completed') {
                    addRunCard(r.runId, r.name, 'completed', r.conclusion, r.url, 1, 1, [r.conclusion], 'pr');
                    applyCompletedState(r.runId, { repeatTotal: 1, failed: r.failed, failedTests: r.failedTests });
                } else {
                    addRunCard(r.runId, r.name, r.status, null, r.url, r.repeatTotal, 1, [], 'pr');
                }
            }
        });
        item.querySelector('.open-run-btn').addEventListener('click', () => window.api.openExternal(run.url));
        prDetailList.appendChild(item);
    }
}

prDetailBack.addEventListener('click', showMainView);

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
        const source = result.source ?? 'manual';
        if (result.status === 'completed') {
            addRunCard(result.runId, result.name, 'completed', result.conclusion, result.url, 1, 1, [result.conclusion], source);
            applyCompletedState(result.runId, { repeatTotal: 1, failed: result.failed, failedTests: result.failedTests });
        } else {
            addRunCard(result.runId, result.name, result.status, null, result.url, result.repeatTotal, 1, [], source);
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

function addRunCard(runId, name, status, conclusion, url, repeatTotal = 1, repeatCurrent = 1, results = [], source = 'manual') {
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
        updateSectionVisibility();
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
        updateSectionVisibility();
    });

    getSectionItems(source).prepend(card);
    updateSectionVisibility();
    watchedRuns.set(runId, { name, status, conclusion, url, repeatTotal, source });
}

function getCardClass(status, conclusion) {
    if (status === 'completed') {
        return conclusion === 'success' ? 'completed-success' : 'completed-failure';
    }
    return 'in-progress';
}

const STATUS_LABELS = {
    queued: 'Queued',
    in_progress: 'Running',
    waiting: 'Waiting',
    pending: 'Pending',
    requested: 'Requested',
    success: 'Passed',
    failure: 'Failed',
    cancelled: 'Cancelled',
    timed_out: 'Timed out',
    action_required: 'Action required',
    neutral: 'Neutral',
    skipped: 'Skipped',
    stale: 'Stale',
    startup_failure: 'Startup failed',
};

function formatStatus(status, conclusion) {
    const key = status === 'completed' ? conclusion : status;
    return STATUS_LABELS[key] ?? (key ?? '').replace(/_/g, ' ');
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
    const source = data.source ?? 'manual';
    if (data.status === 'completed') {
        const conclusion = data.failed === 0 ? 'success' : 'failure';
        addRunCard(data.runId, data.name, 'completed', conclusion, data.url, data.repeatTotal, data.repeatCurrent, data.results, source);
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
        addRunCard(data.runId, data.name, 'in_progress', null, data.url, data.repeatTotal, data.repeatCurrent, data.results, source);
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
