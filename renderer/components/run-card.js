// ── Run Cards ─────────────────────────────────────────────────────────────────

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
        cardClone.id = `run-page-${runId}`;
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

function updateRunCard(runId, status, conclusion, name, repeatCurrent, repeatTotal, results = []) {
    const cards = [
        document.getElementById(`run-${runId}`),
        document.getElementById(`run-page-${runId}`),
    ].filter(Boolean);
    if (!cards.length) return;

    for (const card of cards) {
        card.className = `run-card ${getCardClass(status, conclusion)}`;
        card.querySelector('.status-dot').className = `status-dot ${status === 'completed' ? conclusion : status}`;
        card.querySelector('.status-text').textContent = formatStatus(status, conclusion);

        if (status === 'completed') {
            card.dataset.active = 'false';
            card.querySelector('.cancel-run-btn')?.remove();
            const isFinalIteration = !(repeatTotal > 1 && repeatCurrent < repeatTotal);
            if (isFinalIteration && !card.querySelector('.rerun-btn')) {
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
        applyCompletedState(data.runId, { failed: data.failed, failedTests: [] });
    } else {
        addRunCard(data.runId, data.name, 'in_progress', null, data.url, data.repeatTotal, data.repeatCurrent, data.results, source);
    }
});

function applyCompletedState(runId, { failed, failedTests }) {
    const cards = [
        document.getElementById(`run-${runId}`),
        document.getElementById(`run-page-${runId}`),
    ].filter(Boolean);
    if (!cards.length) return;

    for (const card of cards) {
        const actions = card.querySelector('.run-actions');
        const openBtn = actions.querySelector('.open-btn');

        // 3. Report — insert before Open (idempotent: skip if already present
        // because onRunRestored and run-report-ready can both fire for the
        // same run).
        if (!actions.querySelector('.report-btn')) {
            const reportBtn = document.createElement('button');
            reportBtn.className = 'report-btn';
            reportBtn.textContent = 'Report';
            reportBtn.addEventListener('click', () => window.api.saveReport(runId));
            actions.insertBefore(reportBtn, openBtn);
        }
        const reportBtn = actions.querySelector('.report-btn');

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

        // 1. Rerun Failed — insert before Rerun All (idempotent)
        if (failed > 0 && !actions.querySelector('.rerun-failed-btn')) {
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

            if (failedTests?.length > 0 && !card.querySelector('.failed-tests')) {
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
}

window.api.onRunReportReady((data) => {
    applyCompletedState(data.runId, data);
});
