// ============================================
// gosom-proxy.js — auth + NDJSON wrapper around gosom/google-maps-scraper
// Runs on PORT (default 8080). gosom runs internally on GOSOM_INTERNAL_PORT.
// Endpoints:
//   GET  /health                → {ok, uptime_s, version, in_flight}
//   GET  /scrape?url=…&key=…    → NDJSON stream (meta → batches → done|error)
// Same NDJSON format our Vercel /api/scrape already understands.
// ============================================
'use strict';
const http = require('http');
const { URL } = require('url');
const https = require('https');

const PORT = Number(process.env.PORT || 8080);
const GOSOM = process.env.GOSOM_API || 'http://127.0.0.1:8888';
const SCRAPER_API_KEY = process.env.SCRAPER_API_KEY || '';
const VERSION = '1.8.0';

const startedAt = Date.now();
let inFlight = 0;
let lastResult = null;

// Resolve a Google Maps short URL by following redirects once.
function resolveShortUrl(rawUrl, hops = 0) {
    return new Promise((resolve) => {
        if (hops > 5) return resolve(rawUrl);
        try {
            const u = new URL(rawUrl);
            if (!u.hostname.includes('goo.gl') && !u.hostname.includes('maps.app')) {
                return resolve(rawUrl);
            }
            const mod = u.protocol === 'https:' ? https : require('http');
            const req = mod.request({
                hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
                headers: { 'User-Agent': 'Mozilla/5.0' },
            }, (res) => {
                res.resume();
                const next = res.headers.location;
                if (next && (next.startsWith('http') || next.startsWith('/'))) {
                    const abs = next.startsWith('http') ? next : new URL(next, rawUrl).toString();
                    if (abs !== rawUrl) return resolveShortUrl(abs, hops + 1);
                }
                resolve(rawUrl);
            });
            req.on('error', () => resolve(rawUrl));
            req.setTimeout(5000, () => { req.destroy(); resolve(rawUrl); });
            req.end();
        } catch { resolve(rawUrl); }
    });
}

