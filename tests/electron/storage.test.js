const { EventEmitter } = require('events');

// Mock keytar
const mockKeytar = {
    getPassword: jest.fn(),
    setPassword: jest.fn(),
    deletePassword: jest.fn(),
};

// Mock fs
const mockFs = {
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    unlinkSync: jest.fn(),
};

// Mock electron
const mockSafeStorage = {
    isEncryptionAvailable: jest.fn(() => true),
    encryptString: jest.fn((str) => Buffer.from(str)),
    decryptString: jest.fn((buf) => buf.toString()),
};

const mockApp = {
    getPath: jest.fn(() => '/tmp/test-userData'),
};

// Setup module mocks before any requires
jest.mock('keytar', () => mockKeytar);
jest.mock('fs', () => mockFs);
jest.mock('electron', () => ({
    safeStorage: mockSafeStorage,
    app: mockApp,
}));

describe('storage', () => {
    let storage;
    const SERVICE_NAME = 'SubCat';
    const ACCOUNT_NAME = 'github-token';

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset internal module state
        jest.isolateModules(() => {
            storage = require('../../src/electron/storage');
        });
    });

    afterEach(() => {
        jest.resetModules();
    });

    describe('initialize', () => {
        test('loads token from keytar on init', async () => {
            mockKeytar.getPassword.mockResolvedValue('stored-token');
            
            await storage.initialize();
            
            expect(mockKeytar.getPassword).toHaveBeenCalledWith(SERVICE_NAME, ACCOUNT_NAME);
            expect(storage.loadToken()).toBe('stored-token');
        });

        test('migrates legacy token when keytar is empty but legacy exists', async () => {
            mockKeytar.getPassword.mockResolvedValue(null);
            mockFs.existsSync.mockImplementation((p) => p.includes('.config'));
            mockFs.readFileSync.mockReturnValue(Buffer.from('legacy-token').toString('base64'));
            mockKeytar.setPassword.mockResolvedValue();

            await storage.initialize();

            expect(mockKeytar.setPassword).toHaveBeenCalledWith(SERVICE_NAME, ACCOUNT_NAME, 'legacy-token');
            expect(storage.loadToken()).toBe('legacy-token');
            expect(mockFs.unlinkSync).toHaveBeenCalled();
        });

        test('handles empty storage gracefully', async () => {
            mockKeytar.getPassword.mockResolvedValue(null);
            mockFs.existsSync.mockReturnValue(false);

            await storage.initialize();

            expect(storage.loadToken()).toBeNull();
        });
    });

    describe('storeToken', () => {
        test('stores token in keytar and updates cache', async () => {
            mockKeytar.setPassword.mockResolvedValue();
            
            await storage.storeToken('new-token');
            
            expect(mockKeytar.setPassword).toHaveBeenCalledWith(SERVICE_NAME, ACCOUNT_NAME, 'new-token');
            expect(storage.loadToken()).toBe('new-token');
        });
    });

    describe('clearToken', () => {
        test('removes token from keytar and clears cache', async () => {
            mockKeytar.deletePassword.mockResolvedValue();
            
            await storage.clearToken();
            
            expect(mockKeytar.deletePassword).toHaveBeenCalledWith(SERVICE_NAME, ACCOUNT_NAME);
            expect(storage.loadToken()).toBeNull();
        });
    });

    describe('loadToken', () => {
        test('returns cached token synchronously', async () => {
            mockKeytar.getPassword.mockResolvedValue('cached-token');
            await storage.initialize();
            
            const token = storage.loadToken();
            
            expect(token).toBe('cached-token');
        });

        test('returns null when cache is empty', () => {
            const token = storage.loadToken();
            expect(token).toBeNull();
        });
    });
});
