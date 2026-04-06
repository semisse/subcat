const myPrsSection = document.getElementById('myPrsSection');
const myPrsList = document.getElementById('myPrsList');
const myPrsNav = document.getElementById('myPrsNav');
const prDetailNav = document.getElementById('prDetailNav');
const prDetailBack = document.getElementById('prDetailBack');
const prDetailTitle = document.getElementById('prDetailTitle');
const prDetailList = document.getElementById('prDetailList');
const workflowRunsNav = document.getElementById('workflowRunsNav');
const workflowRunsBack = document.getElementById('workflowRunsBack');
const workflowRunsTitle = document.getElementById('workflowRunsTitle');
const workflowRunsList = document.getElementById('workflowRunsList');
const workflowRunsReportBtn = document.getElementById('workflowRunsReportBtn');
const workflowRunsRerunBtn = document.getElementById('workflowRunsRerunBtn');
const workflowRunsCancelAllBtn = document.getElementById('workflowRunsCancelAllBtn');
const workflowRunsPinBtn = document.getElementById('workflowRunsPinBtn');
const workflowRepeatInput = document.getElementById('workflowRepeatInput');

const pendingRepeatTotals = new Map(); // runId → repeatTotal

const addBtn = document.getElementById('addBtn');
const urlForm = document.getElementById('urlForm');
const urlInput = document.getElementById('urlInput');
const repeatInput = document.getElementById('repeatInput');
const watchBtn = document.getElementById('watchBtn');
const cancelBtn = document.getElementById('cancelBtn');
const runsList = document.getElementById('runsList');
const sectionMyPrs = document.getElementById('sectionMyPrs');
const sectionRuns = document.getElementById('sectionRuns');
const sectionWorkflows = document.getElementById('sectionWorkflows');
const sectionMyPrsItems = document.getElementById('sectionMyPrsItems');
const sectionRunsItems = document.getElementById('sectionRunsItems');
const sectionWorkflowsItems = document.getElementById('sectionWorkflowsItems');
const sectionPinned = document.getElementById('sectionPinned');
const sectionPinnedItems = document.getElementById('sectionPinnedItems');
const emptyState = document.getElementById('emptyState');
const loadingState = document.getElementById('loadingState');
const loadingText = document.getElementById('loadingText');
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

    if (currentView === 'workflow-runs' && currentWorkflow && currentPRContext) {
        await openWorkflowRuns(currentWorkflow, currentPRContext, workflowRunsBackTarget);
        return;
    }

    if (currentView === 'pr-detail' && currentPR) {
        await openPRDetail(currentPR);
        return;
    }

    // main view refresh
    watchedRuns.clear();
    runsList.style.display = 'none';
    emptyState.style.display = 'none';
    loadingText.textContent = 'Refreshing…';
    loadingState.classList.add('visible');
    sectionPinnedItems.innerHTML = '';
    sectionMyPrsItems.innerHTML = '';
    sectionRunsItems.innerHTML = '';
    sectionWorkflowsItems.innerHTML = '';
    updateSectionVisibility();
    myPrsList.innerHTML = '';
    loadUserPRs();

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
        if (!hasAnyItems()) emptyState.style.display = 'flex';
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
            <div class="pr-item-info">
                <div class="my-pr-meta">${escapeHtml(pr.owner)}/${escapeHtml(pr.repo)} · #${pr.number}</div>
                <div class="my-pr-title">${escapeHtml(pr.title)}</div>
            </div>
            <div class="pr-ci-badge">
                <span class="pr-loading-spinner"></span>
            </div>
        `;
        item.addEventListener('click', () => openPRDetail(pr));
        myPrsList.appendChild(item);

        window.api.fetchPRRuns(`https://github.com/${pr.owner}/${pr.repo}/pull/${pr.number}`)
            .then(r => {
                const badge = item.querySelector('.pr-ci-badge');
                if (!badge) return;
                const status = r.error || !r.runs?.length ? '' : aggregatePRStatus(r.runs);
                badge.innerHTML = `<span class="status-dot ${status}"></span>`;
            })
            .catch(() => {
                const badge = item.querySelector('.pr-ci-badge');
                if (badge) badge.innerHTML = '<span class="status-dot"></span>';
            });

        window.api.fetchPRReviews({ owner: pr.owner, repo: pr.repo, prNumber: pr.number })
            .then(r => {
                if (r.error || r.reviewCount === 0) return;
                const meta = item.querySelector('.my-pr-meta');
                if (!meta) return;
                const label = r.approved ? '✓ approved' : r.changesRequested ? '✗ changes' : `${r.reviewCount} review${r.reviewCount > 1 ? 's' : ''}`;
                const cls = r.approved ? 'pr-review-approved' : r.changesRequested ? 'pr-review-changes' : 'pr-review-pending';
                meta.innerHTML += ` · <span class="${cls}">${escapeHtml(label)}</span>`;
            })
            .catch(() => {});
    }
}

