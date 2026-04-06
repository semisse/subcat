const { safeStorage, app } = require('electron');
const fs = require('fs');
const path = require('path');

const USE_FALLBACK = !safeStorage.isEncryptionAvailable();

function getTokenFile() {
    if (USE_FALLBACK) {
        // Use ~/.config/SubCat for fallback storage
        const homeDir = process.env.HOME || process.env.USERPROFILE;
        return path.join(homeDir, '.config', 'SubCat', 'auth.key');
    }
    return path.join(app.getPath('userData'), 'auth.enc');
}

function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
}

function storeToken(token) {
    if (USE_FALLBACK) {
        const tokenFile = getTokenFile();
        ensureDir(tokenFile);
        // Base64 encode as simple obfuscation (not encryption)
        fs.writeFileSync(tokenFile, Buffer.from(token).toString('base64'), { mode: 0o600 });
        return;
    }
    const encrypted = safeStorage.encryptString(token);
    fs.writeFileSync(getTokenFile(), encrypted, { mode: 0o600 });
}

function loadToken() {
    try {
        const tokenFile = getTokenFile();
        if (!fs.existsSync(tokenFile)) return null;
        if (USE_FALLBACK) {
            const data = fs.readFileSync(tokenFile, 'utf8');
            return Buffer.from(data, 'base64').toString('utf8');
        }
        const encrypted = fs.readFileSync(tokenFile);
        return safeStorage.decryptString(encrypted);
    } catch {
        return null;
    }
}

function clearToken() {
    try { fs.unlinkSync(getTokenFile()); } catch (_) { /* file may not exist */ }
}

module.exports = { storeToken, loadToken, clearToken };
