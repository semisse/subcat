// Page Navigation
const pageTitles = {
    'home': 'Dashboard',
    'my-prs': 'My PRs',
    'runs': 'Runs',
    'reports': 'Reports',
    'profile': 'Profile'
};

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const page = item.dataset.page;
        if (!page) return; // Lab Runs uses href-based navigation
        // Clear hash so hash-based pages don't re-trigger
        if (window.location.hash) history.replaceState(null, '', window.location.pathname);
        switchPage(page);
    });
});

document.getElementById('breadcrumbHome')?.addEventListener('click', () => {
    switchPage('home');
});

function updateBreadcrumb(page1, page2, page3) {
    const home = document.getElementById('breadcrumbHome');
    const sep1 = document.getElementById('sep1');
    const sep2 = document.getElementById('sep2');
    const p1 = document.getElementById('breadcrumbPage1');
    const p2 = document.getElementById('breadcrumbPage2');
    const p3 = document.getElementById('breadcrumbPage3');

    if (home) home.classList.remove('current');

    if (p1) { p1.textContent = page1 ?? ''; p1.style.display = page1 ? '' : 'none'; }
    if (sep1) sep1.style.display = page1 && page2 ? '' : 'none';
    if (p2) { p2.textContent = page2 ?? ''; p2.style.display = page2 ? '' : 'none'; }
    if (sep2) sep2.style.display = page2 && page3 ? '' : 'none';
    if (p3) { p3.textContent = page3 ?? ''; p3.style.display = page3 ? '' : 'none'; }
}

function switchPage(page) {
    if (page !== 'my-prs' && currentView === 'workflow-runs') {
        clearLevel3Poll();
        currentView = 'main';
    }

    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector(`.nav-item[data-page="${page}"]`)?.classList.add('active');

    document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active'));
    const pageId = page === 'my-prs' ? 'pageMyprs' : `page${page.charAt(0).toUpperCase() + page.slice(1).replace('-', '')}`;
    document.getElementById(pageId)?.classList.add('active');

    updateBreadcrumb(pageTitles[page], null);

    if (page === 'reports') loadSavedReports();
}