function aggregatePRStatus(runs) {
    if (runs.some(r => r.status !== 'completed')) return 'in_progress';
    if (runs.some(r => ['failure', 'timed_out', 'startup_failure'].includes(r.conclusion))) return 'failure';
    return 'success';
}

function updateSectionVisibility() {
    sectionPinned.style.display = sectionPinnedItems.children.length > 0 ? '' : 'none';
    sectionMyPrs.style.display = sectionMyPrsItems.children.length > 0 ? '' : 'none';
    sectionRuns.style.display = sectionRunsItems.children.length > 0 ? '' : 'none';
    sectionWorkflows.style.display = sectionWorkflowsItems.children.length > 0 ? '' : 'none';
}

function hasAnyItems() {
    return watchedRuns.size > 0 || sectionPinnedItems.children.length > 0;
}

function getSectionItems(source) {
    if (source === 'pr') return sectionMyPrsItems;
    if (source === 'workflow') return sectionWorkflowsItems;
    return sectionRunsItems;
}

function showMainView() {
    clearLevel3Poll();
    currentView = 'main';
    myPrsList.style.display = '';
    prDetailList.style.display = 'none';
    workflowRunsList.style.display = 'none';
    prDetailNav.style.display = 'none';
    workflowRunsNav.style.display = 'none';
    myPrsNav.style.display = 'flex';
    prDetailList.innerHTML = '';
    prDetailTitle.textContent = '';
    runsList.style.display = '';
    emptyState.style.display = !hasAnyItems() ? 'flex' : 'none';
    document.querySelector('.input-section').style.display = '';
}

function showPRDetailView() {
    clearLevel3Poll();
    currentView = 'pr-detail';
    myPrsList.style.display = 'none';
    prDetailList.style.display = 'block';
    workflowRunsList.style.display = 'none';
    myPrsNav.style.display = 'none';
    prDetailNav.style.display = 'flex';
    workflowRunsNav.style.display = 'none';
    runsList.style.display = 'none';
    emptyState.style.display = 'none';
    document.querySelector('.input-section').style.display = 'none';
}

function showWorkflowRunsView() {
    currentView = 'workflow-runs';
    myPrsList.style.display = 'none';
    prDetailList.style.display = 'none';
    workflowRunsList.style.display = 'block';
    myPrsNav.style.display = 'none';
    prDetailNav.style.display = 'none';
    workflowRunsNav.style.display = 'flex';
    runsList.style.display = 'none';
    emptyState.style.display = 'none';
    document.querySelector('.input-section').style.display = 'none';
}

let currentView = 'main';
let currentPR = null;
let currentPRContext = null;
let currentWorkflow = null;
let currentWorkflowRuns = null;
let workflowRunsBackTarget = 'pr-detail'; // 'pr-detail' | 'main'
let level3PollInterval = null;
let inMemoryPendingRerun = null; // { owner, repo, runId, fromAttempt, total }
const failedOnlyAttempts = new Map(); // runId → Set<attemptNumber>

function markFailedOnlyAttempt(runId, attemptNum) {
    if (!failedOnlyAttempts.has(runId)) failedOnlyAttempts.set(runId, new Set());
    failedOnlyAttempts.get(runId).add(attemptNum);
}

function isFailedOnlyAttempt(runId, attemptNum) {
    return failedOnlyAttempts.get(runId)?.has(attemptNum) ?? false;
}

function clearLevel3Poll() {
    if (level3PollInterval) {
        clearInterval(level3PollInterval);
        level3PollInterval = null;
    }
}

