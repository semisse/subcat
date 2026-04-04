const { Notification, shell } = require('electron');

function register(poller, getWindow) {
    poller.on('run:update', (data) => {
        getWindow()?.webContents.send('run-update', data);
    });

    poller.on('run:repeat-done', ({ runNumber, conclusion, name, url, repeatTotal }) => {
        const emoji = conclusion === 'success' ? '✅' : '❌';
        const label = repeatTotal > 1 ? `Run ${runNumber}/${repeatTotal}` : name;
        const notification = new Notification({
            title: `${emoji} ${label}`,
            body: repeatTotal > 1 ? `${name} · ${conclusion}` : conclusion,
        });
        notification.on('click', () => shell.openExternal(url));
        notification.show();
    });

    poller.on('run:all-done', (data) => {
        getWindow()?.webContents.send('run-report-ready', data);
    });

    poller.on('run:error', (data) => {
        getWindow()?.webContents.send('run-error', data);
    });
}

module.exports = { register };
