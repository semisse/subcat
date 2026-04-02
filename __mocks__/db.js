module.exports = {
    addRun: jest.fn(),
    updateRun: jest.fn(),
    addRunResult: jest.fn(),
    getActiveRuns: jest.fn(() => []),
    getAllRuns: jest.fn(() => []),
    getRunResults: jest.fn(() => []),
    removeRun: jest.fn(),
    getReport: jest.fn(),
};
