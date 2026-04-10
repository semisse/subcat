/**
 * @jest-environment jsdom
 */

// Minimal DOM scaffold that addRunCard depends on
function setupDOM() {
    document.body.innerHTML = `
        <div id="runsList"></div>
        <div id="emptyState" style="display:flex;"></div>
    `;
}

// Inline the functions under test to avoid Electron/IPC imports
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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

function addRunCard(runId, name, status, conclusion, url, repeatTotal = 1, repeatCurrent = 1, results = []) {
    const emptyState = document.getElementById('emptyState');
    const runsList = document.getElementById('runsList');

    emptyState.style.display = 'none';

    const passed = results.filter(r => r === 'success').length;
    const failed = results.filter(r => r !== 'success').length;
    const resultsStr = repeatTotal > 1 && results.length > 0 ? ` · ✅ ${passed} ❌ ${failed}` : '';
    const repeatLabel = repeatTotal > 1 ? `Run ${repeatCurrent}/${repeatTotal}${resultsStr}` : '';

    const card = document.createElement('div');
    card.className = `run-card ${getCardClass(status, conclusion)}`;
    card.id = `run-${runId}`;
    card.dataset.active = status !== 'completed' ? 'true' : 'false';
    card.innerHTML = `
        <div class="run-card-header">
            <div class="run-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
            <div class="run-actions">
                <button class="open-btn">Open</button>
                ${status !== 'completed' ? '<button class="cancel-run-btn">Stop</button>' : ''}
                <button class="remove-btn" title="Remove">×</button>
            </div>
        </div>
        <div class="run-status">
            <span class="status-dot ${status === 'completed' ? conclusion : status}"></span>
            <span class="status-text">${formatStatus(status, conclusion)}</span>
            ${repeatTotal > 1 ? `<span class="run-repeat">${escapeHtml(repeatLabel)}</span>` : ''}
        </div>
    `;

    card.querySelector('.open-btn').addEventListener('click', () => {});
    card.querySelector('.cancel-run-btn')?.addEventListener('click', async () => {});
    card.querySelector('.remove-btn').addEventListener('click', async () => {});

    runsList.prepend(card);
    return card;
}

// Inline the My PRs empty state logic from loadUserPRs
async function loadUserPRs(fetchResult) {
    const myPrsEmptyState = document.getElementById('myPrsEmptyState');
    if (fetchResult.error || !fetchResult.prs?.length) {
        if (myPrsEmptyState) myPrsEmptyState.classList.remove('hidden');
        return;
    }
    if (myPrsEmptyState) myPrsEmptyState.classList.add('hidden');
    const myPrsList = document.getElementById('myPrsList');
    if (myPrsList) myPrsList.innerHTML = fetchResult.prs.map(pr => `<div class="my-pr-item">${escapeHtml(pr.title)}</div>`).join('');
}

// Inline the Runs page empty state logic from cardClone remove handlers
function removeRunCard(card) {
    const runsListPage = document.getElementById('runsListPage');
    card.remove();
    if (runsListPage && !runsListPage.querySelector('.run-card')) {
        runsListPage.querySelector('.empty-state').style.display = 'flex';
    }
}

// ─── addRunCard ───────────────────────────────────────────────────────────────

