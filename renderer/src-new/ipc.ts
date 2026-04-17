// Typed re-export of window.api so renderer code imports from one place
// instead of reaching into globals. Runtime is still the preload bridge —
// this module only adds types on top.

import type { WindowApi } from '../../src/shared/ipc';

export const api: WindowApi = window.api;

// Re-export the shared types so consumers can import from one module.
export type {
    WindowApi,
    AuthStatus,
    AuthStartResult,
    PR,
    Run,
    RunResult,
    PendingRerun,
    SavedReport,
    Notification,
    PRStats,
    FeatureFlags,
    PinnedWorkflow,
    LocalRun,
    DockerCheckResult,
    LabTestStartInput,
    LabTestResults,
    StartWatchingInput,
    RunJobsInput,
    RunAttemptsInput,
    PRReviewsInput,
    DirectRunTarget,
    RerunFailedJobsInput,
    WatchWorkflowRerunInput,
    PendingRerunKey,
    FailedOnlyAttemptInput,
    PRWorkflowReportInput,
    ConfirmDialogInput,
    SetFeatureFlagInput,
    ErrorResponse,
    MaybeError,
    SaveDialogResponse,
    RunUpdateEvent,
    RunErrorEvent,
    RunReportReadyEvent,
    RunRestoredEvent,
    WorkflowRunAppearedEvent,
    PinnedWorkflowEvent,
    NotificationAddedEvent,
    UpdateDownloadProgressEvent,
    UpdateReadyEvent,
    LocalRunOutputEvent,
    LocalRunProgressEvent,
    LocalRunDoneEvent,
} from '../../src/shared/ipc';
