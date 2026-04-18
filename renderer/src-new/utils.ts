// ── Pure Utility Functions ──────────────────────────────────────────────────
// No DOM dependencies. Safe to load first.

export function escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export function isPRUrl(url: string): boolean {
    return /github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(url);
}

export function parseGitHubRunUrl(url: string): { owner: string; repo: string; runId: string } | null {
    const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/actions\/runs\/(\d+)/);
    if (!m) return null;
    return { owner: m[1], repo: m[2], runId: m[3] };
}

export function isWorkflowUrl(url: string): boolean {
    return /github\.com\/[^/]+\/[^/]+\/actions\/workflows\/[^/?#]+/.test(url);
}

export function getCardClass(status: string, conclusion: string | null | undefined): 'completed-success' | 'completed-failure' | 'in-progress' {
    if (status === 'completed') {
        return conclusion === 'success' ? 'completed-success' : 'completed-failure';
    }
    return 'in-progress';
}

export const STATUS_LABELS = {
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
} as const;

export function formatStatus(status: string, conclusion: string | null | undefined): string {
    const key = status === 'completed' ? conclusion : status;
    return STATUS_LABELS[key as keyof typeof STATUS_LABELS] ?? (key ?? '').replace(/_/g, ' ');
}

export const FLAKINESS_THRESHOLD_PCT = 2 as const;

export function flakinessSummary(results: string[], repeatTotal: number): { label: string; cls: 'flakiness-stable' | 'flakiness-warn' | 'flakiness-bad' } | null {
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

export function formatRelativeTime(isoString: string): string {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
}
