const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    startWatching: (data) => ipcRenderer.invoke('start-watching', data),
    fetchUserPRs: () => ipcRenderer.invoke('fetch-user-prs'),
    fetchPRRuns: (url) => ipcRenderer.invoke('fetch-pr-runs', url),
    fetchWorkflowPRRuns: (opts) => ipcRenderer.invoke('fetch-workflow-pr-runs', opts),
    stopWatching: (runId) => ipcRenderer.invoke('stop-watching', runId),
    confirm: (title, message) => ipcRenderer.invoke('confirm-dialog', { title, message }),
    cancelRun: (runId) => ipcRenderer.invoke('cancel-run', runId),
    rerunRun: (runId) => ipcRenderer.invoke('rerun-run', runId),
    rerunFailedRun: (runId) => ipcRenderer.invoke('rerun-failed-run', runId),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    onRunUpdate: (callback) => ipcRenderer.on('run-update', (_, data) => callback(data)),
    onRunError: (callback) => ipcRenderer.on('run-error', (_, data) => callback(data)),
    onRunReportReady: (callback) => ipcRenderer.on('run-report-ready', (_, data) => callback(data)),
    onRunRestored: (callback) => ipcRenderer.on('run-restored', (_, data) => callback(data)),
    saveReport: (runId) => ipcRenderer.invoke('save-report', runId),
    savePRWorkflowReport: (data) => ipcRenderer.invoke('save-pr-workflow-report', data),

    getVersion: () => ipcRenderer.invoke('get-version'),
    showAbout: () => ipcRenderer.invoke('show-about'),
    refreshRuns: () => ipcRenderer.invoke('refresh-runs'),
    authGetStatus: () => ipcRenderer.invoke('auth-get-status'),
    authStartLogin: () => ipcRenderer.invoke('auth-start-login'),
    authLogout: () => ipcRenderer.invoke('auth-logout'),
    onAuthLoggedIn: (callback) => ipcRenderer.on('auth-logged-in', (_, data) => callback(data)),
    onAuthError: (callback) => ipcRenderer.on('auth-error', (_, data) => callback(data))
});
