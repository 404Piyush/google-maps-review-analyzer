// ============================================
// dev-server.js — Local dev server with Vercel-compatible API routing
// Wraps Node's http.ServerResponse to match Vercel's API:
//   res.status(code).json(obj)
//   res.setHeader(name, value)
//   res.end()
// ============================================
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3777;
const ROOT = __dirname;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.mjs':  'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
    '.md':   'text/markdown; charset=utf-8',
    '.txt':  'text/plain; charset=utf-8',
};

function wrapRes(rawRes) {
    let statusCode = 200;
    const headers = {};
    let ended = false;
    let headerWritten = false;
    function ensureHeaders() {
        if (headerWritten) return;
        headerWritten = true;
        rawRes.writeHead(statusCode, {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            ...headers,
        });
    }
    return {
        status(code) {
            statusCode = code;
            return this;
        },
        setHeader(name, value) {
            headers[name] = value;
            return this;
        },
        write(chunk) {
            if (ended) return;
            ensureHeaders();
            rawRes.write(chunk);
            return true;
        },
        json(obj) {
            if (ended) return;
            ended = true;
            const body = JSON.stringify(obj);
            rawRes.writeHead(statusCode, {
                'Content-Type': 'application/json; charset=utf-8',
                ...headers,
            });
            rawRes.end(body);
        },
        send(body) {
            if (ended) return;
            ended = true;
            rawRes.writeHead(statusCode, {
                'Content-Type': 'text/plain; charset=utf-8',
                ...headers,
            });
            rawRes.end(body);
        },
        end(body) {
            if (ended) return;
            ended = true;
            if (body) {
                ensureHeaders();
                rawRes.write(body);
            }
            rawRes.end();
        },
    };
}

const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, `http://localhost:${PORT}`);
        const wrapped = wrapRes(res);

        // Route /api/* → serverless functions
        if (url.pathname.startsWith('/api/')) {
            const apiName = url.pathname.replace('/api/', '').replace(/\.js$/, '');
            const fnPath = path.join(ROOT, 'api', `${apiName}.js`);
            if (!fs.existsSync(fnPath)) {
                wrapped.status(404).json({ ok: false, error: 'function_not_found' });
                return;
            }

            // Parse JSON body for POST
            if (req.method === 'POST') {
                const chunks = [];
                for await (const chunk of req) chunks.push(chunk);
                try {
                    req.body = JSON.parse(Buffer.concat(chunks).toString());
                } catch {
                    req.body = {};
                }
            }

            // Build query object
            req.query = Object.fromEntries(url.searchParams.entries());

            delete require.cache[require.resolve(fnPath)];
            const handler = require(fnPath);
            await handler(req, wrapped);
            return;
        }

        // Static files
        let filePath = path.join(ROOT, url.pathname === '/' ? '/index.html' : url.pathname);
        if (!fs.existsSync(filePath)) {
            res.writeHead(404); res.end('Not found'); return;
        }
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) { filePath = path.join(filePath, 'index.html'); }
        const ext = path.extname(filePath);
        res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            'Cache-Control': 'no-store',
        });
        fs.createReadStream(filePath).pipe(res);
    } catch (err) {
        console.error('[server] error:', err);
        try {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: err.message }));
        } catch {}
    }
});

server.listen(PORT, () => {
    console.log(`[server] http://localhost:${PORT}`);
});