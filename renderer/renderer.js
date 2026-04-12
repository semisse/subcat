// Page Navigation
const pageTitles = {
    'home': 'Dashboard',
    'my-prs': 'My PRs',
    'runs': 'Runs',
    'reports': 'Reports',
    'lab-test': 'Lab Test',
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

    if (page === 'reports') { closeReportViewer(); loadSavedReports(); }
    if (page === 'lab-test') initLabTestPage();
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

        item.querySelector('.reveal-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            window.api.revealInFinder(r.file_path);
        });

        item.querySelector('.delete-btn').addEventListener('click', async (e) => {
            e.stopPropagation();
            await window.api.deleteSavedReport(r.id);
            item.remove();
            if (!list.children.length) {
                list.innerHTML = '<div class="saved-reports-empty">No reports saved yet. Save a report from a run to see it here.</div>';
            }
        });

        item.addEventListener('click', () => openReportViewer(r));

        list.appendChild(item);
    }
}

function closeReportViewer() {
    document.getElementById('reportsListView').style.display = '';
    document.getElementById('reportViewer').style.display = 'none';
    updateBreadcrumb('Reports', null);
    const breadcrumbP1 = document.getElementById('breadcrumbPage1');
    if (breadcrumbP1) { breadcrumbP1.style.cursor = ''; breadcrumbP1.onclick = null; }
}

async function openReportViewer(r) {
    const result = await window.api.readReportFile(r.file_path);
    if (result.error) return;

    document.getElementById('reportsListView').style.display = 'none';
    document.getElementById('reportViewer').style.display = '';
    updateBreadcrumb('Reports', escapeHtml(r.title));

    const titleEl = document.getElementById('reportViewerTitle');
    if (titleEl) titleEl.textContent = r.title;

    const backBtn = document.getElementById('reportViewerBack');
    if (backBtn) backBtn.onclick = () => closeReportViewer();

    const breadcrumbP1 = document.getElementById('breadcrumbPage1');
    if (breadcrumbP1) {
        breadcrumbP1.style.cursor = 'pointer';
        breadcrumbP1.onclick = () => closeReportViewer();
    }

    const badgeClass = r.flakiness === 'Stable' ? 'stable'
        : r.flakiness.startsWith('Probably') ? 'probably-flaky'
        : 'flaky';

    const summaryEl = document.getElementById('reportViewerSummary');
    summaryEl.innerHTML = `
        <div class="rpt-stat-row">
            <div class="rpt-stat"><span class="rpt-stat-val">${r.total}</span><span class="rpt-stat-lbl">Total</span></div>
            <div class="rpt-stat success"><span class="rpt-stat-val">${r.passed}</span><span class="rpt-stat-lbl">Passed</span></div>
            <div class="rpt-stat failed"><span class="rpt-stat-val">${r.failed}</span><span class="rpt-stat-lbl">Failed</span></div>
            <div class="rpt-stat rpt-stat-flakiness ${badgeClass}"><span class="rpt-stat-flakiness-val">${escapeHtml(r.flakiness)}</span></div>
        </div>
    `;

    const parsed = r.type === 'run'
        ? parseRunReport(result.content)
        : parsePRWorkflowReport(result.content);

    const bodyEl = document.getElementById('reportViewerBody');
    bodyEl.innerHTML = '';

    if (parsed.hints?.length) {
        const hintsEl = document.createElement('div');
        hintsEl.className = 'rpt-hints';
        hintsEl.innerHTML = `<span class="rpt-hints-label">Probable root causes</span> ${parsed.hints.map(h => `<span class="rpt-hint-chip">${escapeHtml(h)}</span>`).join('')}`;
        bodyEl.appendChild(hintsEl);
    }

    const rows = r.type === 'run'
        ? renderRunRows(parsed.rows)
        : renderWorkflowRows(parsed.rows);
    bodyEl.appendChild(rows);
}

