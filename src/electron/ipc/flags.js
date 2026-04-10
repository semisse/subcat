const { ipcMain } = require('electron');
const flags = require('../flags');

function handle(channel, handler) {
    try {
        ipcMain.handle(channel, handler);
    } catch {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, handler);
    }
}

function register() {
    handle('get-feature-flags', () => flags.load());
    handle('set-feature-flag', (event, { name, value }) => flags.setFlag(name, value));
}

module.exports = { register };
