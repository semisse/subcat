const { Tray, nativeImage } = require('electron');
const path = require('path');

const ASSETS = path.join(__dirname, '../../assets');

// Tray icon states
const STATE = { IDLE: 'idle', WATCHING: 'watching', ERROR: 'error' };

function iconForState(state) {
    const name = state === STATE.WATCHING ? 'trayWatchingTemplate'
        : state === STATE.ERROR ? 'trayErrorTemplate'
        : 'trayIdleTemplate';
    return nativeImage.createFromPath(path.join(ASSETS, `${name}.png`));
}

/**
 * Creates and manages the menu bar tray icon.
 *
 * @param {object} opts
 * @param {() => Electron.BrowserWindow | null} opts.getWindow
 * @param {import('events').EventEmitter} opts.poller
 * @returns {{ tray: Electron.Tray, setState: (state: string) => void }}
 */
function createTray({ getWindow, poller }) {
    const tray = new Tray(iconForState(STATE.IDLE));
    tray.setToolTip('SubCat');

    // Track counts to derive state
    let activeCount = 0;
    let unseenErrors = 0;

    function applyState() {
        if (unseenErrors > 0) {
            tray.setImage(iconForState(STATE.ERROR));
            return;
        }
        if (activeCount > 0) {
            tray.setImage(iconForState(STATE.WATCHING));
            return;
        }
        tray.setImage(iconForState(STATE.IDLE));
    }

    // ── Poller event listeners ──────────────────────────────────────────────

    poller.on('run:update', ({ status }) => {
        if (status === 'in_progress' || status === 'queued' || status === 'waiting') {
            activeCount = Math.max(activeCount, 1);
        }
        applyState();
    });

    poller.on('run:repeat-done', ({ conclusion }) => {
        if (conclusion !== 'success') unseenErrors++;
        applyState();
    });

    poller.on('run:all-done', ({ conclusion }) => {
        activeCount = Math.max(0, activeCount - 1);
        if (conclusion && conclusion !== 'success') unseenErrors++;
        applyState();
    });

    poller.on('run:error', () => {
        activeCount = Math.max(0, activeCount - 1);
        unseenErrors++;
        applyState();
    });

    // ── Toggle window on click ──────────────────────────────────────────────

    tray.on('click', () => {
        const win = getWindow();
        if (!win) return;

        if (win.isVisible()) {
            win.hide();
        } else {
            win.show();
            win.focus();
        }
        // Clear error badge once user opens the window
        unseenErrors = 0;
        applyState();
    });

    // ── Public API ──────────────────────────────────────────────────────────

    function setState(state) {
        if (state === STATE.IDLE) { activeCount = 0; unseenErrors = 0; }
        else if (state === STATE.WATCHING) { activeCount = 1; unseenErrors = 0; }
        else if (state === STATE.ERROR) { unseenErrors = 1; }
        applyState();
    }

    return { tray, setState };
}

module.exports = { createTray, STATE };
