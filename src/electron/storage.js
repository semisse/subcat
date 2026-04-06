const keytar = require('keytar');
const { safeStorage, app } = require('electron');
const fs = require('fs');
const path = require('path');

const SERVICE_NAME = 'SubCat';
const ACCOUNT_NAME = 'github-token';

// Legacy support
const USE_FALLBACK = !safeStorage.isEncryptionAvailable();

function getLegacyTokenFile() {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    return path.join(homeDir, '.config', 'SubCat', 'auth.key');
}

function getSafeStorageFile() {
    return path.join(app.getPath('userData'), 'auth.enc');
}

function ensureDir(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
}

function loadLegacyToken() {
    try {
        // Try fallback location first
        const fallbackFile = getLegacyTokenFile();
        if (fs.existsSync(fallbackFile)) {
            const data = fs.readFileSync(fallbackFile, 'utf8');
            try {
                return Buffer.from(data, 'base64').toString('utf8');
            } catch {
                return data;
            }
        }
        
        // Try safeStorage location
        const safeFile = getSafeStorageFile();
        if (fs.existsSync(safeFile)) {
            if (USE_FALLBACK) {
                const data = fs.readFileSync(safeFile, 'utf8');
                try {
                    return Buffer.from(data, 'base64').toString('utf8');
                } catch {
                    return data;
                }
            } else {
                const encrypted = fs.readFileSync(safeFile);
                return safeStorage.decryptString(encrypted);
            }
        }
    } catch {
        // ignore
    }
    return null;
}

function clearLegacyStorage() {
    try {
        const fallbackFile = getLegacyTokenFile();
        if (fs.existsSync(fallbackFile)) fs.unlinkSync(fallbackFile);
        
        const safeFile = getSafeStorageFile();
        if (fs.existsSync(safeFile)) fs.unlinkSync(safeFile);
    } catch (_) { /* ignore */ }
}

// In-memory cache for the token (synchronous access)
let cachedToken = null;
let migrationDone = false;

async function ensureMigrated() {
    if (migrationDone) return;
    
    // Check if already in keytar
    const keytarToken = await keytar.getPassword(SERVICE_NAME, ACCOUNT_NAME);
    if (keytarToken) {
        cachedToken = keytarToken;
        migrationDone = true;
        return;
    }
    
    // Migrate from legacy if exists
    const legacyToken = loadLegacyToken();
    if (legacyToken) {
        await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, legacyToken);
        cachedToken = legacyToken;
        clearLegacyStorage();
        console.log('[storage] Migrated token from legacy storage to keytar');
    }
    
    migrationDone = true;
}

// Synchronous API for backwards compatibility
function loadToken() {
    // Return cached token synchronously
    // The cache is populated during app initialization
    return cachedToken;
}

async function storeToken(token) {
    await keytar.setPassword(SERVICE_NAME, ACCOUNT_NAME, token);
    cachedToken = token;
}

async function clearToken() {
    await keytar.deletePassword(SERVICE_NAME, ACCOUNT_NAME);
    cachedToken = null;
    clearLegacyStorage();
}

// Initialize the cache (call this during app startup)
async function initialize() {
    await ensureMigrated();
}

module.exports = { 
    initialize,
    loadToken, 
    storeToken, 
    clearToken 
};
