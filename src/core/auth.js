const SUBCAT_API_HOST = process.env.SUBCAT_API_HOST || 'api.github.com';
const SUBCAT_API_PORT = process.env.SUBCAT_API_PORT ? parseInt(process.env.SUBCAT_API_PORT, 10) : undefined;
const SUBCAT_API_PROTOCOL = process.env.SUBCAT_API_PROTOCOL || 'https';
const https = require('https'); // used by postForm (always real github.com)
const transport = require(SUBCAT_API_PROTOCOL);

const CLIENT_ID = 'Ov23lixvphyDMyJW3UUm';

function postForm(hostname, urlPath, params) {
    const body = new URLSearchParams(params).toString();
    return new Promise((resolve, reject) => {
        const req = https.request({
            hostname,
            path: urlPath,
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body)
            }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch { reject(new Error(`Bad response: ${data}`)); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function fetchUser(token) {
    return new Promise((resolve, reject) => {
        const req = transport.request({
            hostname: SUBCAT_API_HOST,
            ...(SUBCAT_API_PORT && { port: SUBCAT_API_PORT }),
            path: '/user',
            method: 'GET',
            headers: {
                'User-Agent': 'SubCat-Electron',
                'Accept': 'application/vnd.github+json',
                'Authorization': `Bearer ${token}`
            }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode === 200) resolve(JSON.parse(data));
                else reject(new Error(`GitHub API returned ${res.statusCode}`));
            });
        });
        req.on('error', reject);
        req.end();
    });
}

async function startDeviceFlow() {
    const response = await postForm('github.com', '/login/device/code', {
        client_id: CLIENT_ID,
        scope: 'repo'
    });

    if (response.error) {
        throw new Error(response.error_description || response.error);
    }

    return {
        deviceCode: response.device_code,
        userCode: response.user_code,
        verificationUri: response.verification_uri,
        expiresIn: response.expires_in,
        interval: response.interval || 5
    };
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function pollForToken(deviceCode, interval) {
    const deadline = Date.now() + 600_000;

    while (Date.now() < deadline) {
        await delay(interval * 1000);

        const response = await postForm('github.com', '/login/oauth/access_token', {
            client_id: CLIENT_ID,
            device_code: deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
        });

        if (response.access_token)           return response.access_token;
        if (response.error === 'access_denied')  throw new Error('Login was denied.');
        if (response.error === 'expired_token')  throw new Error('Login timed out. Please try again.');
        if (response.error === 'slow_down')      interval += 5;
        // 'authorization_pending' → continue loop
    }

    throw new Error('Login timed out after 10 minutes.');
}

module.exports = { fetchUser, startDeviceFlow, pollForToken };
