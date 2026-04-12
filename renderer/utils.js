// ── Pure Utility Functions ──────────────────────────────────────────────────
// No DOM dependencies. Safe to load first.

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function isPRUrl(url) {
    return /github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(url);
}

function parseGitHubRunUrl(url) {
    const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/actions\/runs\/(\d+)/);
    if (!m) return null;
    return { owner: m[1], repo: m[2], runId: m[3] };
}

function isWorkflowUrl(url) {
    return /github\.com\/[^/]+\/[^/]+\/actions\/workflows\/[^/?#]+/.test(url);
}

function getCardClass(status, conclusion) {
    if (status === 'completed') {
        return conclusion === 'success' ? 'completed-success' : 'completed-failure';
    }
    return 'in-progress';
}

const STATUS_LABELS = {
    queued: 'Queued',
    in_progress: 'Running',
    waiting: 'Waiting',
    pending: 'Pending',
    requested: 'Requested',
    success: 'Passed',
    failure: 'Failed',
    cancelled: 'Cancelled',
    timed_out: 'Timed out',
    action_required: 'Action required',
    neutral: 'Neutral',
    skipped: 'Skipped',
    stale: 'Stale',
    startup_failure: 'Startup failed',
};

function formatStatus(status, conclusion) {
    const key = status === 'completed' ? conclusion : status;
    return STATUS_LABELS[key] ?? (key ?? '').replace(/_/g, ' ');
}

const FLAKINESS_THRESHOLD_PCT = 2;

function flakinessSummary(results, repeatTotal) {
    if (results.length < repeatTotal) return null;
    const failed = results.filter(r => r !== 'success').length;
    const pct = repeatTotal > 0 ? Math.round((failed / repeatTotal) * 100) : 0;
    if (failed === 0) return { label: 'Stable', cls: 'flakiness-stable' };
    if (pct < 50) return {
        label: `Probably flaky — ${failed} of ${repeatTotal} runs failed (${pct}%) · threshold: ${FLAKINESS_THRESHOLD_PCT}%`,
        cls: 'flakiness-warn',
    };
    return {
        label: `Flaky — ${failed} of ${repeatTotal} runs failed (${pct}%) · threshold: ${FLAKINESS_THRESHOLD_PCT}%`,
        cls: 'flakiness-bad',
    };
}

function formatRelativeTime(isoString) {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}
