const { safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

function getTokenFile() {
    return path.join(require('electron').app.getPath('userData'), 'auth.enc');
}

function storeToken(token) {
    if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('OS encryption not available');
    }
    const encrypted = safeStorage.encryptString(token);
    fs.writeFileSync(getTokenFile(), encrypted, { mode: 0o600 });
}

function loadToken() {
    try {
        const tokenFile = getTokenFile();
        if (!fs.existsSync(tokenFile)) return null;
        if (!safeStorage.isEncryptionAvailable()) return null;
        const encrypted = fs.readFileSync(tokenFile);
        return safeStorage.decryptString(encrypted);
    } catch {
        return null;
    }
}

function clearToken() {
    try { fs.unlinkSync(getTokenFile()); } catch {}
}

module.exports = { storeToken, loadToken, clearToken };
