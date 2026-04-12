/**
 * @jest-environment jsdom
 */

const {
    parseGitHubRunUrl,
    isWorkflowUrl,
    isPRUrl,
    getCardClass,
    formatStatus,
    flakinessSummary,
    formatRelativeTime,
} = require('../../renderer/utils');

// ─── parseGitHubRunUrl ───────────────────────────────────────────────────────

describe('parseGitHubRunUrl', () => {
    test('parses a valid GitHub Actions run URL', () => {
        const result = parseGitHubRunUrl('https://github.com/owner/repo/actions/runs/12345');
        expect(result).toEqual({ owner: 'owner', repo: 'repo', runId: '12345' });
    });

    test('returns null for a non-matching URL', () => {
        expect(parseGitHubRunUrl('https://github.com/owner/repo/pull/1')).toBeNull();
    });

    test('returns null for an empty string', () => {
        expect(parseGitHubRunUrl('')).toBeNull();
    });

    test('handles URLs with trailing path segments', () => {
        const result = parseGitHubRunUrl('https://github.com/owner/repo/actions/runs/999/attempts/2');
        expect(result).toEqual({ owner: 'owner', repo: 'repo', runId: '999' });
    });
});

// ─── isWorkflowUrl ───────────────────────────────────────────────────────────

describe('isWorkflowUrl', () => {
    test('returns true for a valid workflow URL', () => {
        expect(isWorkflowUrl('https://github.com/owner/repo/actions/workflows/ci.yml')).toBe(true);
    });

    test('returns false for a run URL', () => {
        expect(isWorkflowUrl('https://github.com/owner/repo/actions/runs/123')).toBe(false);
    });

    test('returns false for a PR URL', () => {
        expect(isWorkflowUrl('https://github.com/owner/repo/pull/1')).toBe(false);
    });
});

// ─── isPRUrl ─────────────────────────────────────────────────────────────────

describe('isPRUrl', () => {
    test('returns true for a valid PR URL', () => {
        expect(isPRUrl('https://github.com/owner/repo/pull/42')).toBe(true);
    });

    test('returns false for a run URL', () => {
        expect(isPRUrl('https://github.com/owner/repo/actions/runs/123')).toBe(false);
    });

    test('returns false for a repo URL without pull', () => {
        expect(isPRUrl('https://github.com/owner/repo')).toBe(false);
    });
});

// ─── getCardClass ────────────────────────────────────────────────────────────

describe('getCardClass', () => {
    test('returns completed-success for completed + success', () => {
        expect(getCardClass('completed', 'success')).toBe('completed-success');
    });

    test('returns completed-failure for completed + failure', () => {
        expect(getCardClass('completed', 'failure')).toBe('completed-failure');
    });

    test('returns in-progress for non-completed status', () => {
        expect(getCardClass('in_progress', null)).toBe('in-progress');
        expect(getCardClass('queued', null)).toBe('in-progress');
    });
});

// ─── formatStatus ────────────────────────────────────────────────────────────

describe('formatStatus', () => {
    test('maps completed + success to Passed', () => {
        expect(formatStatus('completed', 'success')).toBe('Passed');
    });

    test('maps completed + failure to Failed', () => {
        expect(formatStatus('completed', 'failure')).toBe('Failed');
    });

    test('maps in_progress to Running', () => {
        expect(formatStatus('in_progress', null)).toBe('Running');
    });

    test('maps queued to Queued', () => {
        expect(formatStatus('queued', null)).toBe('Queued');
    });

    test('falls back to replacing underscores for unknown keys', () => {
        expect(formatStatus('some_custom_status', null)).toBe('some custom status');
    });

    test('handles null/undefined key gracefully', () => {
        expect(formatStatus(undefined, undefined)).toBe('');
    });
});

// ─── flakinessSummary ────────────────────────────────────────────────────────

describe('flakinessSummary', () => {
    test('returns null when results are incomplete', () => {
        expect(flakinessSummary(['success'], 3)).toBeNull();
    });

    test('returns Stable when all runs pass', () => {
        const result = flakinessSummary(['success', 'success', 'success'], 3);
        expect(result.label).toBe('Stable');
        expect(result.cls).toBe('flakiness-stable');
    });

    test('returns Probably flaky when < 50% fail', () => {
        const result = flakinessSummary(['success', 'failure', 'success', 'success', 'success'], 5);
        expect(result.label).toContain('Probably flaky');
        expect(result.cls).toBe('flakiness-warn');
    });

    test('returns Flaky when >= 50% fail', () => {
        const result = flakinessSummary(['failure', 'failure', 'success'], 3);
        expect(result.label).toContain('Flaky');
        expect(result.cls).toBe('flakiness-bad');
    });

    test('returns Flaky when all runs fail', () => {
        const result = flakinessSummary(['failure', 'failure', 'failure'], 3);
        expect(result.label).toContain('Flaky');
        expect(result.cls).toBe('flakiness-bad');
    });

    test('includes failure count and percentage in label', () => {
        const result = flakinessSummary(['failure', 'success', 'success', 'success'], 4);
        expect(result.label).toContain('1 of 4');
        expect(result.label).toContain('25%');
    });
});

// ─── formatRelativeTime ──────────────────────────────────────────────────────

describe('formatRelativeTime', () => {
    test('returns "just now" for times < 1 minute ago', () => {
        const now = new Date().toISOString();
        expect(formatRelativeTime(now)).toBe('just now');
    });

    test('returns minutes for times < 60 minutes ago', () => {
        const date = new Date(Date.now() - 5 * 60000).toISOString();
        expect(formatRelativeTime(date)).toBe('5m ago');
    });

    test('returns hours for times < 24 hours ago', () => {
        const date = new Date(Date.now() - 3 * 3600000).toISOString();
        expect(formatRelativeTime(date)).toBe('3h ago');
    });

    test('returns days for times >= 24 hours ago', () => {
        const date = new Date(Date.now() - 48 * 3600000).toISOString();
        expect(formatRelativeTime(date)).toBe('2d ago');
    });
});