async function openPRDetail(pr) {
    currentPR = pr;
    showPRDetailView();
    prDetailTitle.textContent = `${pr.title} #${pr.number}`;
    prDetailList.style.display = 'none';
    prDetailList.innerHTML = '';
    loadingText.textContent = 'Loading…';
    loadingState.classList.add('visible');

    const result = await window.api.fetchPRRuns(`https://github.com/${pr.owner}/${pr.repo}/pull/${pr.number}`);
    loadingState.classList.remove('visible');
    prDetailList.style.display = 'block';

    if (result.error || !result.runs?.length) {
        prDetailList.innerHTML = '<div class="pr-detail-empty">No workflows found.</div>';
        return;
    }

    currentPRContext = { owner: result.owner, repo: result.repo, headRef: result.headRef };

    for (const run of result.runs) {
        const dotClass = run.status === 'completed' ? (run.conclusion ?? '') : run.status;
        const item = document.createElement('div');
        item.className = 'pr-detail-run drillable';
        item.dataset.runId = run.runId;
        item.innerHTML = `
            <span class="status-dot ${escapeHtml(dotClass)}"></span>
            <span class="pr-detail-run-name">${escapeHtml(run.name)}</span>
            <span class="pr-detail-run-status">${escapeHtml(formatStatus(run.status, run.conclusion))}</span>
            <span class="pr-drill-chevron">›</span>
            <div class="pr-detail-run-actions">
                <button class="open-run-btn">↗</button>
            </div>
        `;
        item.addEventListener('click', (e) => {
            if (e.target.closest('.open-run-btn')) return;
            openWorkflowRuns(run, currentPRContext);
        });
        item.querySelector('.open-run-btn').addEventListener('click', () => window.api.openExternal(run.url));
        prDetailList.appendChild(item);
    }
}

function createRunItem(run, owner, repo, { isLatestFailed = false } = {}) {
    const dotClass = run.status === 'completed' ? (run.conclusion ?? '') : run.status;
    const isActive = run.status !== 'completed';
    const failedOnly = isFailedOnlyAttempt(run.runId, run.runAttempt);
    const item = document.createElement('div');
    item.className = 'pr-detail-run';
    item.dataset.attempt = run.runAttempt;
    item.innerHTML = `
        <span class="status-dot ${escapeHtml(dotClass)}"></span>
        <span class="pr-detail-run-name">#${run.runAttempt}${failedOnly ? ' <span class="failed-only-badge">failed jobs only</span>' : ''}</span>
        <span class="pr-detail-run-status">${escapeHtml(formatStatus(run.status, run.conclusion))}</span>
        <div class="pr-detail-run-actions">
            ${isActive ? '<button class="wf-cancel-run-btn">Cancel Run</button>' : ''}
            ${isLatestFailed ? '<button class="wf-rerun-failed-btn">↩ Rerun Failed Only</button>' : ''}
            <button class="open-run-btn">↗</button>
        </div>
    `;
    item.querySelector('.open-run-btn').addEventListener('click', () => window.api.openExternal(run.url));
    if (isActive) {
        item.querySelector('.wf-cancel-run-btn').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            await window.api.cancelRunDirect({ owner, repo, runId: run.runId });
            btn.remove();
        });
    }
    if (isLatestFailed) {
        item.querySelector('.wf-rerun-failed-btn').addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = 'Starting…';
            const result = await window.api.rerunFailedJobsDirect({ owner, repo, runId: run.runId });
            if (result.error) {
                btn.disabled = false;
                btn.textContent = '↩ Rerun Failed Only';
            } else {
                markFailedOnlyAttempt(run.runId, currentWorkflowRuns.length + 1);
                btn.remove();
            }
        });
    }
    return item;
}

