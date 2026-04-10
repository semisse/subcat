// ── Runs Page / Watch Dock ─────────────────────────────────────────────────────

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
