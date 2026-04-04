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