async function openWorkflowRuns(workflow, { owner, repo, headRef } = {}, backTarget = 'pr-detail') {
    clearLevel3Poll();

    const isRefresh = currentWorkflow?.runId === workflow.runId &&
                      currentView === 'workflow-runs' &&
                      workflowRunsList.querySelector('.pr-detail-run:not([data-placeholder])');

    currentWorkflow = workflow;
    workflowRunsBackTarget = backTarget;
    currentPRContext = { owner, repo, headRef: headRef ?? null };
    showWorkflowRunsView();
    workflowRunsTitle.textContent = workflow.name;

    if (!isRefresh) {
        workflowRunsList.innerHTML = '<div class="pr-detail-loading">Loading runs…</div>';
    }

    const result = await window.api.fetchRunAttempts({ owner, repo, runId: workflow.runId });

    if (result.error || !result.runs?.length) {
        workflowRunsList.innerHTML = '<div class="pr-detail-empty">No runs found.</div>';
        return;
    }

    currentWorkflowRuns = result.runs;
    const hasActiveRun = result.runs.some(r => r.status !== 'completed');
    workflowRunsRerunBtn.style.display = hasActiveRun ? 'none' : '';
    workflowRepeatInput.parentElement.style.display = hasActiveRun ? 'none' : '';
    workflowRunsCancelAllBtn.style.display = hasActiveRun ? '' : 'none';
    workflowRunsRerunBtn.textContent = '↩ Rerun';

    const latestFailedAttempt = !hasActiveRun
        ? result.runs
            .filter(r => r.status === 'completed' && r.conclusion === 'failure')
            .sort((a, b) => b.runAttempt - a.runAttempt)[0]?.runAttempt
        : null;

    if (isRefresh) {
        // Remove stale placeholders; will be re-injected below with the correct count
        workflowRunsList.querySelectorAll('[data-placeholder]').forEach(el => el.remove());

        // Update existing rows in place
        for (const run of result.runs) {
            const dotClass = run.status === 'completed' ? (run.conclusion ?? '') : run.status;
            const existing = workflowRunsList.querySelector(`[data-attempt="${run.runAttempt}"]`);
            if (existing) {
                existing.querySelector('.status-dot').className = `status-dot ${escapeHtml(dotClass)}`;
                existing.querySelector('.pr-detail-run-status').textContent = formatStatus(run.status, run.conclusion);
            }
        }

        // Prepend newly appeared attempts (iterate oldest→newest so prepend gives newest-first order)
        for (const run of [...result.runs].reverse()) {
            if (workflowRunsList.querySelector(`[data-attempt="${run.runAttempt}"]`)) continue;
            workflowRunsList.prepend(createRunItem(run, owner, repo));
        }

        // Remove cancel button from rows that have now completed
        for (const run of result.runs) {
            if (run.status === 'completed') {
                workflowRunsList.querySelector(`[data-attempt="${run.runAttempt}"] .wf-cancel-run-btn`)?.remove();
            }
        }

        // Sync "Rerun Failed Only" button: remove from all rows, re-add only to latest failed
        workflowRunsList.querySelectorAll('.wf-rerun-failed-btn').forEach(btn => btn.remove());
        if (latestFailedAttempt != null) {
            const targetRow = workflowRunsList.querySelector(`[data-attempt="${latestFailedAttempt}"]`);
            const targetRun = result.runs.find(r => r.runAttempt === latestFailedAttempt);
            if (targetRow && targetRun && !targetRow.querySelector('.wf-rerun-failed-btn')) {
                const btn = document.createElement('button');
                btn.className = 'wf-rerun-failed-btn';
                btn.textContent = '↩ Rerun Failed Only';
                btn.addEventListener('click', async (e) => {
                    btn.disabled = true;
                    btn.textContent = 'Starting…';
                    const result2 = await window.api.rerunFailedJobsDirect({ owner, repo, runId: targetRun.runId });
                    if (result2.error) {
                        btn.disabled = false;
                        btn.textContent = '↩ Rerun Failed Only';
                    } else {
                        markFailedOnlyAttempt(targetRun.runId, currentWorkflowRuns.length + 1);
                        btn.remove();
                    }
                });
                targetRow.querySelector('.pr-detail-run-actions').prepend(btn);
            }
        }
    } else {
        workflowRunsList.innerHTML = '';
        workflowRepeatInput.value = '1';
        for (const run of result.runs) {
            workflowRunsList.appendChild(createRunItem(run, owner, repo, { isLatestFailed: run.runAttempt === latestFailedAttempt }));
        }
    }

    // Inject placeholders for pending reruns that GitHub hasn't registered yet.
    // Use in-memory state first (reliable during auto-refresh); fall back to DB (survives manual refresh).
    let pending = (inMemoryPendingRerun?.runId === workflow.runId &&
                   inMemoryPendingRerun?.owner === owner &&
                   inMemoryPendingRerun?.repo === repo)
        ? inMemoryPendingRerun
        : await window.api.getPendingRerun({ owner, repo, runId: workflow.runId });

    if (pending) {
        const expectedTotal = pending.fromAttempt !== undefined
            ? pending.fromAttempt + pending.total          // in-memory shape
            : pending.from_attempt + pending.total;        // DB shape (snake_case)
        if (result.runs.length >= expectedTotal) {
            inMemoryPendingRerun = null;
            window.api.deletePendingRerun({ owner, repo, runId: workflow.runId });
        } else {
            const missingCount = expectedTotal - result.runs.length;
            for (let i = 1; i <= missingCount; i++) {
                const attemptNum = result.runs.length + i;
                const attemptLabel = `#${attemptNum}`;
                const isFailedOnly = isFailedOnlyAttempt(workflow.runId, attemptNum);
                const placeholder = document.createElement('div');
                placeholder.className = 'pr-detail-run placeholder';
                placeholder.dataset.placeholder = 'true';
                placeholder.innerHTML = `
                    <span class="status-dot idle"></span>
                    <span class="pr-detail-run-name">${escapeHtml(attemptLabel)}${isFailedOnly ? ' <span class="failed-only-badge">failed jobs only</span>' : ''}</span>
                    <span class="pr-detail-run-status">Queued</span>
                    <div class="pr-detail-run-actions">
                        <button class="wf-cancel-run-btn">Cancel Run</button>
                    </div>
                `;
                placeholder.querySelector('.wf-cancel-run-btn').addEventListener('click', async (e) => {
                    e.currentTarget.disabled = true;
                    workflowRunsCancelAllBtn.click();
                });
                workflowRunsList.prepend(placeholder);
            }
        }
    }

    // Auto-refresh every 15s while there's an active run OR pending reruns still expected
    const hasPendingReruns = !!pending && result.runs.length < (
        pending.fromAttempt !== undefined
            ? pending.fromAttempt + pending.total
            : pending.from_attempt + pending.total
    );
    if (hasActiveRun || hasPendingReruns) {
        level3PollInterval = setInterval(() => {
            if (currentView === 'workflow-runs' && currentWorkflow && currentPRContext) {
                openWorkflowRuns(currentWorkflow, currentPRContext, workflowRunsBackTarget);
            } else {
                clearLevel3Poll();
            }
        }, 15000);
    }

    updatePinBtnState();
}

