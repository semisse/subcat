const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
    'lab-runs': false,
};

function getFlagsPath() {
    return path.join(app.getPath('userData'), 'feature-flags.json');
}

function load() {
    try {
        const raw = fs.readFileSync(getFlagsPath(), 'utf8');
        return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {
        return { ...DEFAULTS };
    }
}

function save(flags) {
    fs.writeFileSync(getFlagsPath(), JSON.stringify(flags, null, 2), { mode: 0o600 });
}

function setFlag(name, value) {
    if (!(name in DEFAULTS)) throw new Error(`Unknown feature flag: ${name}`);
    const flags = load();
    flags[name] = Boolean(value);
    save(flags);
    return flags;
}

module.exports = { load, setFlag, DEFAULTS };