async function loadSavedReports() {
    const list = document.getElementById('savedReportsList');
    if (!list) return;

    const reports = await window.api.getSavedReports();
    list.innerHTML = '';

    if (!reports.length) {
        list.innerHTML = '<div class="saved-reports-empty">No reports saved yet. Save a report from a run to see it here.</div>';
        return;
    }

    for (const r of reports) {
        const badgeClass = r.flakiness === 'Stable' ? 'stable'
            : r.flakiness.startsWith('Probably') ? 'probably-flaky'
            : 'flaky';

        const date = new Date(r.saved_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        const fileName = r.file_path.split('/').pop();

        const item = document.createElement('div');
        item.className = 'saved-report-item';
        item.dataset.id = r.id;
        item.innerHTML = `
            <div class="saved-report-title" title="${escapeHtml(r.file_path)}">${escapeHtml(r.title)}</div>
            <span class="saved-report-badge ${badgeClass}">${escapeHtml(r.flakiness)}</span>
            <div class="saved-report-meta">${r.passed} ✅ / ${r.failed} ❌ · ${escapeHtml(date)}</div>
            <div class="saved-report-actions">
                <button class="reveal-btn" title="Show in Finder">Show in Finder</button>
                <button class="delete-btn" title="Remove from list">Remove</button>
            </div>
        `;

        item.querySelector('.reveal-btn').addEventListener('click', () => {
            window.api.revealInFinder(r.file_path);
        });

        item.querySelector('.delete-btn').addEventListener('click', async () => {
            await window.api.deleteSavedReport(r.id);
            item.remove();
            if (!list.children.length) {
                list.innerHTML = '<div class="saved-reports-empty">No reports saved yet. Save a report from a run to see it here.</div>';
            }
        });

        list.appendChild(item);
    }
}

document.getElementById('sidebarUser')?.addEventListener('click', () => {
    switchPage('profile');
});

// ── Feature Flags ───────────────────────────────────────────────────────────

async function initFeatureFlags() {
    featureFlags = await window.api.getFeatureFlags();
    const navLabRuns = document.getElementById('navLabRuns');
    if (navLabRuns) navLabRuns.style.display = featureFlags['lab-runs'] ? '' : 'none';
}

async function initUser() {
    const [status, version] = await Promise.all([
        window.api.authGetStatus(),
        window.api.getVersion()
    ]);
    if (appVersion) appVersion.textContent = `v${version}`;
    if (status.loggedIn) {
        if (authUsername) authUsername.textContent = status.login;
        const welcomeUsername = document.getElementById('welcomeUsername');
        if (welcomeUsername) welcomeUsername.textContent = status.login;
        if (authEmail) authEmail.textContent = status.email || `${status.login}@github.com`;
        if (status.avatarUrl) {
            if (authAvatar) {
                authAvatar.src = status.avatarUrl;
                authAvatar.style.display = 'block';
            }
            const profileAvatar = document.getElementById('profileAvatar');
            if (profileAvatar) {
                profileAvatar.src = status.avatarUrl;
                profileAvatar.style.display = 'block';
            }
            const profileName = document.getElementById('profileName');
            if (profileName) profileName.textContent = status.login;
            const profileEmail = document.getElementById('profileEmail');
            if (profileEmail) profileEmail.textContent = status.email || `${status.login}@github.com`;
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

    const activePage = document.querySelector('.nav-item.active')?.dataset.page;

    if (activePage === 'my-prs') {
        await loadUserPRs();
        return;
    }

    if (activePage === 'reports') {
        await loadSavedReports();
        return;
    }

    if (activePage !== 'home' && activePage !== undefined) {
        // runs, profile — nothing meaningful to refresh
        return;
    }

    // main view refresh (home page)
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

    loadingState.classList.remove('visible');
    runsList.style.display = '';
    if (!hasAnyItems()) emptyState.style.display = 'flex';
    updateSectionVisibility();
});

logoutBtn.addEventListener('click', async () => {
    await window.api.authLogout();
});

initFeatureFlags();
initUser();
loadUserPRs();
loadPRStats();

// ── PRs ─ see renderer/pages/prs.js ─ Dashboard ─ see renderer/pages/dashboard.js ──

function showMainView() {
    clearLevel3Poll();
    currentView = 'main';
    switchPage('home');
    document.getElementById('workflowRunsView')?.classList.remove('active');
    document.getElementById('prDetailView')?.classList.remove('active');
    document.getElementById('prListView')?.classList.add('active');
    if (prDetailNav) prDetailNav.style.display = 'none';
    if (workflowRunsNav) workflowRunsNav.style.display = 'none';
    if (prDetailTitle) prDetailTitle.textContent = '';
}

function showPRDetailView() {
    currentView = 'pr-detail';
    switchPage('my-prs');
    document.getElementById('prListView')?.classList.remove('active');
    document.getElementById('workflowRunsView')?.classList.remove('active');
    document.getElementById('prDetailView')?.classList.add('active');
    if (myPrsNav) myPrsNav.style.display = 'none';
    if (prDetailNav) prDetailNav.style.display = 'flex';
    if (workflowRunsNav) workflowRunsNav.style.display = 'none';
}

function showWorkflowRunsView(navPage = 'my-prs') {
    currentView = 'workflow-runs';
    switchPage('my-prs'); // workflowRunsView lives inside pageMyprs
    // Override sidebar highlight when navigating from a different source
    if (navPage !== 'my-prs') {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelector(`.nav-item[data-page="${navPage}"]`)?.classList.add('active');
    }
    document.getElementById('prListView')?.classList.remove('active');
    document.getElementById('prDetailView')?.classList.remove('active');
    document.getElementById('workflowRunsView')?.classList.add('active');
    if (myPrsNav) myPrsNav.style.display = 'none';
    if (prDetailNav) prDetailNav.style.display = 'none';
    if (workflowRunsNav) workflowRunsNav.style.display = 'flex';
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

function markFailedOnlyAttempt(runId, attemptNum, owner, repo) {
    if (!failedOnlyAttempts.has(runId)) failedOnlyAttempts.set(runId, new Set());
    failedOnlyAttempts.get(runId).add(attemptNum);
    if (owner && repo) {
        window.api.saveFailedOnlyAttempt({ owner, repo, runId, attemptNum });
    }
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
    updateBreadcrumb('My PRs', `${pr.title} #${pr.number}`);

    const prListView = document.getElementById('prListView');
    const prDetailView = document.getElementById('prDetailView');
    const workflowRunsView = document.getElementById('workflowRunsView');
    const prDetailLoading = document.getElementById('prDetailLoading');
    const prDetailSubtitle = document.getElementById('prDetailSubtitle');
    if (prListView) prListView.classList.remove('active');
    if (prDetailView) {
        prDetailView.classList.add('active');
        if (prDetailTitle) prDetailTitle.textContent = `${pr.title} #${pr.number}`;
    }
    if (workflowRunsView) workflowRunsView.classList.remove('active');

    if (prDetailList) {
        prDetailList.style.display = 'none';
        prDetailList.innerHTML = '';
    }
    if (prDetailSubtitle) prDetailSubtitle.style.display = 'none';
    if (prDetailLoading) prDetailLoading.style.display = 'flex';

    const result = await window.api.fetchPRRuns(`https://github.com/${pr.owner}/${pr.repo}/pull/${pr.number}`);
    if (prDetailLoading) prDetailLoading.style.display = 'none';
    if (prDetailList) prDetailList.style.display = 'block';

    if (result.error || !result.runs?.length) {
        if (prDetailList) prDetailList.innerHTML = '<div class="pr-detail-empty">No workflows found.</div>';
        return;
    }

    currentPRContext = { owner: result.owner, repo: result.repo, headRef: result.headRef };
    if (prDetailSubtitle) prDetailSubtitle.style.display = '';

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
        if (prDetailList) prDetailList.appendChild(item);
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
            const previousAttemptCount = currentWorkflowRuns.length;
            const result = await window.api.rerunFailedJobsDirect({ owner, repo, runId: run.runId, previousAttemptCount });
            if (result.error) {
                btn.disabled = false;
                btn.textContent = '↩ Rerun Failed Only';
            } else {
                const nextAttempt = currentWorkflowRuns.length + 1;
                markFailedOnlyAttempt(run.runId, nextAttempt, owner, repo);
                btn.remove();

                // Add placeholder so the user sees the new attempt immediately
                const placeholder = document.createElement('div');
                placeholder.className = 'pr-detail-run placeholder';
                placeholder.dataset.placeholder = 'true';
                placeholder.innerHTML = `
                    <span class="status-dot idle"></span>
                    <span class="pr-detail-run-name">#${nextAttempt} <span class="failed-only-badge">failed jobs only</span></span>
                    <span class="pr-detail-run-status">Queued</span>
                    <div class="pr-detail-run-actions"></div>
                `;
                workflowRunsList.prepend(placeholder);

                // Register pending rerun so onWorkflowRunAppeared refreshes this view
                inMemoryPendingRerun = { owner, repo, runId: run.runId, fromAttempt: currentWorkflowRuns.length, total: 1 };
                window.api.savePendingRerun(inMemoryPendingRerun);
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

    const isRunsSource = backTarget === 'runs';
    const navPage = isRunsSource ? 'runs' : 'my-prs';
    const prLabel = !isRunsSource && currentPR ? `${currentPR.title} #${currentPR.number}` : null;

    showWorkflowRunsView(navPage);

    if (isRunsSource) {
        updateBreadcrumb('Runs', workflow.name);
    } else {
        updateBreadcrumb('My PRs', prLabel, workflow.name);
    }
    if (workflowRunsTitle) workflowRunsTitle.textContent = workflow.name;
    const wfPRContext = document.getElementById('workflowRunsPRContext');
    if (wfPRContext) wfPRContext.textContent = prLabel ?? '';

    if (!isRefresh) {
        workflowRunsList.style.display = 'none';
        workflowRunsList.innerHTML = '';
        loadingText.textContent = 'Loading…';
        loadingState.classList.add('visible');
    }

    const result = await window.api.fetchRunAttempts({ owner, repo, runId: workflow.runId });

    if (!isRefresh) {
        loadingState.classList.remove('visible');
        workflowRunsList.style.display = 'block';
    }

    if (result.error || !result.runs?.length) {
        workflowRunsList.innerHTML = '<div class="pr-detail-empty">No runs found.</div>';
        return;
    }

    currentWorkflowRuns = result.runs;
    if (result.failedOnlyAttempts?.length) {
        failedOnlyAttempts.set(workflow.runId, new Set(result.failedOnlyAttempts));
    }
    const hasActiveRun = result.runs.some(r => r.status !== 'completed');
    workflowRunsRerunBtn.style.display = hasActiveRun ? 'none' : '';
    workflowRepeatInput.parentElement.style.display = hasActiveRun ? 'none' : '';
    workflowRunsCancelAllBtn.style.display = hasActiveRun ? '' : 'none';
    workflowRunsRerunBtn.textContent = '↩ Rerun All';

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
                    const previousAttemptCount = currentWorkflowRuns.length;
                    const result2 = await window.api.rerunFailedJobsDirect({ owner, repo, runId: targetRun.runId, previousAttemptCount });
                    if (result2.error) {
                        btn.disabled = false;
                        btn.textContent = '↩ Rerun Failed Only';
                    } else {
                        const nextAttempt = currentWorkflowRuns.length + 1;
                        markFailedOnlyAttempt(targetRun.runId, nextAttempt, owner, repo);
                        btn.remove();

                        // Add placeholder so the user sees the new attempt immediately
                        const placeholder = document.createElement('div');
                        placeholder.className = 'pr-detail-run placeholder';
                        placeholder.dataset.placeholder = 'true';
                        placeholder.innerHTML = `
                            <span class="status-dot idle"></span>
                            <span class="pr-detail-run-name">#${nextAttempt} <span class="failed-only-badge">failed jobs only</span></span>
                            <span class="pr-detail-run-status">Queued</span>
                            <div class="pr-detail-run-actions"></div>
                        `;
                        workflowRunsList.prepend(placeholder);

                        // Register pending rerun so auto-refresh keeps going
                        inMemoryPendingRerun = { owner, repo, runId: targetRun.runId, fromAttempt: currentWorkflowRuns.length, total: 1 };
                        window.api.savePendingRerun(inMemoryPendingRerun);
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

prDetailBack?.addEventListener('click', () => {
    const currentPage = document.querySelector('.nav-item.active')?.dataset.page;
    if (currentPage === 'my-prs') {
        updateBreadcrumb('My PRs', null);
        showMyPrsList();
    } else {
        updateBreadcrumb('Dashboard', null);
        showMainView();
    }
});

workflowRunsBack?.addEventListener('click', () => {
    if (workflowRunsBackTarget === 'runs') {
        switchPage('runs');
        updateBreadcrumb('Runs', null);
        currentView = 'main';
    } else if (workflowRunsBackTarget === 'main') {
        updateBreadcrumb('Dashboard', null);
        showMainView();
    } else if (currentPR) {
        openPRDetail(currentPR);
    } else {
        showPRDetailView();
    }
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
    if (!workflowRunsPinBtn || !currentWorkflowRuns?.length || !currentPRContext) return;
    const latestRunId = currentWorkflowRuns[0].runId;
    const isWatched = watchedRuns.has(latestRunId);
    workflowRunsPinBtn.textContent = isWatched ? '✓ Watching' : '⊕ Watch';
    workflowRunsPinBtn.classList.toggle('pinned', isWatched);
    workflowRunsPinBtn.disabled = isWatched;
}

workflowRunsPinBtn?.addEventListener('click', async () => {
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
    workflowRunsRerunBtn.textContent = n > 1 ? `↩ Rerun All ×${n}` : '↩ Rerun All';
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
        setTimeout(() => { workflowRunsRerunBtn.disabled = false; workflowRunsRerunBtn.textContent = '↩ Rerun All'; }, 2000);
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
    workflowRunsRerunBtn.textContent = '↩ Rerun All';
});

addBtn?.addEventListener('click', () => {
    switchPage('runs');
    openDock();
});

window.api.onOpenNewWatch(() => {
    switchPage('runs');
    openDock();
});

watchDockTrigger?.addEventListener('click', openDock);
urlFormClose?.addEventListener('click', closeDock);

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && urlForm?.style.display === 'block') closeDock();
});

cancelBtn?.addEventListener('click', () => closeDock());

const prPicker = document.getElementById('prPicker');
let selectedRunUrl = null;

function openDock() {
    if (watchDockTrigger) watchDockTrigger.style.display = 'none';
    if (urlForm) urlForm.style.display = 'block';
    if (urlInput) urlInput.focus();
}

function closeDock() {
    if (urlForm) urlForm.style.display = 'none';
    if (watchDockTrigger) watchDockTrigger.style.display = '';
    resetForm();
}

function resetForm() {
    if (urlInput) urlInput.value = '';
    if (repeatInput) {
        repeatInput.value = '1';
        repeatInput.disabled = false;
        repeatInput.parentElement.style.display = '';
    }
    if (prPicker) {
        prPicker.innerHTML = '';
        prPicker.style.display = 'none';
    }
    selectedRunUrl = null;
    watchBtn.textContent = 'Watch';
    watchBtn.disabled = false;
    errorContainer.innerHTML = '';
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
            closeDock();
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
        closeDock();
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
        openWorkflowRuns({ runId: parsed.runId, name }, { owner: parsed.owner, repo: parsed.repo }, 'runs');
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
    
    const runsListPage = getRunsListPage();
    if (runsListPage) {
        const cardClone = card.cloneNode(true);
        cardClone.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            const parsed = parseGitHubRunUrl(url);
            if (!parsed) return;
            openWorkflowRuns({ runId: parsed.runId, name }, { owner: parsed.owner, repo: parsed.repo }, 'runs');
        });
        cardClone.querySelector('.open-btn')?.addEventListener('click', () => window.api.openExternal(url));
        cardClone.querySelector('.cancel-run-btn')?.addEventListener('click', async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = 'Stopping…';
            await window.api.cancelRun(runId);
            cardClone.remove();
            watchedRuns.delete(runId);
            if (!hasAnyItems()) emptyState.style.display = 'flex';
            if (!runsListPage.querySelector('.run-card')) runsListPage.querySelector('.empty-state').style.display = 'flex';
            updateSectionVisibility();
        });
        cardClone.querySelector('.remove-btn')?.addEventListener('click', async () => {
            if (cardClone.dataset.active === 'true') {
                const confirmed = await window.api.confirm(
                    'Stop and remove run?',
                    'This run is still active. It will be stopped but not cancelled on GitHub.'
                );
                if (!confirmed) return;
            }
            await window.api.stopWatching(runId);
            cardClone.remove();
            watchedRuns.delete(runId);
            if (!hasAnyItems()) emptyState.style.display = 'flex';
            if (!runsListPage.querySelector('.run-card')) runsListPage.querySelector('.empty-state').style.display = 'flex';
            updateSectionVisibility();
        });
        const emptyStatePage = runsListPage.querySelector('.empty-state');
        if (emptyStatePage) emptyStatePage.style.display = 'none';
        runsListPage.prepend(cardClone);
    }
    
    watchedRuns.set(runId, { name, status, conclusion, url, repeatTotal, source });
    loadPRStats();
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

// ── Hash Router ────────────────────────────────────────────────────────────

let currentLabRunId = null; // used by runDetailBack to navigate back

function navigate(path) {
    window.location.hash = path;
}

function handleRoute() {
    const hash = window.location.hash.replace(/^#/, '');

    const labRunDetailMatch = hash.match(/^\/lab-runs\/(.+)$/);
    const runDetailMatch = hash.match(/^\/runs\/(.+)$/);
    const isLabRoute = hash === '/lab-runs' || !!labRunDetailMatch || !!runDetailMatch;

    if (!isLabRoute) return; // Not a lab-runs route — let existing navigation handle it

    if (!featureFlags['lab-runs']) {
        history.replaceState(null, '', window.location.pathname);
        switchPage('home');
        return;
    }

    document.querySelectorAll('.page-section').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    if (labRunDetailMatch) {
        document.getElementById('pageLabRunDetail')?.classList.add('active');
        document.getElementById('navLabRuns')?.classList.add('active');
        updateBreadcrumb('Lab Runs', null);
        renderLabRunDetail(labRunDetailMatch[1]);
    } else if (runDetailMatch) {
        document.getElementById('pageRunDetail')?.classList.add('active');
        document.getElementById('navLabRuns')?.classList.add('active');
        updateBreadcrumb('Lab Runs', null);
        renderRunDetail(parseInt(runDetailMatch[1], 10));
    } else {
        document.getElementById('pageLabRuns')?.classList.add('active');
        document.getElementById('navLabRuns')?.classList.add('active');
        updateBreadcrumb('Lab Runs', null);
        renderLabRunsList();
    }
}

window.addEventListener('hashchange', handleRoute);

// Lab Runs nav item click
document.getElementById('navLabRuns')?.addEventListener('click', (e) => {
    e.preventDefault();
    navigate('/lab-runs');
});

// Back buttons
document.getElementById('labRunDetailBack')?.addEventListener('click', () => navigate('/lab-runs'));
document.getElementById('runDetailBack')?.addEventListener('click', () => {
    if (currentLabRunId) navigate(`/lab-runs/${currentLabRunId}`);
    else navigate('/lab-runs');
});

// ── Lab Runs List ──────────────────────────────────────────────────────────

async function renderLabRunsList() {
    const list = document.getElementById('labRunsList');
    const countEl = document.getElementById('labRunsCount');
    if (!list) return;

    list.innerHTML = '<div class="lab-runs-empty">Loading…</div>';

    const labRuns = await window.api.getLabRuns();

    if (!Array.isArray(labRuns) || labRuns.length === 0) {
        list.innerHTML = '<div class="lab-runs-empty">No lab runs yet. Start watching a run to create one.</div>';
        if (countEl) countEl.textContent = '';
        return;
    }

    if (countEl) countEl.textContent = `${labRuns.length} run${labRuns.length !== 1 ? 's' : ''}`;
    list.innerHTML = '';

    for (const run of labRuns) {
        const item = buildLabRunItem(run);
        item.addEventListener('click', () => navigate(`/lab-runs/${run.id}`));
        list.appendChild(item);
    }
}

function labRunFlakiness(run) {
    const total = run.repeat_total;
    const completed = run.completed_count ?? 0;
    const passed = run.passed_count ?? 0;
    const failed = run.failed_count ?? 0;
    if (completed < total) return null;
    if (failed === 0) return { label: 'Stable', cls: 'stable' };
    if (failed < total / 2) return { label: 'Probably flaky', cls: 'probably-flaky' };
    return { label: 'Flaky', cls: 'flaky' };
}

function buildLabRunItem(run) {
    const item = document.createElement('div');
    item.className = 'lab-run-item';

    const prLabel = run.pr_number
        ? `#${run.pr_number}${run.pr_title ? ' · ' + run.pr_title : ''}`
        : (run.name || run.id);
    const label = `Stability Check · ${run.repeat_total} run${run.repeat_total !== 1 ? 's' : ''}`;

    const completed = run.completed_count ?? 0;
    const passed = run.passed_count ?? 0;
    const failed = run.failed_count ?? 0;
    const pending = run.repeat_total - completed;

    const status = run.status === 'watching' ? 'running' : (run.status || 'completed');
    const statusLabel = status === 'running' ? 'Running' : status.charAt(0).toUpperCase() + status.slice(1);

    let rightHtml = `<span class="lab-run-status-badge ${escapeHtml(status)}">${escapeHtml(statusLabel)}</span>`;

    if (status === 'running') {
        rightHtml += `<span class="lab-run-progress-text">${completed} / ${run.repeat_total}</span>`;
    } else {
        const flaky = labRunFlakiness(run);
        if (flaky) {
            rightHtml += `<span class="lab-run-result ${escapeHtml(flaky.cls)}">${escapeHtml(flaky.label)}</span>`;
            const pct = run.repeat_total > 0 ? Math.round((passed / run.repeat_total) * 100) : 0;
            rightHtml += `<span class="lab-run-confidence">${passed}/${run.repeat_total} (${pct}%)</span>`;
        }
    }

    item.innerHTML = `
        <div class="lab-run-item-left">
            <div class="lab-run-item-pr">${escapeHtml(prLabel)}</div>
            <div class="lab-run-item-label">${escapeHtml(label)}</div>
        </div>
        <div class="lab-run-item-right">${rightHtml}</div>
        <span class="lab-run-item-arrow">›</span>
    `;

    return item;
}

// ── Lab Run Detail ─────────────────────────────────────────────────────────

async function renderLabRunDetail(runId) {
    currentLabRunId = runId;

    const header = document.getElementById('labRunDetailHeader');
    const runsList = document.getElementById('labRunRunsList');
    const jobsSummary = document.getElementById('labRunJobsSummary');
    const timeline = document.getElementById('labRunTimeline');

    if (header) header.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">Loading…</div>';
    if (runsList) runsList.innerHTML = '';
    if (jobsSummary) jobsSummary.innerHTML = '';
    if (timeline) timeline.innerHTML = '';

    const [labRuns, results] = await Promise.all([
        window.api.getLabRuns(),
        window.api.getRunResults ? window.api.getRunResults(runId) : Promise.resolve([]),
    ]);

    const run = Array.isArray(labRuns) ? labRuns.find(r => r.id === runId) : null;

    if (!run) {
        if (header) header.innerHTML = '<div style="color:var(--accent-red);">Lab run not found.</div>';
        return;
    }

    // ── Header ──
    const total = run.repeat_total;
    const completed = run.completed_count ?? 0;
    const passed = run.passed_count ?? 0;
    const failed = run.failed_count ?? 0;
    const pending = total - completed;
    const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;

    const prLabel = run.pr_number
        ? `PR #${run.pr_number}${run.pr_title ? ' · ' + run.pr_title : ''}`
        : (run.name || run.id);

    const statusBadge = run.status === 'watching' ? 'running' : (run.status || 'completed');
    const statusLabel = statusBadge === 'running' ? 'Running' : statusBadge.charAt(0).toUpperCase() + statusBadge.slice(1);

    const fillClass = run.status !== 'watching' ? (failed > 0 ? 'has-failures' : 'done') : '';

    const shaHtml = run.head_sha
        ? `<div class="lab-run-detail-meta-item">Commit <span class="lab-run-sha">${escapeHtml(run.head_sha.slice(0, 7))}</span></div>`
        : '';

    updateBreadcrumb('Lab Runs', run.pr_number ? `#${run.pr_number}` : (run.name || run.id));

    header.innerHTML = `
        <div class="lab-run-detail-title">Lab Run — Stability Check (${total} run${total !== 1 ? 's' : ''})</div>
        <div class="lab-run-detail-meta">
            <div class="lab-run-detail-meta-item"><strong>${escapeHtml(prLabel)}</strong></div>
            ${shaHtml}
            <div class="lab-run-detail-meta-item">${escapeHtml(run.name || '')}</div>
        </div>
        <div class="lab-run-progress-bar-wrap">
            <div class="lab-run-progress-bar-track">
                <div class="lab-run-progress-bar-fill ${escapeHtml(fillClass)}" style="width:${progressPct}%"></div>
            </div>
            <span class="lab-run-progress-label">${completed} / ${total}</span>
            <span class="lab-run-status-badge ${escapeHtml(statusBadge)}">${escapeHtml(statusLabel)}</span>
        </div>
        <div class="lab-run-counters">
            <div class="lab-run-counter pass"><span>${passed}</span> passed</div>
            <div class="lab-run-counter fail"><span>${failed}</span> failed</div>
            <div class="lab-run-counter pending"><span>${pending}</span> pending</div>
        </div>
        <div class="lab-run-detail-actions">
            <button class="primary" id="labRunRerunBtn" ${statusBadge === 'running' ? 'disabled' : ''}>↩ Rerun (${total}×)</button>
        </div>
    `;

    header.querySelector('#labRunRerunBtn')?.addEventListener('click', async () => {
        const btn = header.querySelector('#labRunRerunBtn');
        btn.disabled = true;
        btn.textContent = 'Starting…';
        const result = await window.api.rerunRun(runId);
        if (result.error) {
            btn.disabled = false;
            btn.textContent = `↩ Rerun (${total}×)`;
        } else {
            // Refresh the page to show the new run state
            renderLabRunDetail(runId);
        }
    });

    // ── Runs list (fetch from DB via getLabRuns + getRunResults) ──
    // We load run_results via a dedicated IPC call
    const resultsData = await loadRunResults(runId);

    // Sort descending by number
    const sorted = [...resultsData].sort((a, b) => b.number - a.number);

    if (runsList) {
        if (sorted.length === 0) {
            runsList.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:12px 0;">No runs yet.</div>';
        } else {
            runsList.innerHTML = '';
            for (const r of sorted) {
                const row = buildRunRow(r, run);
                runsList.appendChild(row);
            }
        }
    }

    // ── Timeline ──
    if (timeline) {
        timeline.innerHTML = '';
        const orderedResults = [...resultsData].sort((a, b) => a.number - b.number);
        for (const r of orderedResults) {
            const dot = document.createElement('div');
            const cls = r.conclusion === 'success' ? 'success' : r.conclusion === 'failure' ? 'failure' : 'pending';
            const icon = cls === 'success' ? '✓' : cls === 'failure' ? '✕' : '·';
            dot.className = `timeline-dot ${cls}`;
            dot.title = `Run #${r.number}: ${r.conclusion || 'pending'}`;
            dot.textContent = icon;
            timeline.appendChild(dot);
        }
        // Add pending dots for runs not yet completed
        for (let i = resultsData.length; i < total; i++) {
            const dot = document.createElement('div');
            dot.className = 'timeline-dot pending';
            dot.textContent = '·';
            dot.title = `Run #${i + 1}: pending`;
            timeline.appendChild(dot);
        }
    }

    // ── Jobs summary (aggregate across all completed runs) ──
    renderJobsSummary(jobsSummary, run, resultsData);
}

async function loadRunResults(runId) {
    try {
        const data = await window.api.getRunResultsForRun(runId);
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

function buildRunRow(result, run) {
    const row = document.createElement('div');
    row.className = 'run-row';

    const dotClass = result.conclusion === 'success' ? 'success'
        : result.conclusion === 'failure' ? 'failure'
        : result.conclusion ?? 'in_progress';

    const conclusionLabel = result.conclusion
        ? (result.conclusion.charAt(0).toUpperCase() + result.conclusion.slice(1))
        : 'Running';

    const statusLabel = result.conclusion ? 'Finished' : 'In progress';

    row.innerHTML = `
        <span class="status-dot ${escapeHtml(dotClass)}"></span>
        <span class="run-row-number">#${result.number}</span>
        <span class="run-row-status">${escapeHtml(statusLabel)}</span>
        <span class="run-row-conclusion ${escapeHtml(dotClass)}">${escapeHtml(conclusionLabel)}</span>
        <span class="run-row-arrow">›</span>
    `;

    if (result.id) {
        row.addEventListener('click', () => navigate(`/runs/${result.id}`));
    }

    return row;
}

async function renderJobsSummary(container, run, results) {
    if (!container) return;
    if (results.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:12px 0;">No data yet.</div>';
        return;
    }

    container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:4px 0;">Loading jobs…</div>';

    // Fetch jobs for each completed result, aggregate by job name
    const jobStats = {}; // name → { total, failures }

    const completedResults = results.filter(r => r.conclusion);
    const token = null; // jobs fetched via IPC

    const jobFetches = completedResults.map(async r => {
        const parsed = r.url ? r.url.match(/github\.com\/([^/]+)\/([^/]+)\/actions\/runs\/(\d+)/) : null;
        if (!parsed) return;
        const [, owner, repo, ghRunId] = parsed;
        try {
            const res = await window.api.fetchRunJobs({ owner, repo, runId: ghRunId, attemptNumber: r.number });
            if (res.error || !res.jobs) return;
            for (const job of res.jobs) {
                if (!jobStats[job.name]) jobStats[job.name] = { total: 0, failures: 0 };
                jobStats[job.name].total++;
                if (job.conclusion === 'failure') jobStats[job.name].failures++;
            }
        } catch { /* ignore */ }
    });

    await Promise.all(jobFetches);

    container.innerHTML = '';
    const entries = Object.entries(jobStats);
    if (entries.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:12px 0;">No job data available.</div>';
        return;
    }

    for (const [name, stats] of entries) {
        const isFlaky = stats.failures > 0;
        const badgeCls = isFlaky ? 'failures' : 'stable';
        const badgeLabel = isFlaky ? `${stats.failures} failure${stats.failures !== 1 ? 's' : ''}` : 'Stable';
        const row = document.createElement('div');
        row.className = 'jobs-summary-row';
        row.innerHTML = `
            <span class="jobs-summary-name">${escapeHtml(name)}</span>
            <span class="jobs-summary-badge ${badgeCls}">${escapeHtml(badgeLabel)}</span>
        `;
        container.appendChild(row);
    }
}

// ── Run Detail ─────────────────────────────────────────────────────────────

async function renderRunDetail(resultId) {
    const header = document.getElementById('runDetailHeader');
    const jobsContainer = document.getElementById('runDetailJobs');

    if (header) header.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">Loading…</div>';
    if (jobsContainer) jobsContainer.innerHTML = '';

    // Get the specific run result
    const result = await window.api.getRunResult(resultId);
    if (!result || result.error) {
        if (header) header.innerHTML = '<div style="color:var(--accent-red);">Run not found.</div>';
        return;
    }

    // Get parent run for owner/repo
    const labRuns = await window.api.getLabRuns();
    const parentRun = Array.isArray(labRuns) ? labRuns.find(r => r.id === result.run_id) : null;

    const conclusionLabel = result.conclusion
        ? result.conclusion.charAt(0).toUpperCase() + result.conclusion.slice(1)
        : 'In progress';
    const conclusionCls = result.conclusion === 'success' ? 'success'
        : result.conclusion === 'failure' ? 'failure'
        : '';

    updateBreadcrumb('Lab Runs', `Run #${result.number}`);

    if (header) {
        header.innerHTML = `
            <div class="run-detail-title">Run #${result.number}</div>
            <div class="run-detail-status ${conclusionCls}">${escapeHtml(conclusionLabel)}</div>
            ${result.url ? `<div style="margin-top:12px;"><a href="#" class="open-gh-link" data-url="${escapeHtml(result.url)}">View on GitHub ↗</a></div>` : ''}
        `;
        header.querySelector('.open-gh-link')?.addEventListener('click', (e) => {
            e.preventDefault();
            window.api.openExternal(e.currentTarget.dataset.url);
        });
    }

    // Fetch jobs from GitHub API
    if (jobsContainer) {
        jobsContainer.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">Loading jobs…</div>';

        const parsed = result.url ? result.url.match(/github\.com\/([^/]+)\/([^/]+)\/actions\/runs\/(\d+)/) : null;

        if (!parsed || !parentRun) {
            jobsContainer.innerHTML = '<div style="color:var(--text-muted);font-size:13px;">No job data available.</div>';
            return;
        }

        const [, owner, repo, ghRunId] = parsed;
        const res = await window.api.fetchRunJobs({ owner, repo, runId: ghRunId, attemptNumber: result.number });

        if (res.error || !res.jobs?.length) {
            jobsContainer.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:8px 0;">No jobs found.</div>';
            return;
        }

        jobsContainer.innerHTML = '';
        for (const job of res.jobs) {
            const statusCls = job.conclusion ?? job.status;
            const statusLabel = job.conclusion
                ? job.conclusion.charAt(0).toUpperCase() + job.conclusion.slice(1)
                : (job.status === 'in_progress' ? 'Running' : job.status);
            const el = document.createElement('div');
            el.className = 'job-item';
            el.innerHTML = `
                <span class="status-dot ${escapeHtml(statusCls ?? '')}"></span>
                <span class="job-item-name">${escapeHtml(job.name)}</span>
                <span class="job-item-status ${escapeHtml(statusCls ?? '')}">${escapeHtml(statusLabel)}</span>
            `;
            jobsContainer.appendChild(el);
        }
    }
}

// Handle hash on initial load (e.g. app opened with a deep link or refresh)
if (window.location.hash) handleRoute();

// ── Notification Center ─ see renderer/pages/notifications.js ─────────────────
