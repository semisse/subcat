// Shared IPC types between main and renderer.
// Pragmatic typing: hot paths strictly typed, long-tail left as `unknown`
// or loose shapes with index signatures. Sharpen as pages migrate.

// ─── Core domain types ───────────────────────────────────────────────────────

export type AuthStatus =
    | { loggedIn: false }
    | { loggedIn: true; login: string; avatarUrl: string; email?: string };

export type AuthStartResult =
    | { userCode: string; verificationUri: string }
    | { error: string };

export type GitHubUser = {
    login: string;
    avatar_url: string;
    email?: string | null;
    [k: string]: unknown;
};

export type PR = {
    id: number;
    number: number;
    title: string;
    html_url: string;
    user: { login: string; avatar_url: string };
    head: {
        sha: string;
        ref: string;
        repo: { name: string; owner: { login: string } } | null;
    };
    created_at: string;
    updated_at: string;
    draft?: boolean;
    state?: string;
    [k: string]: unknown;
};

export type Run = {
    id: number;
    url: string;
    owner: string;
    repo: string;
    workflow_id: number | string;
    name: string;
    repeat_total: number;
    run_number: number | null;
    source: 'manual' | 'pr-auto' | string;
    pr_number: number | null;
    pr_title: string | null;
    status: string;
    conclusion: string | null;
    head_sha: string | null;
    current_run_id: number | null;
};

export type RunResult = {
    run_id: number;
    number: number;
    conclusion: string;
    url: string;
    started_at: string | null;
    completed_at: string | null;
    failed_tests: string[];
};

export type PendingRerun = {
    id: string;
    owner: string;
    repo: string;
    run_id: number | string;
    from_attempt: number;
    total: number;
    saved_at: string;
};

export type SavedReport = {
    id: number;
    title: string;
    type: 'run' | 'pr-workflow' | 'lab-test';
    file_path: string;
    total: number;
    passed: number;
    failed: number;
    flakiness: string;
    saved_at: string;
};

export type Notification = {
    id: number;
    title: string;
    body: string;
    url: string | null;
    conclusion: string;
    run_name: string;
    triggered_at: string;
    read: 0 | 1;
};

export type PRStats = {
    totalRuns: number;
    ciTime: number;
    failureRate: number;
    painIndex: number;
    [k: string]: unknown;
};

export type FeatureFlags = Record<string, boolean>;

export type PinnedWorkflow = {
    id: string;
    owner: string;
    repo: string;
    workflow_file: string;
    name: string;
    url: string;
    latest_run_id: number | null;
    latest_run_status: string | null;
    latest_run_conclusion: string | null;
    latest_run_url: string | null;
};

export type LocalRun = {
    id: number;
    repo_path: string;
    test_command: string;
    cpus: number;
    memory_gb: number;
    repeat_count: number;
    status: 'running' | 'completed' | 'failed' | 'cancelled' | string;
    passed: number | null;
    failed: number | null;
    flaky: number | null;
    failed_test_names: string | null;
    config: string | null;
    started_at: string;
    completed_at: string | null;
};

export type DockerCheckResult = {
    installed: boolean;
    running?: boolean;
    version?: string;
    error?: string;
};

export type LabTestStartInput = {
    repoPath: string;
    testCommand: string;
    envFile?: string;
    envTarget?: string;
    repeat: number;
    cpus: number;
    memoryGb: number;
    randomize?: boolean;
    timezone?: string;
    maxWorkers?: number;
    ulimitNofile?: number;
    networkLatency?: number;
    cpuStress?: number;
    packetLoss?: number;
    staleRead?: number;
    platform?: 'linux/amd64';
    installCommand?: string;
};

export type LabTestResults = {
    passed: number;
    failed: number;
    flaky: number;
    failedTestNames: string[];
    exitCode: number;
    repeat?: number;
    error?: string;
};

// ─── Request payload types (named for clarity) ───────────────────────────────

export type StartWatchingInput = {
    url: string;
    repeatTotal?: number;
    source?: string;
};

export type RunJobsInput = { owner: string; repo: string; runId: number | string };
export type RunAttemptsInput = RunJobsInput;
export type PRReviewsInput = { owner: string; repo: string; prNumber: number };
export type DirectRunTarget = { owner: string; repo: string; runId: number | string };
export type RerunFailedJobsInput = DirectRunTarget & { previousAttemptCount?: number };
export type WatchWorkflowRerunInput = DirectRunTarget & { previousAttemptCount: number };
export type PendingRerunKey = { owner: string; repo: string; runId: number | string };
export type FailedOnlyAttemptInput = PendingRerunKey & { attemptNum: number };
export type PRWorkflowReportInput = { workflowName: string; runs: Array<Record<string, unknown>> };
export type ConfirmDialogInput = { title: string; message: string };
export type SetFeatureFlagInput = { name: string; value: boolean };