function parseRunReport(content) {
    const rows = [];
    const hints = [];
    for (const line of content.split('\n')) {
        if (line.startsWith('**Probable root causes:**')) {
            hints.push(...line.replace('**Probable root causes:**', '').trim().split(', ').map(s => s.trim()).filter(Boolean));
        }
        if (!line.startsWith('| [')) continue;
        const cells = line.split('|').map(c => c.trim()).filter(Boolean);
        if (cells.length < 6) continue;
        const runMatch = cells[0].match(/\[(\d+)\]\(([^)]+)\)/);
        if (!runMatch) continue;
        const success = cells[1].includes('✅');
        const conclusion = cells[1].replace(/[✅❌]/g, '').trim();
        const started = cells[2] === '—' ? null : cells[2];
        const completed = cells[3] === '—' ? null : cells[3];
        const rawTests = cells[4];
        const tests = rawTests === '—' ? [] : rawTests.split(', ').map(s => s.trim()).filter(Boolean);
        const artifactMatch = cells[5].match(/\[View logs →\]\(([^)]+)\)/);
        rows.push({ number: parseInt(runMatch[1]), url: runMatch[2], success, conclusion, started, completed, tests, artifactUrl: artifactMatch?.[1] ?? null });
    }
    return { rows, hints };
}

function parsePRWorkflowReport(content) {
    const rows = [];
    for (const line of content.split('\n')) {
        if (!line.startsWith('| #')) continue;
        const cells = line.split('|').map(c => c.trim()).filter(Boolean);
        if (cells.length < 4) continue;
        const attempt = parseInt(cells[0].replace('#', ''));
        const success = cells[1].includes('✅');
        const inProgress = cells[1].includes('🔄');
        const resultText = cells[1].replace(/[✅❌🔄]/g, '').trim();
        const duration = cells[2];
        const linkMatch = cells[3].match(/\[Open\]\(([^)]+)\)/);
        rows.push({ attempt, success, inProgress, result: resultText, duration, url: linkMatch?.[1] ?? null });
    }
    return { rows };
}

function formatDuration(started, completed) {
    if (!started || !completed) return null;
    const ms = new Date(completed) - new Date(started);
    if (isNaN(ms) || ms < 0) return null;
    const s = Math.round(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function renderRunRows(rows) {
    const container = document.createElement('div');
    container.className = 'rpt-runs-list';
    for (const r of rows) {
        const duration = formatDuration(r.started, r.completed);
        const dateStr = r.started ? new Date(r.started).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null;

        const row = document.createElement('div');
        row.className = `rpt-run-row ${r.success ? 'success' : 'failed'}`;
        row.innerHTML = `
            <span class="rpt-run-icon">${r.success ? '✅' : '❌'}</span>
            <a class="rpt-run-num" href="#" title="Open in GitHub">Run #${r.number}</a>
            <span class="rpt-run-conclusion">${escapeHtml(r.conclusion)}</span>
            <span class="rpt-run-meta">${[dateStr, duration].filter(Boolean).map(s => escapeHtml(s)).join(' · ')}</span>
            ${r.tests.length ? `<div class="rpt-run-tests">${r.tests.map(t => `<span class="rpt-test-chip">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
            ${r.artifactUrl ? `<a class="rpt-artifact-link" href="#">View logs</a>` : ''}
        `;
        row.querySelector('.rpt-run-num').addEventListener('click', (e) => {
            e.preventDefault();
            window.api.openExternal(r.url);
        });
        if (r.artifactUrl) {
            row.querySelector('.rpt-artifact-link').addEventListener('click', (e) => {
                e.preventDefault();
                window.api.openExternal(r.artifactUrl);
            });
        }
        container.appendChild(row);
    }
    return container;
}

function renderWorkflowRows(rows) {
    const container = document.createElement('div');
    container.className = 'rpt-runs-list';
    for (const r of rows) {
        const icon = r.success ? '✅' : r.inProgress ? '🔄' : '❌';
        const row = document.createElement('div');
        row.className = `rpt-run-row ${r.success ? 'success' : r.inProgress ? '' : 'failed'}`;
        row.innerHTML = `
            <span class="rpt-run-icon">${icon}</span>
            <span class="rpt-run-num">Attempt #${r.attempt}</span>
            <span class="rpt-run-conclusion">${escapeHtml(r.result)}</span>
            <span class="rpt-run-meta">${escapeHtml(r.duration)}</span>
            ${r.url ? `<a class="rpt-artifact-link" href="#">Open</a>` : ''}
        `;
        if (r.url) {
            row.querySelector('.rpt-artifact-link').addEventListener('click', (e) => {
                e.preventDefault();
                window.api.openExternal(r.url);
            });
        }
        container.appendChild(row);
    }
    return container;
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
initLabTest();
initStatTooltips();

// ── PRs ─ see renderer/pages/prs.js ─ Dashboard ─ see renderer/pages/dashboard.js ──

// Handle hash on initial load (e.g. app opened with a deep link or refresh)
if (window.location.hash) handleRoute();

// ── Notification Center ─ see renderer/pages/notifications.js ─────────────────
