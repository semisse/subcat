const { contextBridge, ipcRenderer } = require('electron');

// Subscribes `callback` to an IPC event and returns an unsubscribe function.
// The old renderer ignores the return; the new React renderer uses it in
// useEffect cleanup to avoid memory leaks on unmount.
const subscribe = (channel) => (callback) => {
    const listener = (_, data) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
};

const subscribeVoid = (channel) => (callback) => {
    const listener = () => callback();
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('api', {
    startWatching: (data) => ipcRenderer.invoke('start-watching', data),
    fetchUserPRs: () => ipcRenderer.invoke('fetch-user-prs'),
    fetchPRRuns: (url) => ipcRenderer.invoke('fetch-pr-runs', url),
    fetchRunAttempts: (opts) => ipcRenderer.invoke('fetch-run-attempts', opts),
    fetchPRReviews: (opts) => ipcRenderer.invoke('fetch-pr-reviews', opts),
    stopWatching: (runId) => ipcRenderer.invoke('stop-watching', runId),
    confirm: (title, message) => ipcRenderer.invoke('confirm-dialog', { title, message }),
    cancelRun: (runId) => ipcRenderer.invoke('cancel-run', runId),
    rerunRun: (runId) => ipcRenderer.invoke('rerun-run', runId),
    rerunFailedRun: (runId) => ipcRenderer.invoke('rerun-failed-run', runId),
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    onRunUpdate: subscribe('run-update'),
    onRunError: subscribe('run-error'),
    onRunReportReady: subscribe('run-report-ready'),
    onRunRestored: subscribe('run-restored'),
    saveReport: (runId) => ipcRenderer.invoke('save-report', runId),
    savePRWorkflowReport: (data) => ipcRenderer.invoke('save-pr-workflow-report', data),
    rerunRunDirect: (opts) => ipcRenderer.invoke('rerun-run-direct', opts),
    rerunFailedJobsDirect: (opts) => ipcRenderer.invoke('rerun-failed-jobs-direct', opts),
    cancelRunDirect: (opts) => ipcRenderer.invoke('cancel-run-direct', opts),
    watchWorkflowRerun: (opts) => ipcRenderer.invoke('watch-workflow-rerun', opts),
    onWorkflowRunAppeared: subscribe('workflow-run-appeared'),
    pinWorkflow: (url) => ipcRenderer.invoke('pin-workflow', url),
    unpinWorkflow: (id) => ipcRenderer.invoke('unpin-workflow', id),
    onPinnedWorkflowUpdate: subscribe('pinned-workflow-update'),
    onPinnedWorkflowRestored: subscribe('pinned-workflow-restored'),

    getVersion: () => ipcRenderer.invoke('get-version'),
    showAbout: () => ipcRenderer.invoke('show-about'),
    authGetStatus: () => ipcRenderer.invoke('auth-get-status'),
    authStartLogin: () => ipcRenderer.invoke('auth-start-login'),
    authLogout: () => ipcRenderer.invoke('auth-logout'),
    onAuthLoggedIn: subscribe('auth-logged-in'),
    onAuthError: subscribe('auth-error'),
    onOpenNewWatch: subscribeVoid('open-new-watch'),
    saveFailedOnlyAttempt: (opts) => ipcRenderer.invoke('save-failed-only-attempt', opts),
    savePendingRerun: (opts) => ipcRenderer.invoke('save-pending-rerun', opts),
    getPendingRerun: (opts) => ipcRenderer.invoke('get-pending-rerun', opts),
    deletePendingRerun: (opts) => ipcRenderer.invoke('delete-pending-rerun', opts),
    getPRStats: () => ipcRenderer.invoke('get-pr-stats'),
    getSavedReports: () => ipcRenderer.invoke('get-saved-reports'),
    deleteSavedReport: (id) => ipcRenderer.invoke('delete-saved-report', id),
    revealInFinder: (filePath) => ipcRenderer.invoke('reveal-in-finder', filePath),
    readReportFile: (filePath) => ipcRenderer.invoke('read-report-file', filePath),
    getLabRuns: () => ipcRenderer.invoke('get-lab-runs'),
    getRunResult: (id) => ipcRenderer.invoke('get-run-result', id),
    getRunResultsForRun: (runId) => ipcRenderer.invoke('get-run-results-for-run', runId),
    fetchRunJobs: (opts) => ipcRenderer.invoke('fetch-run-jobs', opts),
    getFeatureFlags: () => ipcRenderer.invoke('get-feature-flags'),
    setFeatureFlag: (name, value) => ipcRenderer.invoke('set-feature-flag', { name, value }),
    getNotifications: () => ipcRenderer.invoke('get-notifications'),
    getUnreadNotificationCount: () => ipcRenderer.invoke('get-unread-notification-count'),
    markNotificationsRead: () => ipcRenderer.invoke('mark-notifications-read'),
    clearNotifications: () => ipcRenderer.invoke('clear-notifications'),
    onNotificationAdded: subscribe('notification-added'),
    onUpdateDownloadProgress: subscribe('update-download-progress'),
    onUpdateReady: subscribe('update-ready'),
    installUpdate: () => ipcRenderer.invoke('install-update'),

    // Lab Test
    startLocalRun: (opts) => ipcRenderer.invoke('local-run:start', opts),
    stopLocalRun: (id) => ipcRenderer.invoke('local-run:stop', { id }),
    checkDocker: () => ipcRenderer.invoke('local-run:check-docker'),
    browseFolder: () => ipcRenderer.invoke('local-run:browse-folder'),
    browseEnvFile: () => ipcRenderer.invoke('local-run:browse-env-file'),
    getLocalRuns: () => ipcRenderer.invoke('local-run:list'),
    deleteLocalRun: (id) => ipcRenderer.invoke('local-run:delete', { id }),
    saveLocalRunReport: (id) => ipcRenderer.invoke('local-run:save-report', { id }),
    onLocalRunOutput: subscribe('local-run:output'),
    onLocalRunProgress: subscribe('local-run:progress'),
    onLocalRunDone: subscribe('local-run:done'),
});
