/**
 * /api/scrape — Returns scraped reviews for a place.
 *
 * Query params:
 *   url=...    Google Maps URL (short or full)
 *   query=...  Text query like "Café de Flore Paris"
 *   id=...     Known place id (cafe-de-flore, etc.)
 *
 * Pipeline:
 *   1. Resolve Maps short URL → extract place identifier
 *   2. Look up cached scrape in /cache/reviews/<id>.json
 *   3. Return reviews in scraper schema
 *
 * For unknown URLs without cache, returns 404 with clear instructions
 * for running the local scraper pipeline.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const CACHE_DIR = path.join(process.cwd(), 'cache', 'reviews');

// ============================================
// Resolve a Google Maps short URL → final URL
// ============================================
function resolveShortUrl(shortUrl) {
    return new Promise((resolve, reject) => {
        const url = new URL(shortUrl);
        const opts = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: 'HEAD',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        };
        const req = https.request(opts, (res) => {
            resolve({
                finalUrl: res.headers.location || shortUrl,
                statusCode: res.statusCode,
            });
            res.resume();
        });
        req.on('error', reject);
        req.setTimeout(8000, () => {
            req.destroy(new Error('Timeout resolving short URL'));
        });
        req.end();
    });
}

// ============================================
// Extract place identifier from a Maps URL
// ============================================
function extractPlaceFromUrl(mapsUrl) {
    try {
        const url = new URL(mapsUrl);
        // Full google.com/maps/place/Name/... → name is in path
        const placeMatch = url.pathname.match(/\/maps\/place\/([^/]+)/);
        if (placeMatch) {
            return decodeURIComponent(placeMatch[1]).replace(/\+/g, ' ');
        }
        // Short URL fallback — best-effort slug from hash
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

// ============================================
// Load cached scrape for a place
// ============================================
function loadCache(placeId) {
    const filePath = path.join(CACHE_DIR, `${placeId}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
        console.error(`[scrape] cache read failed for ${placeId}:`, err.message);
        return null;
    }
}

// ============================================
// Main handler
// ============================================
module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

    const q = req.query || {};
    const mapsUrl = (q.url || '').trim();
    const textQuery = (q.query || '').trim();
    const placeIdHint = (q.id || '').trim();

    try {
        // ----- Strategy A: explicit place id -----
        if (placeIdHint) {
            const cache = loadCache(slugify(placeIdHint));
            if (cache) {
                return res.status(200).json({
                    ok: true,
                    source: 'cache',
                    place: {
                        id: cache.place_id,
                        name: cache.name,
                        rating: cache.rating,
                        reviews_count_estimate: cache.reviews_count_estimate,
                    },
                    reviews: cache.reviews,
                    scraped_at: cache.scraped_at,
                });
            }
            return res.status(404).json({
                ok: false,
                error: 'place_not_in_cache',
                message: `No cached scrape for id "${placeIdHint}". Run the local scraper to add it.`,
                hint: `node index.js --url=<maps_url>  # then save to cache/reviews/${slugify(placeIdHint)}.json`,
            });
        }

        // ----- Strategy B: text query → slug match -----
        if (textQuery) {
            const slug = slugify(textQuery);
            const cache = loadCache(slug);
            if (cache) {
                return res.status(200).json({
                    ok: true,
                    source: 'cache',
                    resolved_query: textQuery,
                    place: {
                        id: cache.place_id,
                        name: cache.name,
                        rating: cache.rating,
                        reviews_count_estimate: cache.reviews_count_estimate,
                    },
                    reviews: cache.reviews,
                    scraped_at: cache.scraped_at,
                });
            }
            return res.status(404).json({
                ok: false,
                error: 'no_match_for_query',
                query: textQuery,
                message: `No cached scrape matches "${textQuery}".`,
                hint: 'Run `node index.js --url=<maps_url>` locally with the actual Maps URL.',
            });
        }

        // ----- Strategy C: Maps URL → resolve + match -----
        if (mapsUrl) {
            // Resolve short URL
            let resolvedUrl = mapsUrl;
            let resolutionStatus = 'no_resolve_needed';
            if (mapsUrl.includes('maps.app.goo.gl') || mapsUrl.includes('goo.gl')) {
                try {
                    const r = await resolveShortUrl(mapsUrl);
                    resolvedUrl = r.finalUrl;
                    resolutionStatus = 'resolved';
                } catch (err) {
                    console.warn('[scrape] short URL resolve failed:', err.message);
                    resolutionStatus = 'resolve_failed';
                }
            }

            const placeName = extractPlaceFromUrl(resolvedUrl);

            if (placeName) {
                const slug = slugify(placeName);
                const cache = loadCache(slug);
                if (cache) {
                    return res.status(200).json({
                        ok: true,
                        source: 'cache',
                        resolved_url: resolvedUrl,
                        resolved_place: placeName,
                        place: {
                            id: cache.place_id,
                            name: cache.name,
                            rating: cache.rating,
                            reviews_count_estimate: cache.reviews_count_estimate,
                        },
                        reviews: cache.reviews,
                        scraped_at: cache.scraped_at,
                    });
                }
            }

            return res.status(404).json({
                ok: false,
                error: 'no_cache_for_url',
                resolved_url: resolvedUrl,
                resolved_place: placeName,
                resolution_status: resolutionStatus,
                message: placeName
                    ? `URL resolved to "${placeName}" but no cached scrape exists for it.`
                    : 'No cached scrape matches this Maps URL.',
                hint: 'To scrape this URL live, run the local pipeline: `node index.js --url="' + mapsUrl + '"` then move the output to cache/reviews/<slug>.json',
            });
        }

        return res.status(400).json({
            ok: false,
            error: 'missing_param',
            message: 'Provide ?url=<maps_url> or ?query=<place_name> or ?id=<place_id>',
        });
    } catch (err) {
        console.error('[scrape] handler error:', err);
        return res.status(500).json({
            ok: false,
            error: 'internal_error',
            message: err.message,
        });
    }
};