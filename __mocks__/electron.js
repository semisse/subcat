module.exports = {
    app: {
        getPath: jest.fn(() => '/tmp/subcat-test'),
    },
    safeStorage: {
        isEncryptionAvailable: jest.fn(() => true),
        encryptString: jest.fn(str => Buffer.from(str)),
        decryptString: jest.fn(buf => buf.toString()),
    },
};
