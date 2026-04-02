const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    startWatching: (data) => ipcRenderer.invoke('start-watching', data),
    stopWatching: (runId) => ipcRenderer.invoke('stop-watching', runId),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    onRunUpdate: (callback) => ipcRenderer.on('run-update', (_, data) => callback(data)),
    onRunError: (callback) => ipcRenderer.on('run-error', (_, data) => callback(data)),
    onRunReportReady: (callback) => ipcRenderer.on('run-report-ready', (_, data) => callback(data)),
    onRunRestored: (callback) => ipcRenderer.on('run-restored', (_, data) => callback(data)),
    saveReport: (runId) => ipcRenderer.invoke('save-report', runId),

    getVersion: () => ipcRenderer.invoke('get-version'),
    authGetStatus: () => ipcRenderer.invoke('auth-get-status'),
    authStartLogin: () => ipcRenderer.invoke('auth-start-login'),
    authLogout: () => ipcRenderer.invoke('auth-logout'),
    onAuthLoggedIn: (callback) => ipcRenderer.on('auth-logged-in', (_, data) => callback(data)),
    onAuthError: (callback) => ipcRenderer.on('auth-error', (_, data) => callback(data))
});
