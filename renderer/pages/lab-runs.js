// ── Lab Runs ───────────────────────────────────────────────────────────────────

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

// ── Lab Runs List ──────────────────────────────────────────────────────────────

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

// ── Lab Run Detail ─────────────────────────────────────────────────────────────

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

// ── Run Detail ─────────────────────────────────────────────────────────────────

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
