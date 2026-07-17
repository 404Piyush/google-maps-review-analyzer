/**
 * scraper-server.js — Headless HTTP wrapper around index.js's scrape().
 *
 * Endpoints:
 *   GET /health                 → {ok, uptimeS, lastResult}
 *   GET /scrape?url=...         → NDJSON stream: meta → batches → done | error
 *
 * Env:
 *   PORT                 listen port (default 8080)
 *   SCRAPER_API_KEY      optional shared secret; if set, callers must pass `?key=`
 *   NO_PROXY=1           skip proxy list entirely (useful for cheap hosts without IPv4 egress)
 *   HEADED=1             run Puppeteer headed (debug only, need Xvfb)
 *   FAST=1               skip screenshots
 *   CACHE_TTL_HOURS=24   override cache TTL
 *
 * Deploy: see Dockerfile + render.yaml. Runs as a stateless service on Render free tier.
 */

require('dotenv').config();
const express = require('express');
const { scrape } = require('./index');

const app = express();
const PORT = Number(process.env.PORT || 8080);

const STATE = {
    startedAt: Date.now(),
    lastResult: null,
    inFlight: 0,
};

function checkKey(req, res, next) {
    const required = process.env.SCRAPER_API_KEY;
    if (!required) return next();
    const provided = req.query.key || req.headers['x-scraper-key'];
    if (provided !== required) return res.status(401).json({ ok: false, error: 'unauthorized' });
    next();
}

function writeNdjson(res, obj) {
    res.write(JSON.stringify(obj) + '\n');
}

function pickReviewsSubset(reviews, max = 50) {
    if (!Array.isArray(reviews)) return [];
    return reviews.slice(0, max);
}

app.get('/health', (_req, res) => {
    res.json({
        ok: true,
        uptimeS: Math.round((Date.now() - STATE.startedAt) / 1000),
        in_flight: STATE.inFlight,
        last_result: STATE.lastResult,
        version: process.env.npm_package_version || require('./package.json').version,
    });
});

app.get('/scrape', checkKey, async (req, res) => {
    const url = (req.query.url || '').trim();
    if (!url) return res.status(400).json({ ok: false, error: 'missing_url', message: 'Provide ?url=https://maps.app.goo.gl/…' });
    if (!/^https?:\/\//i.test(url)) return res.status(400).json({ ok: false, error: 'bad_url', message: 'Must start with http(s)' });

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Scraper-Key');
    res.flushHeaders?.();

    STATE.inFlight += 1;
    const t0 = Date.now();
    const log = (m) => console.log(`[scrape ${new Date().toISOString()}] ${m}`);

    log(`start url=${url}`);
    writeNdjson(res, { type: 'meta', url, ts: new Date().toISOString() });

    try {
        const result = await scrape(url, {
            skipProxy: process.env.NO_PROXY === '1',
            fast: process.env.FAST === '1',
            headless: process.env.HEADED !== '1',
        });

        if (!result.ok) {
            log(`fail reason=${result.reason} elapsed=${Date.now() - t0}ms`);
            writeNdjson(res, { type: 'error', error: result.reason || 'unknown', elapsedMs: Date.now() - t0 });
            STATE.lastResult = { ok: false, reason: result.reason };
            return res.end();
        }

        const reviews = pickReviewsSubset(result.reviews);
        const BATCH_SIZE = 8;
        let scraped = 0;
        for (let i = 0; i < reviews.length; i += BATCH_SIZE) {
            const batch = reviews.slice(i, i + BATCH_SIZE);
            scraped += batch.length;
            writeNdjson(res, {
                type: 'batch',
                count: batch.length,
                scraped,
                total: reviews.length,
                reviews: batch,
            });
            if (i + BATCH_SIZE < reviews.length) await new Promise(r => setTimeout(r, 80));
        }

        log(`ok count=${result.count} source=${result.source} elapsed=${Date.now() - t0}ms`);
        writeNdjson(res, {
            type: 'done',
            source: result.source,
            total_scraped: reviews.length,
            full_count: result.count,
            elapsed_ms: Date.now() - t0,
        });
        STATE.lastResult = { ok: true, count: result.count, source: result.source };
        res.end();
    } catch (err) {
        log(`crash: ${err.message}`);
        writeNdjson(res, { type: 'error', error: 'crash', message: err.message });
        STATE.lastResult = { ok: false, error: err.message };
        try { res.end(); } catch { /* already ended */ }
    } finally {
        STATE.inFlight -= 1;
    }
});

app.options('*', (_req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Scraper-Key');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.status(204).end();
});

app.use((err, _req, res, _next) => {
    console.error('[server] unhandled:', err);
    res.status(500).json({ ok: false, error: 'internal_error', message: err.message });
});

const server = app.listen(PORT, () => {
    console.log(`[scraper-server] listening on :${PORT} (uptime=${Math.round(process.uptime())}s)`);
});

function shutdown(sig) {
    console.log(`[scraper-server] ${sig} — draining`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
