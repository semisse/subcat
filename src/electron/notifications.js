const { Notification, shell } = require('electron');

function register(poller, getWindow, db) {
    poller.on('run:update', (data) => {
        getWindow()?.webContents.send('run-update', data);
    });

    poller.on('run:repeat-done', ({ runNumber, conclusion, name, url, repeatTotal }) => {
        const emoji = conclusion === 'success' ? '✅' : '❌';
        const label = repeatTotal > 1 ? `Run ${runNumber}/${repeatTotal}` : name;
        const title = `${emoji} ${label}`;
        const body = repeatTotal > 1 ? `${name} · ${conclusion}` : conclusion;

        const notification = new Notification({ title, body });
        notification.on('click', () => shell.openExternal(url));
        notification.show();

        // Persist to notification log
        if (db) {
            const record = db.addNotification({ title, body, url, conclusion, runName: name });
            const unread = db.getUnreadNotificationCount();
            getWindow()?.webContents.send('notification-added', {
                id: record.lastInsertRowid,
                title,
                body,
                url,
                conclusion,
                run_name: name,
                triggered_at: new Date().toISOString(),
                read: 0,
                unreadCount: unread,
            });
        }
    });

    poller.on('run:all-done', (data) => {
        getWindow()?.webContents.send('run-report-ready', data);
    });

    poller.on('run:error', (data) => {
        getWindow()?.webContents.send('run-error', data);
    });
}

module.exports = { register };
