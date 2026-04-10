// Simple HTTP mock server for E2E tests.
// Routes are registered as plain objects keyed by 'METHOD /path/pattern'.
// Path segments starting with ':' act as wildcards.

const http = require('http');

function matchRoute(fixtures, method, url) {
    const { pathname } = new URL(url, 'http://localhost');
    const reqSegs = pathname.split('/');
    for (const [key, value] of Object.entries(fixtures)) {
        const spaceIdx = key.indexOf(' ');
        const fixtureMethod = key.slice(0, spaceIdx);
        const fixturePath = key.slice(spaceIdx + 1);
        if (fixtureMethod !== method) continue;
        const fixSegs = fixturePath.split('/');
        if (fixSegs.length !== reqSegs.length) continue;
        if (fixSegs.every((seg, i) => seg.startsWith(':') || seg === reqSegs[i])) {
            return value;
        }
    }
    return null;
}

function createMockServer() {
    let fixtures = {};
    let server = null;
    let port = null;

    function setFixtures(newFixtures) {
        fixtures = newFixtures;
    }

    function addFixture(key, response) {
        fixtures[key] = response;
    }

    function start() {
        return new Promise((resolve, reject) => {
            server = http.createServer((req, res) => {
                const match = matchRoute(fixtures, req.method, req.url);
                if (match) {
                    const status = match.status ?? 200;
                    const body = JSON.stringify(match.body ?? {});
                    res.writeHead(status, {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(body),
                    });
                    res.end(body);
                } else {
                    const body = JSON.stringify({ error: `No mock for ${req.method} ${req.url}` });
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(body);
                }
            });
            server.listen(0, '127.0.0.1', () => {
                port = server.address().port;
                resolve(port);
            });
            server.on('error', reject);
        });
    }

    function stop() {
        return new Promise((resolve) => {
            if (server) server.close(resolve);
            else resolve();
        });
    }

    return { start, stop, setFixtures, addFixture, get port() { return port; } };
}

module.exports = { createMockServer };