// ─── Response helpers ────────────────────────────────────────────────────────

export type ErrorResponse = { error: string };
export type MaybeError<T> = T | ErrorResponse;
export type SaveDialogResponse =
    | { saved: true }
    | { cancelled: true }
    | { error: string };

// ─── Invoke channels: channel name → [request, response] ─────────────────────

export type IpcInvokeMap = {
    // Auth
    'auth-get-status': [void, AuthStatus];
    'auth-start-login': [void, AuthStartResult];
    'auth-logout': [void, { ok: boolean }];

    // Watched runs
    'start-watching': [StartWatchingInput, MaybeError<{ runId: number | string }>];
    'stop-watching': [number | string, { ok: true } | ErrorResponse];
    'cancel-run': [number | string, MaybeError<{ ok: true }>];
    'rerun-run': [number | string, MaybeError<{ ok: true }>];
    'rerun-failed-run': [number | string, MaybeError<{ ok: true }>];

    // Direct (no watching)
    'rerun-run-direct': [DirectRunTarget, MaybeError<{ ok: true }>];
    'rerun-failed-jobs-direct': [RerunFailedJobsInput, MaybeError<{ ok: true }>];
    'cancel-run-direct': [DirectRunTarget, MaybeError<{ ok: true }>];
    'watch-workflow-rerun': [WatchWorkflowRerunInput, MaybeError<{ ok: true }>];

    // Fetch (GitHub API passthrough)
    'fetch-user-prs': [void, MaybeError<PR[]>];
    'fetch-pr-runs': [string, MaybeError<Run[]>];
    'fetch-run-attempts': [RunAttemptsInput, MaybeError<{ attempts: Array<Record<string, unknown>>; failedOnlyAttempts?: number[] }>];
    'fetch-pr-reviews': [PRReviewsInput, MaybeError<Array<Record<string, unknown>>>];
    'fetch-run-jobs': [RunJobsInput, { jobs: Array<Record<string, unknown>> } | ErrorResponse];

    // Pinned workflows
    'pin-workflow': [string, MaybeError<PinnedWorkflow>];
    'unpin-workflow': [string, { ok: true }];

    // Persistence helpers
    'save-failed-only-attempt': [FailedOnlyAttemptInput, void];
    'save-pending-rerun': [PendingRerun, void];
    'get-pending-rerun': [PendingRerunKey, PendingRerun | null];
    'delete-pending-rerun': [PendingRerunKey, void];

    // Stats & history
    'get-pr-stats': [void, PRStats | ErrorResponse];
    'get-lab-runs': [void, LocalRun[] | ErrorResponse];
    'get-run-result': [number, RunResult | ErrorResponse];
    'get-run-results-for-run': [number | string, RunResult[] | ErrorResponse];

    // Reports
    'save-report': [number | string, SaveDialogResponse];
    'save-pr-workflow-report': [PRWorkflowReportInput, SaveDialogResponse];
    'get-saved-reports': [void, SavedReport[]];
    'delete-saved-report': [number, { deleted: true }];
    'read-report-file': [string, { content: string } | ErrorResponse];
    'reveal-in-finder': [string, void];

    // Flags
    'get-feature-flags': [void, FeatureFlags];
    'set-feature-flag': [SetFeatureFlagInput, FeatureFlags];

    // Notification center
    'get-notifications': [void, Notification[]];
    'get-unread-notification-count': [void, number];
    'mark-notifications-read': [void, void];
    'clear-notifications': [void, void];

    // Misc
    'open-external': [string, void];
    'confirm-dialog': [ConfirmDialogInput, boolean];
    'get-version': [void, string];
    'show-about': [void, void];
    'install-update': [void, void];

    // Lab Test (Docker)
    'local-run:start': [LabTestStartInput, { id: number } | ErrorResponse];
    'local-run:stop': [{ id: number }, void];
    'local-run:check-docker': [void, DockerCheckResult];
    'local-run:browse-folder': [void, string | null];
    'local-run:browse-env-file': [void, string | null];
    'local-run:list': [void, LocalRun[]];
    'local-run:get': [{ id: number }, LocalRun];
    'local-run:delete': [{ id: number }, void];
    'local-run:save-report': [{ id: number }, SaveDialogResponse];
};