prDetailBack.addEventListener('click', showMainView);
workflowRunsBack.addEventListener('click', () => {
    if (workflowRunsBackTarget === 'main') showMainView();
    else if (currentPR) openPRDetail(currentPR);
    else showPRDetailView();
});
workflowRunsCancelAllBtn.addEventListener('click', async () => {
    if (!currentWorkflowRuns || !currentPRContext) return;
    workflowRunsCancelAllBtn.disabled = true;
    const activeRuns = currentWorkflowRuns.filter(r => r.status !== 'completed');
    await Promise.all(activeRuns.map(r =>
        window.api.cancelRunDirect({ owner: currentPRContext.owner, repo: currentPRContext.repo, runId: r.runId })
    ));
    inMemoryPendingRerun = null;
    window.api.deletePendingRerun({ owner: currentPRContext.owner, repo: currentPRContext.repo, runId: currentWorkflowRuns[0].runId });
    workflowRunsCancelAllBtn.disabled = false;
    if (currentWorkflow && currentPRContext) {
        openWorkflowRuns(currentWorkflow, currentPRContext, workflowRunsBackTarget);
    }
});

workflowRunsReportBtn.addEventListener('click', () => {
    if (currentWorkflowRuns) {
        window.api.savePRWorkflowReport({ workflowName: workflowRunsTitle.textContent, runs: currentWorkflowRuns });
    }
});

function updatePinBtnState() {
    if (!currentWorkflowRuns?.length || !currentPRContext) return;
    const latestRunId = currentWorkflowRuns[0].runId;
    const isWatched = watchedRuns.has(latestRunId);
    workflowRunsPinBtn.textContent = isWatched ? '✓ Watching' : '⊕ Watch';
    workflowRunsPinBtn.classList.toggle('pinned', isWatched);
    workflowRunsPinBtn.disabled = isWatched;
}

workflowRunsPinBtn.addEventListener('click', async () => {
    if (!currentWorkflowRuns?.length || !currentPRContext) return;
    const latestRun = currentWorkflowRuns[0];
    const runUrl = `https://github.com/${currentPRContext.owner}/${currentPRContext.repo}/actions/runs/${latestRun.runId}`;
    workflowRunsPinBtn.disabled = true;
    workflowRunsPinBtn.textContent = 'Adding…';
    const r = await window.api.startWatching({ url: runUrl, repeatTotal: 1, source: 'manual' });
    if (r.error) {
        workflowRunsPinBtn.textContent = 'Error';
        setTimeout(() => updatePinBtnState(), 2000);
        return;
    }
    if (r.started) {
        if (r.status === 'completed') {
            addRunCard(r.runId, r.name, 'completed', r.conclusion, r.url, 1, 1, [r.conclusion], 'manual');
            applyCompletedState(r.runId, { repeatTotal: 1, failed: r.failed, failedTests: r.failedTests });
        } else {
            addRunCard(r.runId, r.name, r.status, null, r.url, 1, 1, [], 'manual');
        }
    }
    updatePinBtnState();
});

