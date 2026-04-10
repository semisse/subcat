// ── Dashboard Page ──────────────────────────────────────────────────────────

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