describe('addRunCard', () => {
    beforeEach(setupDOM);

    test('does not throw for a completed run (no Stop button)', () => {
        expect(() => addRunCard('1', 'My Run', 'completed', 'failure', 'https://github.com/o/r/actions/runs/1')).not.toThrow();
    });

    test('does not render Stop button for completed runs', () => {
        addRunCard('1', 'My Run', 'completed', 'success', 'https://github.com/o/r/actions/runs/1');
        const card = document.getElementById('run-1');
        expect(card.querySelector('.cancel-run-btn')).toBeNull();
    });

    test('renders Stop button for in-progress runs', () => {
        addRunCard('2', 'My Run', 'in_progress', null, 'https://github.com/o/r/actions/runs/2');
        const card = document.getElementById('run-2');
        expect(card.querySelector('.cancel-run-btn')).not.toBeNull();
    });

    test('sets card as inactive for completed runs', () => {
        addRunCard('1', 'My Run', 'completed', 'success', 'https://github.com/o/r/actions/runs/1');
        expect(document.getElementById('run-1').dataset.active).toBe('false');
    });

    test('sets card as active for in-progress runs', () => {
        addRunCard('2', 'My Run', 'in_progress', null, 'https://github.com/o/r/actions/runs/2');
        expect(document.getElementById('run-2').dataset.active).toBe('true');
    });

    test('hides empty state when card is added', () => {
        addRunCard('1', 'My Run', 'completed', 'success', 'https://github.com/o/r/actions/runs/1');
        expect(document.getElementById('emptyState').style.display).toBe('none');
    });

    test('applies completed-failure class for failure conclusion', () => {
        addRunCard('1', 'My Run', 'completed', 'failure', 'https://github.com/o/r/actions/runs/1');
        expect(document.getElementById('run-1').className).toContain('completed-failure');
    });

    test('applies completed-success class for success conclusion', () => {
        addRunCard('1', 'My Run', 'completed', 'success', 'https://github.com/o/r/actions/runs/1');
        expect(document.getElementById('run-1').className).toContain('completed-success');
    });
});

// ─── My PRs empty state ───────────────────────────────────────────────────────

describe('My PRs empty state', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="myPrsList"></div>
            <div id="myPrsEmptyState" class="hidden"></div>
        `;
    });

    test('shows empty state when API returns no PRs', async () => {
        await loadUserPRs({ prs: [] });
        expect(document.getElementById('myPrsEmptyState').classList.contains('hidden')).toBe(false);
    });

    test('shows empty state when API returns an error', async () => {
        await loadUserPRs({ error: 'Unauthorized' });
        expect(document.getElementById('myPrsEmptyState').classList.contains('hidden')).toBe(false);
    });

    test('hides empty state when PRs are returned', async () => {
        // Start visible
        document.getElementById('myPrsEmptyState').classList.remove('hidden');
        await loadUserPRs({ prs: [{ title: 'Fix bug', owner: 'o', repo: 'r', number: 1, comments: 0 }] });
        expect(document.getElementById('myPrsEmptyState').classList.contains('hidden')).toBe(true);
    });

    test('renders PR items when PRs are returned', async () => {
        await loadUserPRs({ prs: [
            { title: 'Fix bug', owner: 'o', repo: 'r', number: 1, comments: 0 },
            { title: 'Add feature', owner: 'o', repo: 'r', number: 2, comments: 2 },
        ]});
        expect(document.getElementById('myPrsList').querySelectorAll('.my-pr-item')).toHaveLength(2);
    });

    test('escapes HTML in PR titles', async () => {
        await loadUserPRs({ prs: [{ title: '<script>alert(1)</script>', owner: 'o', repo: 'r', number: 1, comments: 0 }] });
        expect(document.getElementById('myPrsList').innerHTML).not.toContain('<script>');
    });
});

// ─── Runs page empty state ────────────────────────────────────────────────────

describe('Runs page empty state', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div id="runsListPage">
                <div class="empty-state" style="display:none"></div>
            </div>
        `;
    });

    function addCardToRunsPage(id) {
        const card = document.createElement('div');
        card.className = 'run-card';
        card.id = `run-${id}`;
        document.getElementById('runsListPage').prepend(card);
        return card;
    }

    test('shows empty state when last card is removed', () => {
        const card = addCardToRunsPage('1');
        removeRunCard(card);
        expect(document.getElementById('runsListPage').querySelector('.empty-state').style.display).toBe('flex');
    });

    test('does not show empty state while other cards remain', () => {
        const card1 = addCardToRunsPage('1');
        addCardToRunsPage('2');
        removeRunCard(card1);
        expect(document.getElementById('runsListPage').querySelector('.empty-state').style.display).not.toBe('flex');
    });

    test('shows empty state after removing all cards one by one', () => {
        const card1 = addCardToRunsPage('1');
        const card2 = addCardToRunsPage('2');
        removeRunCard(card1);
        removeRunCard(card2);
        expect(document.getElementById('runsListPage').querySelector('.empty-state').style.display).toBe('flex');
    });
});
