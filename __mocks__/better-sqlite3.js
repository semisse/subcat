// Use Node's built-in SQLite (no native compilation needed) for tests.
// This avoids the NODE_MODULE_VERSION conflict between system Node and Electron.
const { DatabaseSync } = require('node:sqlite');

module.exports = function MemoryDatabase() {
    const db = new DatabaseSync(':memory:');
    // better-sqlite3 has a pragma() helper; node:sqlite does not
    db.pragma = (str) => db.exec(`PRAGMA ${str}`);
    return db;
};