workflowRepeatInput.addEventListener('input', () => {
    if (workflowRunsRerunBtn.disabled) return;
    const n = parseInt(workflowRepeatInput.value, 10) || 1;
    workflowRunsRerunBtn.textContent = n > 1 ? `↩ Rerun ×${n}` : '↩ Rerun';
});

workflowRunsRerunBtn.addEventListener('click', async () => {
    if (!currentWorkflowRuns?.length || !currentPRContext || !currentWorkflow) return;
    const repeatTotal = parseInt(workflowRepeatInput.value, 10) || 1;
    const runId = currentWorkflowRuns[0].runId;
    workflowRunsRerunBtn.disabled = true;
    workflowRunsRerunBtn.textContent = 'Starting…';
    const r = await window.api.watchWorkflowRerun({
        owner: currentPRContext.owner,
        repo: currentPRContext.repo,
        runId,
        previousAttemptCount: currentWorkflowRuns.length,
    });
    if (r.error) {
        workflowRunsRerunBtn.textContent = 'Error';
        setTimeout(() => { workflowRunsRerunBtn.disabled = false; workflowRunsRerunBtn.textContent = '↩ Rerun'; }, 2000);
        return;
    }
    pendingRepeatTotals.set(runId, repeatTotal);
    workflowRunsRerunBtn.textContent = 'Waiting…';

    // Persist so placeholders survive a manual refresh
    const existingCount = currentWorkflowRuns.length;
    inMemoryPendingRerun = {
        owner: currentPRContext.owner,
        repo: currentPRContext.repo,
        runId,
        fromAttempt: existingCount,
        total: repeatTotal,
    };
    window.api.savePendingRerun(inMemoryPendingRerun);

    // Inject placeholder rows for all upcoming runs so the user sees them immediately
    for (let i = 1; i <= repeatTotal; i++) {
        const attemptLabel = `#${existingCount + i}`;
        const placeholder = document.createElement('div');
        placeholder.className = 'pr-detail-run placeholder';
        placeholder.dataset.placeholder = 'true';
        placeholder.innerHTML = `
            <span class="status-dot idle"></span>
            <span class="pr-detail-run-name">${escapeHtml(attemptLabel)}</span>
            <span class="pr-detail-run-status">Queued</span>
            <div class="pr-detail-run-actions"></div>
        `;
        workflowRunsList.prepend(placeholder);
    }
});

window.api.onWorkflowRunAppeared(async ({ owner, repo, runId }) => {
    // add to Runs section in background (don't await — let it register while we refresh level 3)
    const runUrl = `https://github.com/${owner}/${repo}/actions/runs/${runId}`;
    const repeatTotal = pendingRepeatTotals.get(runId) ?? 1;
    pendingRepeatTotals.delete(runId);
    window.api.startWatching({ url: runUrl, repeatTotal, source: 'manual' }).then(r => {
        if (r.started) {
            if (r.status === 'completed') {
                addRunCard(r.runId, r.name, 'completed', r.conclusion, r.url, repeatTotal, 1, [r.conclusion], 'manual');
                applyCompletedState(r.runId, { repeatTotal, failed: r.failed, failedTests: r.failedTests });
            } else {
                addRunCard(r.runId, r.name, r.status, null, r.url, repeatTotal, 1, [], 'manual');
            }
        }
    });

    if (currentView !== 'workflow-runs' || !currentWorkflow || !currentPRContext) return;
    await openWorkflowRuns(currentWorkflow, currentPRContext, workflowRunsBackTarget);
    workflowRunsRerunBtn.disabled = false;
    workflowRunsRerunBtn.textContent = '↩ Rerun';
});

addBtn.addEventListener('click', () => {
    urlForm.style.display = 'block';
    addBtn.style.display = 'none';
    urlInput.focus();
});

window.api.onOpenNewWatch(() => {
    if (currentView !== 'main') return;
    if (urlForm.style.display === 'block') return; // already open
    addBtn.click();
});

cancelBtn.addEventListener('click', () => resetForm());

const prPicker = document.getElementById('prPicker');
let selectedRunUrl = null;

function resetForm() {
    urlInput.value = '';
    repeatInput.value = '1';
    repeatInput.disabled = false;
    repeatInput.parentElement.style.display = '';
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

function parseGitHubRunUrl(url) {
    const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/actions\/runs\/(\d+)/);
    if (!m) return null;
    return { owner: m[1], repo: m[2], runId: m[3] };
}

