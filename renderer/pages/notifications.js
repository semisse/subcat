// ── Notification Center ────────────────────────────────────────────────────────

let notifPanelOpen = false;

function updateNotifBadge(count) {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function renderNotifItem(n) {
    if (n.conclusion === 'update') {
        return renderUpdateNotifItem(n);
    }

    const dotClass = n.conclusion === 'success' ? 'success'
        : ['failure', 'cancelled', 'timed_out'].includes(n.conclusion) ? 'failure'
        : 'skipped';

    const item = document.createElement('div');
    item.className = `notif-item${n.read ? '' : ' unread'}`;
    item.innerHTML = `
        <span class="notif-dot ${escapeHtml(dotClass)}"></span>
        <div class="notif-content">
            <div class="notif-title">${escapeHtml(n.title)}</div>
            <div class="notif-body">${escapeHtml(n.body)}</div>
            ${n.url ? `<span class="notif-link" data-url="${escapeHtml(n.url)}">Open in GitHub →</span>` : ''}
            <div class="notif-time">${formatRelativeTime(n.triggered_at)}</div>
        </div>
    `;

    item.querySelector('.notif-link')?.addEventListener('click', () => {
        window.api.openExternal(n.url);
    });

    return item;
}

function renderUpdateNotifItem(n) {
    const item = document.createElement('div');
    item.className = `notif-item${n.read ? '' : ' unread'}`;
    item.dataset.updateNotif = 'true';
    item.innerHTML = `
        <span class="notif-dot" style="background:var(--accent-purple)"></span>
        <div class="notif-content">
            <div class="notif-title">${escapeHtml(n.title)}</div>
            <div class="notif-body update-notif-body">${escapeHtml(n.body)}</div>
            <div class="notif-time">${formatRelativeTime(n.triggered_at)}</div>
        </div>
    `;
    return item;
}

async function loadNotifications() {
    const list = document.getElementById('notifList');
    if (!list) return;

    const notifications = await window.api.getNotifications();
    list.innerHTML = '';

    if (!notifications.length) {
        list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
        return;
    }

    for (const n of notifications) {
        list.appendChild(renderNotifItem(n));
    }
}

async function openNotifPanel() {
    notifPanelOpen = true;
    document.getElementById('notifPanel')?.classList.add('open');
    await loadNotifications();
    // Mark as read after opening
    await window.api.markNotificationsRead();
    updateNotifBadge(0);
}

function closeNotifPanel() {
    notifPanelOpen = false;
    document.getElementById('notifPanel')?.classList.remove('open');
}

document.getElementById('notifBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (notifPanelOpen) closeNotifPanel();
    else openNotifPanel();
});

document.getElementById('notifMarkRead')?.addEventListener('click', async () => {
    await window.api.markNotificationsRead();
    updateNotifBadge(0);
    // Refresh the rendered list to remove unread styles
    await loadNotifications();
});

document.getElementById('notifClear')?.addEventListener('click', async () => {
    await window.api.clearNotifications();
    updateNotifBadge(0);
    const list = document.getElementById('notifList');
    if (list) list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
});

// Close panel when clicking outside
document.addEventListener('click', (e) => {
    if (!notifPanelOpen) return;
    const panel = document.getElementById('notifPanel');
    const btn = document.getElementById('notifBtn');
    if (panel && !panel.contains(e.target) && !btn?.contains(e.target)) {
        closeNotifPanel();
    }
});

// Listen for new notifications pushed from main
window.api.onNotificationAdded((data) => {
    updateNotifBadge(data.unreadCount);
    if (notifPanelOpen) {
        loadNotifications();
    }
});

// Update download progress → update the live item in the panel
window.api.onUpdateDownloadProgress(({ percent }) => {
    const item = document.querySelector('[data-update-notif]');
    if (!item) return;
    const body = item.querySelector('.update-notif-body');
    if (body) body.textContent = `Downloading… ${percent}%`;
});

// Update downloaded → swap body to "Ready to install" + Restart button
window.api.onUpdateReady(({ version }) => {
    const item = document.querySelector('[data-update-notif]');
    if (item) {
        const body = item.querySelector('.update-notif-body');
        if (body) {
            body.innerHTML = `v${escapeHtml(String(version))} ready — <button class="notif-restart-btn" style="background:var(--accent-purple);border:none;color:#fff;padding:3px 10px;border-radius:8px;font-size:12px;cursor:pointer;">Restart now</button>`;
            body.querySelector('.notif-restart-btn')?.addEventListener('click', () => window.api.installUpdate());
        }
    }
    // Also update the badge so the user notices
    updateNotifBadge(1);
});

// Init: load unread count on startup
(async () => {
    const count = await window.api.getUnreadNotificationCount();
    updateNotifBadge(count);
})();
