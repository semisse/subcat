const RealDatabase = jest.requireActual('better-sqlite3');

// Always use in-memory database in tests — no file system, clean state per module reset
module.exports = function MemoryDatabase(_path, options) {
    return new RealDatabase(':memory:', options);
};