function isWorkflowUrl(url) {
    return /github\.com\/[^/]+\/[^/]+\/actions\/workflows\/[^/?#]+/.test(url);
}

watchBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) return;

    errorContainer.innerHTML = '';

    if (isWorkflowUrl(url)) {
        watchBtn.disabled = true;
        watchBtn.textContent = 'Pinning…';
        const result = await window.api.pinWorkflow(url);
        watchBtn.disabled = false;
        watchBtn.textContent = 'Pin';
        if (result.error) {
            errorContainer.innerHTML = `<div class="error-msg">${escapeHtml(result.error)}</div>`;
            return;
        }
        if (result.pinned) {
            addPinnedWorkflowCard(result.id, result.name, result.url, result.latestRunStatus, result.latestRunConclusion, result.latestRunUrl);
            resetForm();
        }
        return;
    }

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
    const url = urlInput.value.trim();
    const workflow = isWorkflowUrl(url);
    repeatInput.parentElement.style.display = workflow ? 'none' : '';
    if (workflow) {
        watchBtn.textContent = 'Pin';
        watchBtn.disabled = false;
    } else if (!selectedRunUrl) {
        watchBtn.textContent = 'Watch';
    }
    if (selectedRunUrl && !workflow) {
        selectedRunUrl = null;
        prPicker.innerHTML = '';
        prPicker.style.display = 'none';
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
    const resultsStr = repeatTotal > 1 && results.length > 0 ? ` · <span class="count-pass">${passed}</span> <span class="count-fail">${failed}</span>` : '';
    const repeatLabel = repeatTotal > 1 ? `Run ${repeatCurrent}/${repeatTotal}${resultsStr}` : '';
    const summary = (status === 'completed' && repeatTotal > 1) ? flakinessSummary(results, repeatTotal) : null;

    const card = document.createElement('div');
    card.className = `run-card ${getCardClass(status, conclusion)}`;
    card.id = `run-${runId}`;
    card.dataset.active = status !== 'completed' ? 'true' : 'false';
    card.innerHTML = `
        <div class="run-card-header">
            <div class="run-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
            <div class="run-actions">
                <button class="open-btn" title="Open in GitHub">↗</button>
                ${status !== 'completed' ? '<button class="cancel-run-btn">Stop</button>' : ''}
                <button class="remove-btn" title="Remove">×</button>
            </div>
        </div>
        <div class="run-status">
            <span class="status-dot ${status === 'completed' ? conclusion : status}"></span>
            <span class="status-text">${formatStatus(status, conclusion)}</span>
            ${repeatTotal > 1 ? `<span class="run-repeat">${repeatLabel}</span>` : ''}
        </div>
        ${summary ? `<div class="run-flakiness ${summary.cls}">${escapeHtml(summary.label)}</div>` : ''}
    `;

    card.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        const parsed = parseGitHubRunUrl(url);
        if (!parsed) return;
        openWorkflowRuns({ runId: parsed.runId, name }, { owner: parsed.owner, repo: parsed.repo }, 'main');
    });
    card.style.cursor = 'pointer';

    card.querySelector('.open-btn').addEventListener('click', () => window.api.openExternal(url));
    card.querySelector('.cancel-run-btn')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Stopping…';
        await window.api.cancelRun(runId);
        card.remove();
        watchedRuns.delete(runId);
        if (!hasAnyItems()) emptyState.style.display = 'flex';
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
        if (!hasAnyItems()) emptyState.style.display = 'flex';
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

function flakinessSummary(results, repeatTotal) {
    if (results.length < repeatTotal) return null;
    const failed = results.filter(r => r !== 'success').length;
    if (failed === 0) return { label: 'Stable', cls: 'flakiness-stable' };
    if (failed < repeatTotal / 2) return { label: `Probably flaky — ${failed} failure${failed > 1 ? 's' : ''} in ${repeatTotal} runs`, cls: 'flakiness-warn' };
    return { label: `Flaky — failed ${failed}/${repeatTotal} runs`, cls: 'flakiness-bad' };
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
        const resultsStr = results.length > 0 ? ` · <span class="count-pass">${passed}</span> <span class="count-fail">${failed}</span>` : '';
        repeatEl.innerHTML = `Run ${repeatCurrent}/${repeatTotal}${resultsStr}`;

        if (status === 'completed' && repeatCurrent === repeatTotal) {
            const summary = flakinessSummary(results, repeatTotal);
            if (summary) {
                let flakinessEl = card.querySelector('.run-flakiness');
                if (!flakinessEl) {
                    flakinessEl = document.createElement('div');
                    card.appendChild(flakinessEl);
                }
                flakinessEl.className = `run-flakiness ${summary.cls}`;
                flakinessEl.textContent = summary.label;
            }
        }
    }
}


