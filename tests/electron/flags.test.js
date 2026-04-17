jest.mock('electron', () => ({
    app: { getPath: jest.fn(() => '/tmp/test-userdata') },
}));

const fs = require('fs');
const path = require('path');

const FLAGS_PATH = '/tmp/test-userdata/feature-flags.json';

beforeEach(() => {
    jest.resetModules();
    fs.mkdirSync('/tmp/test-userdata', { recursive: true });
    try { fs.unlinkSync(FLAGS_PATH); } catch (_) {}
});

afterAll(() => {
    try { fs.unlinkSync(FLAGS_PATH); } catch (_) {}
});

// ─── load ────────────────────────────────────────────────────────────────────

describe('load', () => {
    test('returns defaults when no file exists', () => {
        const { load, DEFAULTS } = require('../../src/electron/flags');
        const flags = load();
        expect(flags).toEqual(DEFAULTS);
    });

    test('merges saved flags with defaults', () => {
        fs.writeFileSync(FLAGS_PATH, JSON.stringify({ 'lab-runs': true }));
        const { load } = require('../../src/electron/flags');
        expect(load()['lab-runs']).toBe(true);
    });

    test('returns defaults when file contains invalid JSON', () => {
        fs.writeFileSync(FLAGS_PATH, 'not json');
        const { load, DEFAULTS } = require('../../src/electron/flags');
        expect(load()).toEqual(DEFAULTS);
    });
});

// ─── setFlag ─────────────────────────────────────────────────────────────────

describe('setFlag', () => {
    test('persists a flag and returns updated flags', () => {
        const { setFlag } = require('../../src/electron/flags');
        const result = setFlag('lab-runs', true);
        expect(result['lab-runs']).toBe(true);
        // Verify it was written to disk
        const saved = JSON.parse(fs.readFileSync(FLAGS_PATH, 'utf8'));
        expect(saved['lab-runs']).toBe(true);
    });

    test('coerces value to boolean', () => {
        const { setFlag } = require('../../src/electron/flags');
        const result = setFlag('lab-runs', 1);
        expect(result['lab-runs']).toBe(true);
    });

    test('throws on unknown flag name', () => {
        const { setFlag } = require('../../src/electron/flags');
        expect(() => setFlag('nonexistent', true)).toThrow('Unknown feature flag: nonexistent');
    });

    test('persists across load() calls', () => {
        const { setFlag, load } = require('../../src/electron/flags');
        setFlag('lab-runs', true);
        const flags = load();
        expect(flags['lab-runs']).toBe(true);
    });
});