async function gosomPostJob(url, maxTimeMs) {
    const body = JSON.stringify({
        name: 'scrape-' + Date.now(),
        keywords: [url],
        lang: 'en',
        depth: 1,
        max_time: maxTimeMs,
    });
    return new Promise((resolve, reject) => {
        const u = new URL('/api/v1/jobs', GOSOM);
        const req = http.request({
            hostname: u.hostname, port: u.port || 80, path: u.pathname,
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, (res) => {
            let data = '';
            res.on('data', (d) => data += d);
            res.on('end', () => {
                if (res.statusCode >= 400) return reject(new Error(`gosom POST ${res.statusCode}: ${data.slice(0, 200)}`));
                try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('bad JSON: ' + data.slice(0, 200))); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function gosomGetJob(id) {
    return new Promise((resolve, reject) => {
        http.get(new URL(`/api/v1/jobs/${id}`, GOSOM), (res) => {
            let data = '';
            res.on('data', (d) => data += d);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function gosomDownload(id) {
    return new Promise((resolve, reject) => {
        http.get(new URL(`/api/v1/jobs/${id}/download`, GOSOM), (res) => {
            if (res.statusCode >= 400) { res.resume(); return reject(new Error(`download ${res.statusCode}`)); }
            let data = '';
            res.setEncoding('utf8');
            res.on('data', (d) => data += d);
            res.on('end', () => {
                try { resolve(JSON.parse(data)); } catch (e) { reject(new Error('bad json: ' + e.message)); }
            });
        }).on('error', reject);
    });
}

function pickTitle(record) {
    return record.title || record.name || record.business_name || 'Unknown';
}

function pickPlaceSlug(record, url) {
    const slug = (record.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    return slug || (new URL(url).pathname.split('/').filter(Boolean).pop() || 'place').slice(0, 40);
}

// Translate gosom record → our review schema.
function toReviews(record) {
    const ext = record.user_reviews_extended || record.user_reviews || [];
    return ext.map((r) => ({
        name: r.author || r.user || 'Anonymous',
        time: r.review_date || r.relative_time || r.date || '',
        stars: Number(r.rating) || 0,
        text: r.review_text || r.text || '',
    })).filter((r) => r.text);
}

function sendNdjson(res, obj) {
    res.write(JSON.stringify(obj) + '\n');
}

const server = http.createServer(async (req, res) => {
    // CORS preflight (allow Vercel frontend to hit us)
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, X-Scraper-Key',
        });
        return res.end();
    }

    // /health — open, no auth
    if (req.method === 'GET' && req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
            ok: true,
            uptime_s: Math.round((Date.now() - startedAt) / 1000),
            in_flight: inFlight,
            last_result: lastResult,
            version: VERSION,
        }));
    }

    // /scrape — auth + NDJSON stream
    if (req.method === 'GET' && req.url.startsWith('/scrape')) {
        const u = new URL(req.url, 'http://x');
        const targetUrl = u.searchParams.get('url');
        const key = u.searchParams.get('key') || req.headers['x-scraper-key'] || '';

        // Auth gate
        if (SCRAPER_API_KEY && key !== SCRAPER_API_KEY) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: false, error: 'unauthorized' }));
        }
        if (!targetUrl) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: false, error: 'missing url' }));
        }
        try {
            const scheme = new URL(targetUrl).protocol;
            if (scheme !== 'http:' && scheme !== 'https:') {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                return res.end(JSON.stringify({ ok: false, error: 'url must be http(s)' }));
            }
        } catch {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify({ ok: false, error: 'bad url' }));
        }

        inFlight++;
        lastResult = null;
        res.writeHead(200, {
            'Content-Type': 'application/x-ndjson',
            'Cache-Control': 'no-cache',
            'Access-Control-Allow-Origin': '*',
        });

        try {
            const resolvedUrl = await resolveShortUrl(targetUrl);
            sendNdjson(res, { type: 'meta', url: targetUrl, resolved_url: resolvedUrl, ts: new Date().toISOString() });

            const job = await gosomPostJob(resolvedUrl, 90_000);
            const jobId = job.id || job.ID;
            if (!jobId) throw new Error('gosom did not return a job id: ' + JSON.stringify(job).slice(0, 200));

            // Poll until ok/failed, with batch heartbeat
            const startPoll = Date.now();
            const pollEvery = 3000;
            const totalTimeout = 95_000;
            let final = null;
            while (Date.now() - startPoll < totalTimeout) {
                await new Promise((r) => setTimeout(r, pollEvery));
                const { status, body } = await gosomGetJob(jobId);
                if (status !== 200) continue;
                const s = (body.Status || body.status || '').toLowerCase();
                const elapsedS = Math.round((Date.now() - startPoll) / 1000);
                sendNdjson(res, { type: 'progress', elapsed_s: elapsedS, status: s });
                if (s === 'ok' || s === 'failed' || s === 'completed' || s === 'error') { final = body; break; }
            }
            if (!final) {
                sendNdjson(res, { type: 'error', error: 'timeout', message: 'Scraper did not complete in 95s' });
                lastResult = { ok: false, reason: 'timeout' };
                return res.end();
            }

            const finalStatus = (final.Status || final.status || '').toLowerCase();
            if (finalStatus === 'failed' || finalStatus === 'error') {
                sendNdjson(res, { type: 'error', error: 'gosom_failed', message: 'Scraper returned error' });
                lastResult = { ok: false, reason: 'failed' };
                return res.end();
            }

            // Download JSON results
            const records = await gosomDownload(jobId);
            if (!Array.isArray(records) || records.length === 0) {
                sendNdjson(res, { type: 'error', error: 'no_results', message: 'Scraper returned no records' });
                lastResult = { ok: false, reason: 'no_results' };
                return res.end();
            }

            const record = records[0];
            const reviews = toReviews(record);

            // Stream reviews in batches
            const batchSize = 8;
            for (let i = 0; i < reviews.length; i += batchSize) {
                const batch = reviews.slice(i, i + batchSize);
                sendNdjson(res, {
                    type: 'batch',
                    count: batch.length,
                    scraped: Math.min(i + batchSize, reviews.length),
                    total: reviews.length,
                    reviews: batch,
                });
                await new Promise((r) => setTimeout(r, 80));
            }

            sendNdjson(res, {
                type: 'done',
                source: 'gosom',
                scraped_at: new Date().toISOString(),
                total_scraped: reviews.length,
                place: {
                    name: pickTitle(record),
                    slug: pickPlaceSlug(record, resolvedUrl),
                    address: record.address || record.complete_address || '',
                    rating: Number(record.review_rating) || null,
                    review_count: Number(record.review_count) || reviews.length,
                    phone: record.phone || '',
                    website: record.website || '',
                    latitude: Number(record.latitude) || null,
                    longitude: Number(record.longitude) || null,
                    url: record.link || resolvedUrl,
                },
            });
            lastResult = { ok: true, count: reviews.length, place: pickTitle(record) };
        } catch (e) {
            sendNdjson(res, { type: 'error', error: 'exception', message: e.message });
            lastResult = { ok: false, reason: 'exception', error: e.message };
        } finally {
            inFlight--;
            res.end();
        }
        return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'not found' }));
});

server.listen(PORT, () => {
    console.log(`[gosom-proxy] listening on :${PORT}, gosom at ${GOSOM}, auth=${SCRAPER_API_KEY ? 'on' : 'off'}`);
});