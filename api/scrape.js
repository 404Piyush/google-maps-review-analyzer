/**
 * /api/scrape — Streams scraped reviews for a place.
 *
 * Query params:
 *   url=...    Google Maps URL (short or full)
 *   query=...  Text query like "Café de Flore Paris"
 *   id=...     Known place id (cafe-de-flore, etc.)
 *
 * Response: NDJSON stream (one JSON object per line)
 *   {"type":"meta","place":{...},"total_estimate":N}
 *   {"type":"batch","count":N,"reviews":[...]}
 *   {"type":"done","source":"cache","scraped_at":"..."}
 *   {"type":"error","message":"..."}
 *
 * Pipeline:
 *   1. Resolve Maps short URL → extract place identifier
 *   2. Look up cached scrape in /cache/reviews/<id>.json
 *   3. Stream the reviews in chunks so the client sees count growing
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const CACHE_DIR = path.join(process.cwd(), 'cache', 'reviews');
const BATCH_SIZE = 8;
const BATCH_DELAY_MS = 140; // visual pacing so the count can be seen

// ============================================
// Resolve a Google Maps short URL → final URL
// ============================================
function resolveShortUrl(shortUrl) {
    return new Promise((resolve, reject) => {
        const url = new URL(shortUrl);
        const req = https.request({
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'GET',
        }, (res) => {
            res.resume();
            resolve({ finalUrl: res.headers.location || shortUrl });
        });
        req.on('error', reject);
        req.setTimeout(8000, () => req.destroy(new Error('Timeout resolving short URL')));
        req.end();
    });
}

// ============================================
// Extract place identifier from a Maps URL
// ============================================
function extractPlaceFromUrl(mapsUrl) {
    try {
        const url = new URL(mapsUrl);
        const placeMatch = url.pathname.match(/\/maps\/place\/([^/]+)/);
        if (placeMatch) return decodeURIComponent(placeMatch[1]).replace(/\+/g, ' ');
        return null;
    } catch {
        return null;
    }
}

function slugify(s) {
    return String(s)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function loadCache(placeId) {
    const filePath = path.join(CACHE_DIR, `${placeId}.json`);
    if (!fs.existsSync(filePath)) return null;
    try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { return null; }
}

// ============================================
// Stream helpers
// ============================================
function writeLine(res, obj) {
    res.write(JSON.stringify(obj) + '\n');
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ============================================
// Main handler
// ============================================
module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') {
        writeLine(res, { type: 'error', error: 'method_not_allowed', message: 'GET only' });
        return res.end();
    }

    const q = req.query || {};
    const mapsUrl = (q.url || '').trim();
    const textQuery = (q.query || '').trim();
    const placeIdHint = (q.id || '').trim();

    try {
        // ---- Resolve which cache file to read ----
        let cacheSlug = null;
        let cache = null;
        let extraMeta = {};

        if (placeIdHint) {
            cacheSlug = slugify(placeIdHint);
            cache = loadCache(cacheSlug);
        } else if (textQuery) {
            cacheSlug = slugify(textQuery);
            cache = loadCache(cacheSlug);
        } else if (mapsUrl) {
            let resolvedUrl = mapsUrl;
            if (mapsUrl.includes('maps.app.goo.gl') || mapsUrl.includes('goo.gl')) {
                try {
                    const r = await resolveShortUrl(mapsUrl);
                    resolvedUrl = r.finalUrl;
                } catch (err) {
                    writeLine(res, { type: 'error', error: 'resolve_failed', message: err.message });
                    return res.end();
                }
            }
            const placeName = extractPlaceFromUrl(resolvedUrl);
            extraMeta = { resolved_url: resolvedUrl, resolved_place: placeName };
            if (placeName) {
                cacheSlug = slugify(placeName);
                cache = loadCache(cacheSlug);
            }
        } else {
            writeLine(res, { type: 'error', error: 'missing_param', message: 'Provide ?url= or ?query= or ?id=' });
            return res.end();
        }

        if (!cache) {
            writeLine(res, {
                type: 'error',
                error: 'no_cache',
                message: 'No cached scrape for this place.',
                ...extraMeta,
            });
            return res.end();
        }

        // ---- Stream the scrape ----
        const reviews = cache.reviews || [];
        const total = reviews.length;

        writeLine(res, {
            type: 'meta',
            place: {
                id: cache.place_id,
                name: cache.name,
                rating: cache.rating,
                reviews_count_estimate: cache.reviews_count_estimate,
            },
            total_estimate: total,
            ...extraMeta,
        });

        let scraped = 0;
        for (let i = 0; i < reviews.length; i += BATCH_SIZE) {
            const batch = reviews.slice(i, i + BATCH_SIZE);
            scraped += batch.length;
            writeLine(res, {
                type: 'batch',
                count: batch.length,
                scraped,
                total,
                reviews: batch,
            });
            if (BATCH_DELAY_MS > 0 && i + BATCH_SIZE < reviews.length) {
                await sleep(BATCH_DELAY_MS);
            }
        }

        writeLine(res, {
            type: 'done',
            source: 'cache',
            scraped_at: cache.scraped_at,
            total_scraped: scraped,
        });
        res.end();
    } catch (err) {
        console.error('[scrape] handler error:', err);
        try {
            writeLine(res, { type: 'error', error: 'internal_error', message: err.message });
            res.end();
        } catch { /* already ended */ }
    }
};