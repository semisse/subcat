// ── Pinned Workflow Cards ──────────────────────────────────────────────────────

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
