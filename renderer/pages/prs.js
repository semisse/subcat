// ── My PRs Page ──────────────────────────────────────────────────────────────

function showMyPrsDetail(pr) {
    switchPage('my-prs');
    openPRDetail(pr);
}

function showMyPrsList() {
    updateBreadcrumb('My PRs', null);
    const prListView = document.getElementById('prListView');
    const prDetailView = document.getElementById('prDetailView');
    const workflowRunsView = document.getElementById('workflowRunsView');
    const myPrsList = document.getElementById('myPrsList');
    if (workflowRunsView) workflowRunsView.classList.remove('active');
    if (prDetailView) prDetailView.classList.remove('active');
    if (prListView) prListView.classList.add('active');
    if (myPrsList && !myPrsList.children.length) {
        loadUserPRs();
    }
}

function showWorkflowRunsDetail() {
    const prDetailView = document.getElementById('prDetailView');
    const workflowRunsView = document.getElementById('workflowRunsView');
    if (prDetailView) prDetailView.classList.remove('active');
    if (workflowRunsView) workflowRunsView.classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.nav-item[data-page="my-prs"]').forEach(item => {
        item.addEventListener('click', () => {
            showMyPrsList();
        });
    });

    document.querySelectorAll('.toggle-switch').forEach(toggle => {
        toggle.addEventListener('click', () => {
            toggle.classList.toggle('active');
        });
    });
});

async function loadPRStats() {
    const stats = await window.api.getPRStats();
    if (stats.error) {
        console.error('Failed to load PR stats:', stats.error);
        return;
    }

    document.getElementById('statTotalRuns').textContent = stats.totalRuns || 0;

    const totalDuration = stats.totalDuration || 0;
    const durationText = totalDuration >= 3600
        ? `${Math.round(totalDuration / 3600)}h ${Math.round((totalDuration % 3600) / 60)}m`
        : totalDuration >= 60
            ? `${Math.round(totalDuration / 60)}m`
            : `${Math.round(totalDuration)}s`;
    document.getElementById('statTotalDuration').textContent = durationText;

    document.getElementById('statFailureRate').textContent = `${stats.failureRate || 0}%`;
    document.getElementById('statPainIndex').textContent = stats.painScore || 0;
}

async function loadUserPRs() {
    const myPrsEmptyState = document.getElementById('myPrsEmptyState');
    const result = await window.api.fetchUserPRs();
    if (result.error || !result.prs?.length) {
        if (myPrsEmptyState) myPrsEmptyState.classList.remove('hidden');
        updateDashboardStats();
        return;
    }

    if (myPrsEmptyState) myPrsEmptyState.classList.add('hidden');
    if (myPrsList) myPrsList.innerHTML = '';

    if (result.prs.length > 4 && myPrsList) myPrsList.classList.add('scrollable');

    for (const pr of result.prs) {
        const item = document.createElement('div');
        item.className = 'my-pr-item';
        item.dataset.pr = JSON.stringify(pr);
        const commentsChip = pr.comments > 0
            ? `<span class="pr-meta-chip">${pr.comments} comment${pr.comments !== 1 ? 's' : ''}</span>`
            : `<span class="pr-meta-chip muted">no comments</span>`;

        item.innerHTML = `
            <div class="pr-item-info">
                <div class="pr-item-repo">${escapeHtml(pr.owner)}/${escapeHtml(pr.repo)} · #${pr.number}</div>
                <div class="pr-item-title">${escapeHtml(pr.title)}</div>
                <div class="pr-item-meta">
                    <span class="pr-meta-review"><span class="pr-loading-spinner-sm"></span></span>
                    <span class="pr-meta-runs"><span class="pr-loading-spinner-sm"></span></span>
                    ${commentsChip}
                </div>
            </div>
            <div class="pr-item-badge">
                <span class="pr-loading-spinner"></span>
            </div>
        `;
        item.addEventListener('click', () => {
            showMyPrsDetail(pr);
        });
        if (myPrsList) myPrsList.appendChild(item);

        window.api.fetchPRRuns(`https://github.com/${pr.owner}/${pr.repo}/pull/${pr.number}`)
            .then(r => {
                const badge = item.querySelector('.pr-item-badge');
                const runsChip = item.querySelector('.pr-meta-runs');
                const status = r.error || !r.runs?.length ? '' : aggregatePRStatus(r.runs);
                if (badge) badge.innerHTML = `<span class="status-dot ${status}"></span>`;
                if (runsChip) {
                    const count = r.runs?.length ?? 0;
                    runsChip.className = 'pr-meta-chip' + (count === 0 ? ' muted' : '');
                    runsChip.textContent = count === 0 ? 'no runs' : `${count} workflow${count !== 1 ? 's' : ''}`;
                }
            })
            .catch(() => {
                const badge = item.querySelector('.pr-item-badge');
                const runsChip = item.querySelector('.pr-meta-runs');
                if (badge) badge.innerHTML = '<span class="status-dot"></span>';
                if (runsChip) { runsChip.className = 'pr-meta-chip muted'; runsChip.textContent = 'no runs'; }
            });

        window.api.fetchPRReviews({ owner: pr.owner, repo: pr.repo, prNumber: pr.number })
            .then(r => {
                const reviewChip = item.querySelector('.pr-meta-review');
                if (!reviewChip) return;
                if (r.error || r.reviewCount === 0) {
                    reviewChip.className = 'pr-meta-chip muted';
                    reviewChip.textContent = 'no reviews';
                    return;
                }
                const label = r.approved ? 'Approved' : r.changesRequested ? 'Changes requested' : `${r.reviewCount} review${r.reviewCount > 1 ? 's' : ''}`;
                const cls = r.approved ? 'approved' : r.changesRequested ? 'changes' : 'pending';
                reviewChip.className = `pr-meta-chip review-${cls}`;
                reviewChip.textContent = label;
            })
            .catch(() => {
                const reviewChip = item.querySelector('.pr-meta-review');
                if (reviewChip) { reviewChip.className = 'pr-meta-chip muted'; reviewChip.textContent = 'no reviews'; }
            });
    }

    updateDashboardStats();
}

function aggregatePRStatus(runs) {
    if (runs.some(r => r.status !== 'completed')) return 'in_progress';
    if (runs.some(r => ['failure', 'timed_out', 'startup_failure'].includes(r.conclusion))) return 'failure';
    return 'success';
}