window.api.onRunUpdate((data) => {
    updateRunCard(data.runId, data.status, data.conclusion, data.name, data.repeatCurrent, data.repeatTotal, data.results);
    watchedRuns.set(data.runId, data);

    if (currentView === 'pr-detail') {
        const row = prDetailList.querySelector(`[data-run-id="${data.runId}"]`);
        if (row) {
            const dotClass = data.status === 'completed' ? (data.conclusion ?? '') : data.status;
            row.querySelector('.status-dot').className = `status-dot ${dotClass}`;
            row.querySelector('.pr-detail-run-status').textContent = formatStatus(data.status, data.conclusion);
        }
    }
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
        rerunFailedBtn.textContent = '↩ Rerun Failed Only';
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
                rerunFailedBtn.textContent = '↩ Rerun Failed Only';
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

function addPinnedWorkflowCard(id, name, workflowUrl, latestRunStatus, latestRunConclusion, latestRunUrl) {
    emptyState.style.display = 'none';

    const dotClass = latestRunStatus === 'completed' ? (latestRunConclusion ?? '') : (latestRunStatus ?? '');
    const statusText = latestRunStatus ? formatStatus(latestRunStatus, latestRunConclusion) : 'No runs yet';
    const cardClass = latestRunStatus === 'completed'
        ? (latestRunConclusion === 'success' ? 'completed-success' : 'completed-failure')
        : (latestRunStatus ? 'in-progress' : '');

    const card = document.createElement('div');
    card.className = `run-card pinned-card ${cardClass}`;
    card.id = `pinned-${id}`;
    card.innerHTML = `
        <div class="run-card-header">
            <div class="run-name" title="${escapeHtml(name)}">📌 ${escapeHtml(name)}</div>
            <div class="run-actions">
                ${latestRunUrl ? '<button class="open-btn" title="Open in GitHub">↗</button>' : ''}
                <button class="remove-btn" title="Unpin">×</button>
            </div>
        </div>
        <div class="run-status">
            <span class="status-dot ${escapeHtml(dotClass)}"></span>
            <span class="status-text">${escapeHtml(statusText)}</span>
        </div>
    `;

    if (latestRunUrl) {
        card.querySelector('.open-btn').addEventListener('click', () => window.api.openExternal(latestRunUrl));
    }
    card.querySelector('.remove-btn').addEventListener('click', async () => {
        await window.api.unpinWorkflow(id);
        card.remove();
        if (!hasAnyItems()) emptyState.style.display = 'flex';
        updateSectionVisibility();
    });

    sectionPinnedItems.prepend(card);
    updateSectionVisibility();
}

function updatePinnedWorkflowCard(id, latestRunStatus, latestRunConclusion, latestRunUrl) {
    const card = document.getElementById(`pinned-${id}`);
    if (!card) return;

    const cardClass = latestRunStatus === 'completed'
        ? (latestRunConclusion === 'success' ? 'completed-success' : 'completed-failure')
        : (latestRunStatus ? 'in-progress' : '');
    card.className = `run-card pinned-card ${cardClass}`;

    const dotClass = latestRunStatus === 'completed' ? (latestRunConclusion ?? '') : (latestRunStatus ?? '');
    card.querySelector('.status-dot').className = `status-dot ${dotClass}`;
    card.querySelector('.status-text').textContent = latestRunStatus ? formatStatus(latestRunStatus, latestRunConclusion) : 'No runs yet';

    if (latestRunUrl) {
        const actions = card.querySelector('.run-actions');
        let openBtn = actions.querySelector('.open-btn');
        if (!openBtn) {
            openBtn = document.createElement('button');
            openBtn.className = 'open-btn';
            openBtn.title = 'Open in GitHub';
            openBtn.textContent = '↗';
            actions.insertBefore(openBtn, actions.querySelector('.remove-btn'));
        }
        openBtn.onclick = () => window.api.openExternal(latestRunUrl);
    }
}

window.api.onPinnedWorkflowUpdate((data) => {
    updatePinnedWorkflowCard(data.id, data.latestRunStatus, data.latestRunConclusion, data.latestRunUrl);
});

window.api.onPinnedWorkflowRestored((data) => {
    addPinnedWorkflowCard(data.id, data.name, data.url, data.latestRunStatus, data.latestRunConclusion, data.latestRunUrl);
});
