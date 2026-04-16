// ── Workflows / PR Detail / Level-3 View ──────────────────────────────────────

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
                      currentView === 'workflow-runs';

    currentWorkflow = workflow;
    workflowRunsBackTarget = backTarget;
    currentPRContext = { owner, repo, headRef: headRef ?? null };

    const isRunsSource = backTarget === 'runs';
    const navPage = isRunsSource ? 'runs' : 'my-prs';
    const prLabel = !isRunsSource && currentPR ? `${currentPR.title} #${currentPR.number}` : null;

    showWorkflowRunsView(navPage);

    if (isRunsSource) {
        updateBreadcrumb('Watching', workflow.name);
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
        }, 30000);
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
