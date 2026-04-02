const addBtn = document.getElementById('addBtn');
const urlForm = document.getElementById('urlForm');
const urlInput = document.getElementById('urlInput');
const repeatInput = document.getElementById('repeatInput');
const watchBtn = document.getElementById('watchBtn');
const cancelBtn = document.getElementById('cancelBtn');
const runsList = document.getElementById('runsList');
const emptyState = document.getElementById('emptyState');
const errorContainer = document.getElementById('errorContainer');

const logoutBtn = document.getElementById('logoutBtn');
const authAvatar = document.getElementById('authAvatar');
const authUsername = document.getElementById('authUsername');
const appVersion = document.getElementById('appVersion');

const watchedRuns = new Map();

async function initUser() {
    const [status, version] = await Promise.all([
        window.api.authGetStatus(),
        window.api.getVersion()
    ]);
    appVersion.textContent = `v${version}`;
    if (status.loggedIn) {
        authUsername.textContent = status.login;
        if (status.avatarUrl) {
            authAvatar.src = status.avatarUrl;
            authAvatar.style.display = 'block';
        }
    }
}

logoutBtn.addEventListener('click', async () => {
    await window.api.authLogout();
});

initUser();

addBtn.addEventListener('click', () => {
    urlForm.style.display = 'block';
    addBtn.style.display = 'none';
    urlInput.focus();
});

cancelBtn.addEventListener('click', () => {
    urlForm.style.display = 'none';
    addBtn.style.display = 'block';
    urlInput.value = '';
    errorContainer.innerHTML = '';
});

watchBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();
    if (!url) return;

    errorContainer.innerHTML = '';
    watchBtn.disabled = true;
    watchBtn.textContent = 'Connecting...';

    const repeatTotal = parseInt(repeatInput.value, 10) || 1;
    const result = await window.api.startWatching({ url, repeatTotal });

    watchBtn.disabled = false;
    watchBtn.textContent = 'Watch Run';

    if (result.error) {
        errorContainer.innerHTML = `<div class="error-msg">${escapeHtml(result.error)}</div>`;
        return;
    }

    if (result.alreadyDone) {
        errorContainer.innerHTML = `<div class="error-msg">That run already finished (${result.conclusion}).</div>`;
        return;
    }

    if (result.started) {
        addRunCard(result.runId, result.name, result.status, null, result.url, result.repeatTotal);
        urlInput.value = '';
        repeatInput.value = '1';
        urlForm.style.display = 'none';
        addBtn.style.display = 'block';
    }
});

urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') watchBtn.click();
});

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function addRunCard(runId, name, status, conclusion, url, repeatTotal = 1, repeatCurrent = 1, results = []) {
    emptyState.style.display = 'none';

    const passed = results.filter(r => r === 'success').length;
    const failed = results.filter(r => r !== 'success').length;
    const resultsStr = repeatTotal > 1 && results.length > 0 ? ` · ✅ ${passed} ❌ ${failed}` : '';
    const repeatLabel = repeatTotal > 1 ? `Run ${repeatCurrent}/${repeatTotal}${resultsStr}` : '';

    const card = document.createElement('div');
    card.className = `run-card ${getCardClass(status, conclusion)}`;
    card.id = `run-${runId}`;
    card.innerHTML = `
        <div class="run-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
        <div class="run-status">
            <span class="status-dot ${status === 'completed' ? conclusion : status}"></span>
            <span class="status-text">${formatStatus(status, conclusion)}</span>
            ${repeatTotal > 1 ? `<span class="run-repeat">${escapeHtml(repeatLabel)}</span>` : ''}
        </div>
        <div class="run-actions">
            <button class="open-btn">Open</button>
            <button class="remove-btn">Remove</button>
        </div>
    `;

    card.querySelector('.open-btn').addEventListener('click', () => window.api.openExternal(url));
    card.querySelector('.remove-btn').addEventListener('click', async () => {
        await window.api.stopWatching(runId);
        card.remove();
        watchedRuns.delete(runId);
        if (watchedRuns.size === 0) emptyState.style.display = 'block';
    });

    runsList.prepend(card);
    watchedRuns.set(runId, { name, status, conclusion, url, repeatTotal });
}

function getCardClass(status, conclusion) {
    if (status === 'completed') {
        return conclusion === 'success' ? 'completed-success' : 'completed-failure';
    }
    return 'in-progress';
}

function formatStatus(status, conclusion) {
    if (status === 'completed') return conclusion;
    return status.replace(/_/g, ' ');
}

function updateRunCard(runId, status, conclusion, name, repeatCurrent, repeatTotal, results = []) {
    const card = document.getElementById(`run-${runId}`);
    if (!card) return;

    card.className = `run-card ${getCardClass(status, conclusion)}`;
    card.querySelector('.status-dot').className = `status-dot ${status === 'completed' ? conclusion : status}`;
    card.querySelector('.status-text').textContent = formatStatus(status, conclusion);

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
        const resultsStr = results.length > 0 ? ` · ✅ ${passed} ❌ ${failed}` : '';
        repeatEl.textContent = `Run ${repeatCurrent}/${repeatTotal}${resultsStr}`;
    }
}


window.api.onRunUpdate((data) => {
    updateRunCard(data.runId, data.status, data.conclusion, data.name, data.repeatCurrent, data.repeatTotal, data.results);
    watchedRuns.set(data.runId, data);
});

window.api.onRunError((data) => {
    const card = document.getElementById(`run-${data.runId}`);
    if (card) {
        card.querySelector('.status-text').textContent = `Error: ${data.error}`;
    }
});

window.api.onRunRestored((data) => {
    if (data.status === 'completed') {
        const conclusion = data.failed === 0 ? 'success' : 'failure';
        addRunCard(data.runId, data.name, 'completed', conclusion, data.url, data.repeatTotal, data.repeatCurrent, data.results);
        const card = document.getElementById(`run-${data.runId}`);
        if (card && data.repeatTotal > 1) {
            const reportBtn = document.createElement('button');
            reportBtn.className = 'report-btn';
            reportBtn.textContent = 'Report';
            reportBtn.addEventListener('click', () => window.api.saveReport(data.runId));
            card.querySelector('.run-actions').prepend(reportBtn);
        }
    } else {
        addRunCard(data.runId, data.name, 'in_progress', null, data.url, data.repeatTotal, data.repeatCurrent, data.results);
    }
});

window.api.onRunReportReady((data) => {
    const card = document.getElementById(`run-${data.runId}`);
    if (!card) return;
    const actions = card.querySelector('.run-actions');
    const reportBtn = document.createElement('button');
    reportBtn.className = 'report-btn';
    reportBtn.textContent = 'Report';
    reportBtn.addEventListener('click', () => window.api.saveReport(data.runId));
    actions.prepend(reportBtn);
});
