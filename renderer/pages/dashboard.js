// ── Dashboard Page ──────────────────────────────────────────────────────────

function initStatTooltips() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.stat-info-btn');
        document.querySelectorAll('.stat-card[data-tooltip-open], .pr-stat-card[data-tooltip-open]').forEach(card => {
            if (!btn || card !== btn.closest('.stat-card, .pr-stat-card')) {
                card.removeAttribute('data-tooltip-open');
            }
        });
        if (btn) {
            btn.closest('.stat-card, .pr-stat-card').toggleAttribute('data-tooltip-open');
            e.stopPropagation();
        }
    });
}

function updateDashboardStats() {
    const totalPRs = document.getElementById('totalPRs');
    const totalRuns = document.getElementById('totalRuns');
    const totalFailures = document.getElementById('totalFailures');
    const flakyRate = document.getElementById('flakyRate');

    if (totalPRs) totalPRs.textContent = myPrsList?.children.length || 0;
    if (totalRuns) totalRuns.textContent = watchedRuns.size;

    let failures = 0;
    watchedRuns.forEach(run => {
        if (run.conclusion === 'failure') failures++;
    });
    if (totalFailures) totalFailures.textContent = failures;

    const rate = watchedRuns.size > 0 ? Math.round((failures / watchedRuns.size) * 100) : 0;
    if (flakyRate) flakyRate.textContent = `${rate}%`;
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

function getRunsListPage() {
    return document.getElementById('runsListPage');
}