export type IpcInvokeChannel = keyof IpcInvokeMap;
export type IpcRequest<C extends IpcInvokeChannel> = IpcInvokeMap[C][0];
export type IpcResponse<C extends IpcInvokeChannel> = IpcInvokeMap[C][1];

// ─── Event channels: channel name → payload ──────────────────────────────────

export type RunUpdateEvent = {
    runId: number | string;
    status: string;
    conclusion?: string | null;
    name?: string;
    repeatCurrent?: number;
    repeatTotal?: number;
    results?: string[];
};

export type RunErrorEvent = {
    runId: number | string;
    error: string;
};

export type RunReportReadyEvent = {
    runId: number | string;
    failed: number;
    failedTests: string[];
};

export type RunRestoredEvent = {
    runId: number | string;
    name: string;
    status: string;
    url: string;
    repeatTotal: number;
    repeatCurrent: number;
    results: string[];
    source: string;
    failed: number;
};

export type WorkflowRunAppearedEvent = {
    owner: string;
    repo: string;
    runId: number | string;
};

export type PinnedWorkflowEvent = {
    id: string;
    latestRunStatus?: string | null;
    latestRunConclusion?: string | null;
    latestRunUrl?: string | null;
    latestRunId?: number | null;
    [k: string]: unknown;
};

export type NotificationAddedEvent = Notification & { unreadCount: number };

export type UpdateDownloadProgressEvent = { percent: number };
export type UpdateReadyEvent = { version: string };

export type LocalRunOutputEvent = { id: number; line: string };
export type LocalRunProgressEvent = { id: number; completed: number; total: number };
export type LocalRunDoneEvent = { id: number; results: LabTestResults };

export type IpcEventMap = {
    'run-update': RunUpdateEvent;
    'run-error': RunErrorEvent;
    'run-report-ready': RunReportReadyEvent;
    'run-restored': RunRestoredEvent;
    'workflow-run-appeared': WorkflowRunAppearedEvent;
    'pinned-workflow-update': PinnedWorkflowEvent;
    'pinned-workflow-restored': PinnedWorkflowEvent;
    'auth-logged-in': { user: GitHubUser };
    'auth-error': { error: string };
    'open-new-watch': void;
    'notification-added': NotificationAddedEvent;
    'update-download-progress': UpdateDownloadProgressEvent;
    'update-ready': UpdateReadyEvent;
    'local-run:output': LocalRunOutputEvent;
    'local-run:progress': LocalRunProgressEvent;
    'local-run:done': LocalRunDoneEvent;
};

export type IpcEventChannel = keyof IpcEventMap;
export type IpcEventPayload<C extends IpcEventChannel> = IpcEventMap[C];

// ─── window.api shape (consumed by renderer) ─────────────────────────────────
// This mirrors renderer/preload.js exactly. Keep in sync until Phase 7 cutover
// rewrites preload.js → preload.ts using these types as source of truth.

