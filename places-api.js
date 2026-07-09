/**
 * Google Places API path — no scraping, no proxies, no CAPTCHA.
 * Outputs the same `reviews.json` schema as the scraper, so topic-analysis.js
 * works unchanged.
 *
 * Usage:
 *   GOOGLE_PLACES_API_KEY=... node places-api.js --place-id=ChIJ...
 *   GOOGLE_PLACES_API_KEY=... node places-api.js --text-search="Joe's Pizza Manhattan"
 *
 * Google gives $200/mo in free credit for new accounts.
 * See https://developers.google.com/maps/documentation/places/web-service/op-overview
 */
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

const ARGS = process.argv.slice(2);
const FLAG = (name) => ARGS.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const BASE = 'https://places.googleapis.com/v1';
const OUT = path.join(__dirname, 'output', 'reviews.json');

if (!API_KEY) {
    console.error('GOOGLE_PLACES_API_KEY env var is required.');
    console.error('   Get one free at https://developers.google.com/maps/documentation/places/web-service/get-api-key');
    console.error('   $200/mo in free credit covers most hobbyists.');
    process.exit(1);
}

async function findPlaceId(textQuery) {
    const { data } = await axios.post(`${BASE}/places:searchText`,
        { textQuery },
        { params: { key: API_KEY, fields: 'places.id,places.displayName' } }
    );
    const place = data.places?.[0];
    if (!place) throw new Error(`No places found for "${textQuery}"`);
    console.log(`Found place: ${place.displayName?.text} (id=${place.id})`);
    return place.id;
}

async function fetchAllReviews(placeId, maxReviews = 200) {
    const reviews = [];
    let nextPageToken;
    do {
        const { data } = await axios.get(`${BASE}/places/${placeId}`, {
            params: {
                key: API_KEY,
                fields: 'reviews',
                maxResultCount: Math.min(20, maxReviews - reviews.length),
                pageToken: nextPageToken || undefined,
            },
        });
        const batch = data.reviews || [];
        for (const r of batch) {
            const text = (r.text?.text || '').trim();
            if (!text) continue;
            reviews.push({
                name: r.authorAttribution?.displayName || 'Anonymous',
                time: r.publishTime || r.relativePublishTimeDescription || '',
                stars: r.rating || 'N/A',
                text,
                source: 'places-api',
            });
        }
        nextPageToken = data.nextPageToken;
        console.log(`   …fetched ${reviews.length} so far`);
    } while (nextPageToken && reviews.length < maxReviews);
    return reviews;
}

async function main() {
    let placeId = FLAG('place-id');
    if (!placeId) {
        const textQuery = FLAG('text-search') || process.env.PLACE_TEXT_QUERY;
        if (!textQuery) {
            console.error('Provide either --place-id=ChIJ... or --text-search="Joe\'s Pizza"');
            process.exit(1);
        }
        placeId = await findPlaceId(textQuery);
    }
    console.log(`Fetching reviews for ${placeId}…`);
    const reviews = await fetchAllReviews(placeId);
    if (!fs.existsSync(path.dirname(OUT))) fs.mkdirSync(path.dirname(OUT), { recursive: true });
    await fsp.writeFile(OUT, JSON.stringify(reviews, null, 2));
    console.log(`${reviews.length} reviews saved to ${OUT}`);
    if (process.argv.includes('--analyze')) {
        const { execSync } = require('child_process');
        console.log('Running topic analysis…');
        execSync(`node topic-analysis.js --input "${OUT}"`, { stdio: 'inherit' });
    }
}

if (require.main === module) main().catch(e => { console.error('Error:', e.message); process.exit(1); });

module.exports = { findPlaceId, fetchAllReviews };
