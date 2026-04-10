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

// Handle hash on initial load (e.g. app opened with a deep link or refresh)
if (window.location.hash) handleRoute();

// ── Notification Center ─ see renderer/pages/notifications.js ─────────────────