export type WindowApi = {
    // Watched runs
    startWatching: (data: StartWatchingInput) => Promise<IpcResponse<'start-watching'>>;
    stopWatching: (runId: number | string) => Promise<IpcResponse<'stop-watching'>>;
    cancelRun: (runId: number | string) => Promise<IpcResponse<'cancel-run'>>;
    rerunRun: (runId: number | string) => Promise<IpcResponse<'rerun-run'>>;
    rerunFailedRun: (runId: number | string) => Promise<IpcResponse<'rerun-failed-run'>>;

    // Direct
    rerunRunDirect: (opts: DirectRunTarget) => Promise<IpcResponse<'rerun-run-direct'>>;
    rerunFailedJobsDirect: (opts: RerunFailedJobsInput) => Promise<IpcResponse<'rerun-failed-jobs-direct'>>;
    cancelRunDirect: (opts: DirectRunTarget) => Promise<IpcResponse<'cancel-run-direct'>>;
    watchWorkflowRerun: (opts: WatchWorkflowRerunInput) => Promise<IpcResponse<'watch-workflow-rerun'>>;

    // Fetch
    fetchUserPRs: () => Promise<IpcResponse<'fetch-user-prs'>>;
    fetchPRRuns: (url: string) => Promise<IpcResponse<'fetch-pr-runs'>>;
    fetchRunAttempts: (opts: RunAttemptsInput) => Promise<IpcResponse<'fetch-run-attempts'>>;
    fetchPRReviews: (opts: PRReviewsInput) => Promise<IpcResponse<'fetch-pr-reviews'>>;
    fetchRunJobs: (opts: RunJobsInput) => Promise<IpcResponse<'fetch-run-jobs'>>;

    // Pinned
    pinWorkflow: (url: string) => Promise<IpcResponse<'pin-workflow'>>;
    unpinWorkflow: (id: string) => Promise<IpcResponse<'unpin-workflow'>>;

    // Persistence
    saveFailedOnlyAttempt: (opts: FailedOnlyAttemptInput) => Promise<void>;
    savePendingRerun: (opts: PendingRerun) => Promise<void>;
    getPendingRerun: (opts: PendingRerunKey) => Promise<IpcResponse<'get-pending-rerun'>>;
    deletePendingRerun: (opts: PendingRerunKey) => Promise<void>;

    // Stats & history
    getPRStats: () => Promise<IpcResponse<'get-pr-stats'>>;
    getLabRuns: () => Promise<IpcResponse<'get-lab-runs'>>;
    getRunResult: (id: number) => Promise<IpcResponse<'get-run-result'>>;
    getRunResultsForRun: (runId: number | string) => Promise<IpcResponse<'get-run-results-for-run'>>;

    // Reports
    saveReport: (runId: number | string) => Promise<IpcResponse<'save-report'>>;
    savePRWorkflowReport: (data: PRWorkflowReportInput) => Promise<IpcResponse<'save-pr-workflow-report'>>;
    getSavedReports: () => Promise<IpcResponse<'get-saved-reports'>>;
    deleteSavedReport: (id: number) => Promise<IpcResponse<'delete-saved-report'>>;
    readReportFile: (filePath: string) => Promise<IpcResponse<'read-report-file'>>;
    revealInFinder: (filePath: string) => Promise<void>;

    // Flags
    getFeatureFlags: () => Promise<FeatureFlags>;
    setFeatureFlag: (name: string, value: boolean) => Promise<FeatureFlags>;

    // Notifications
    getNotifications: () => Promise<Notification[]>;
    getUnreadNotificationCount: () => Promise<number>;
    markNotificationsRead: () => Promise<void>;
    clearNotifications: () => Promise<void>;

    // Misc
    openExternal: (url: string) => Promise<void>;
    confirm: (title: string, message: string) => Promise<boolean>;
    getVersion: () => Promise<string>;
    showAbout: () => Promise<void>;
    installUpdate: () => Promise<void>;

    // Auth
    authGetStatus: () => Promise<AuthStatus>;
    authStartLogin: () => Promise<AuthStartResult>;
    authLogout: () => Promise<{ ok: boolean }>;

    // Lab Test
    startLocalRun: (opts: LabTestStartInput) => Promise<IpcResponse<'local-run:start'>>;
    stopLocalRun: (id: number) => Promise<void>;
    checkDocker: () => Promise<DockerCheckResult>;
    browseFolder: () => Promise<string | null>;
    browseEnvFile: () => Promise<string | null>;
    getLocalRuns: () => Promise<LocalRun[]>;
    deleteLocalRun: (id: number) => Promise<void>;
    saveLocalRunReport: (id: number) => Promise<SaveDialogResponse>;

    // Event subscriptions — each returns an unsubscribe function
    onRunUpdate: (cb: (data: RunUpdateEvent) => void) => () => void;
    onRunError: (cb: (data: RunErrorEvent) => void) => () => void;
    onRunReportReady: (cb: (data: RunReportReadyEvent) => void) => () => void;
    onRunRestored: (cb: (data: RunRestoredEvent) => void) => () => void;
    onWorkflowRunAppeared: (cb: (data: WorkflowRunAppearedEvent) => void) => () => void;
    onPinnedWorkflowUpdate: (cb: (data: PinnedWorkflowEvent) => void) => () => void;
    onPinnedWorkflowRestored: (cb: (data: PinnedWorkflowEvent) => void) => () => void;
    onAuthLoggedIn: (cb: (data: { user: GitHubUser }) => void) => () => void;
    onAuthError: (cb: (data: { error: string }) => void) => () => void;
    onOpenNewWatch: (cb: () => void) => () => void;
    onNotificationAdded: (cb: (data: NotificationAddedEvent) => void) => () => void;
    onUpdateDownloadProgress: (cb: (data: UpdateDownloadProgressEvent) => void) => () => void;
    onUpdateReady: (cb: (data: UpdateReadyEvent) => void) => () => void;
    onLocalRunOutput: (cb: (data: LocalRunOutputEvent) => void) => () => void;
    onLocalRunProgress: (cb: (data: LocalRunProgressEvent) => void) => () => void;
    onLocalRunDone: (cb: (data: LocalRunDoneEvent) => void) => () => void;
};
