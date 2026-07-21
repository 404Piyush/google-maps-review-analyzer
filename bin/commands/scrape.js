// ============================================
// scrape.js — `reatlas scrape <url>`
// Resolve a Maps URL, run the scraper, write output/reviews.json
//
// Strategy:
//   1. If `--api`, run places-api.js (Google Places API; needs key in .env)
//   2. If a local Python venv + scraper/local_scraper.py exists, spawn it
//      (gaspa93/googlemaps-scraper — works from your Mac, no proxy needed)
//   3. Otherwise, fall back to the legacy Node Puppeteer scraper (index.js)
//
// Output: NDJSON events (meta → batch → done | error) on stdout, and the
// scraped reviews written to output/reviews.json for the analyze step.
// ============================================
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const https = require('https');
const { URL } = require('url');

const ui = require('../../lib/ui.js');
const { log, brand, apply, styles, icons, info, success, warn, fail, section, rule, Spinner, Progress } = ui;

const cfg = {
    out: path.join(process.cwd(), 'output', 'reviews.json'),
};

function parseFlags(args) {
    const out = { url: null, api: false, fast: false, headless: false, local: null };
    args.forEach((a) => {
        if (!a.startsWith('--')) { out.url = a; return; }
        switch (a) {
            case '--api': out.api = true; break;
            case '--fast': out.fast = true; break;
            case '--headed':
            case '--no-headless': out.headless = false; break;
            case '--headless': out.headless = true; break;
            case '--local': out.local = true; break;
            case '--no-local': out.local = false; break;
        }
    });
    return out;
}

function resolveShortUrl(url) {
    return new Promise((resolve, reject) => {
        const u = new URL(url);
        const req = https.request({
            hostname: u.hostname, path: u.pathname + u.search, method: 'GET',
        }, (res) => {
            res.resume();
            resolve({ finalUrl: res.headers.location || url, status: res.statusCode });
        });
        req.on('error', reject);
        req.setTimeout(8000, () => req.destroy(new Error('Timeout')));
        req.end();
    });
}

function extractPlaceFromUrl(url) {
    try {
        const u = new URL(url);
        const m = u.pathname.match(/\/maps\/place\/([^/]+)/);
        return m ? decodeURIComponent(m[1]).replace(/\+/g, ' ') : null;
    } catch { return null; }
}

function hasPythonScraper() {
    const venvPy = path.join(process.cwd(), '.venv', 'bin', 'python3');
    const script = path.join(process.cwd(), 'scraper', 'local_scraper.py');
    return fs.existsSync(venvPy) && fs.existsSync(script);
}

module.exports = async function scrape(args, ctx) {
    const { url, api, fast, headless, local } = parseFlags(args);

    if (!url) {
        const err = new Error('Missing URL');
        err.hint = `Try: reatlas scrape https://maps.app.goo.gl/...`;
        err.exitCode = 1;
        throw err;
    }

    if (!ctx.quiet) {
        section('reatlas scrape');
        log(`  ${apply('URL', styles.dim).padEnd(14, ' ')}${apply(url, styles.bold)}`);
        const mode = api ? 'Google Places API' :
                     (local || (local === null && hasPythonScraper() && !api)
                        ? 'Local Python scraper (gaspa93)' :
                     headless ? 'Puppeteer headless' : 'Puppeteer headed');
        log(`  ${apply('Mode', styles.dim).padEnd(14, ' ')}${apply(mode, styles.cyan)}${fast ? ` ${apply('(fast)', styles.dim)}` : ''}`);
        log(`  ${apply('Output', styles.dim).padEnd(14, ' ')}${apply(cfg.out, styles.dim)}`);
        rule();
    }

    // ---- Resolve short URL ----
    let resolvedUrl = url;
    if (url.includes('maps.app.goo.gl') || url.includes('goo.gl')) {
        const spin = new Spinner('Resolving Maps short URL').start();
        try {
            const r = await resolveShortUrl(url);
            resolvedUrl = r.finalUrl;
            spin.stop(true, `Resolved to ${resolvedUrl.slice(0, 60)}…`);
        } catch {
            spin.stop(false, 'Short URL resolve failed (continuing with input)');
        }
    }

    const placeName = extractPlaceFromUrl(resolvedUrl);
    if (placeName && !ctx.quiet) info(`Place: ${apply(placeName, styles.bold)}`);

    // ---- Mode dispatch ----
    if (api) {
        return runPlacesApi(url, ctx, placeName, resolvedUrl);
    }

    const useLocal = local === true || (local === null && hasPythonScraper());
    if (useLocal) {
        if (!hasPythonScraper()) {
            const err = new Error('Python scraper not set up');
            err.hint = 'Run: python3 -m venv .venv && .venv/bin/pip install -r scraper/requirements.txt && .venv/bin/pip install numpy pandas pytz termcolor crayons';
            err.exitCode = 1;
            throw err;
        }
        return runLocalPython(url, ctx, placeName, resolvedUrl, { headless, fast });
    }

    return runPuppeteer(url, ctx, placeName, resolvedUrl, { fast, headless });
};

async function runPlacesApi(url, ctx, placeName, resolvedUrl) {
    if (!process.env.GOOGLE_PLACES_API_KEY) {
        const err = new Error('GOOGLE_PLACES_API_KEY is not set');
        err.hint = 'Get a free key at https://developers.google.com/maps/documentation/places/web-service/get-api-key';
        err.exitCode = 1;
        throw err;
    }
    const spin = new Spinner('Calling Places API…').start();
    return runSubprocess('places-api.js', [`--text-search=${url}`, '--analyze'], ctx, spin)
        .then((r) => { r.place_name = placeName; return r; });
}

async function runLocalPython(url, ctx, placeName, resolvedUrl, opts) {
    const venvPy = path.join(process.cwd(), '.venv', 'bin', 'python3');
    const script = path.join(process.cwd(), 'scraper', 'local_scraper.py');
    const args = [script, url, '--N=30'];
    if (opts.headless) args.push('--headless');
    const spin = new Spinner('Launching Chrome (local scraper)…').start();
    return runPythonNdjson(venvPy, args, ctx, spin)
        .then((r) => {
            r.place_name = placeName;
            return r;
        });
}

async function runPuppeteer(url, ctx, placeName, resolvedUrl, opts) {
    try { require.resolve('puppeteer-extra'); }
    catch {
        const err = new Error('Scraper dependencies not installed');
        err.hint = 'Run: npm install (puppeteer-extra + stealth are in optionalDependencies)';
        err.exitCode = 1;
        throw err;
    }
    const args = ['index.js', `--url=${url}`];
    if (opts.fast) args.push('--fast');
    args.push('--no-proxy');
    const spin = new Spinner(opts.headless ? 'Launching browser…' : 'Launching browser (headed)…').start();
    return runSubprocess('index.js', args, ctx, spin)
        .then((r) => { r.place_name = placeName; return r; });
}

function runSubprocess(script, args, ctx, spin) {
    return new Promise((resolve, reject) => {
        const proc = spawn(process.execPath, [script, ...args], {
            stdio: ctx.quiet ? 'pipe' : ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, FORCE_COLOR: '1' },
        });
        let out = '', errOut = '';
        if (proc.stdout) proc.stdout.on('data', (d) => {
            out += d.toString();
            if (!ctx.quiet) {
                const cleaned = out.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
                spin.update(cleaned.split('\n').filter(Boolean).pop()?.slice(0, 60) || 'Working…');
            }
        });
        if (proc.stderr) proc.stderr.on('data', (d) => { errOut += d.toString(); });

        proc.on('exit', (code) => {
            if (code !== 0) {
                spin.stop(false, 'Scrape failed');
                const tail = (errOut || out).trim().split('\n').slice(-6).join('\n');
                const err = new Error(`Scraper exited with code ${code}`);
                err.hint = tail || 'No output captured';
                err.exitCode = code || 1;
                return reject(err);
            }
            spin.stop(true, 'Scrape complete');
            let count = 0;
            if (fs.existsSync(cfg.out)) {
                try { count = JSON.parse(fs.readFileSync(cfg.out, 'utf8')).length || 0; } catch {}
            }
            if (!ctx.quiet) {
                section('Result');
                log(`  ${apply('Reviews written', styles.dim).padEnd(14, ' ')}${apply(count, styles.bold)}`);
                log(`  ${apply('Output file', styles.dim).padEnd(14, ' ')}${apply(cfg.out, styles.cyan)}`);
                rule();
            }
            resolve({ ok: true, count, output: cfg.out, stdout: ctx.jsonOnly ? out : undefined,
                      summary: { reviews: count, file: cfg.out } });
        });
        proc.on('error', (err) => { spin.stop(false, 'Failed to launch'); reject(err); });
    });
}

// Python script outputs NDJSON on stdout; we forward progress events to the
// spinner, collect reviews from batch events, write to output/reviews.json, and
// return the standard result object.
function runPythonNdjson(python, args, ctx, spin) {
    return new Promise((resolve, reject) => {
        const proc = spawn(python, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let buf = '', errBuf = '';
        let placeInfo = null;
        let totalScraped = 0;
        let allReviews = [];

        function handleLine(line) {
            if (!line.trim()) return;
            let evt;
            try { evt = JSON.parse(line); } catch { return; }
            if (evt.type === 'progress') {
                if (!ctx.quiet) {
                    if (evt.stage === 'sort') {
                        spin.update(evt.ok ? 'sort ok' : 'sort failed');
                    } else if (evt.stage === 'pre_sort') {
                        spin.update(`loaded (sort_btns=${evt.sort_btns || 0})`);
                    }
                }
            } else if (evt.type === 'batch' && Array.isArray(evt.reviews)) {
                allReviews = allReviews.concat(evt.reviews);
                totalScraped = evt.scraped || allReviews.length;
                if (!ctx.quiet) spin.update(`scraped ${totalScraped}/${evt.total || '?'}`);
            } else if (evt.type === 'done') {
                placeInfo = evt.place;
            } else if (evt.type === 'error') {
                if (!ctx.quiet) warn(`[${evt.error}] ${evt.message || ''}`);
            }
        }

        if (proc.stdout) proc.stdout.on('data', (d) => {
            buf += d.toString();
            let idx;
            while ((idx = buf.indexOf('\n')) !== -1) {
                handleLine(buf.slice(0, idx));
                buf = buf.slice(idx + 1);
            }
        });
        if (proc.stderr) proc.stderr.on('data', (d) => { errBuf += d.toString(); });

        proc.on('exit', (code) => {
            if (buf.trim()) handleLine(buf);
            if (code !== 0) {
                spin.stop(false, 'Scrape failed');
                const err = new Error(`Python scraper exited with code ${code}`);
                err.hint = (errBuf || '').trim().split('\n').slice(-6).join('\n') || 'No output captured';
                err.exitCode = code || 1;
                return reject(err);
            }
            if (allReviews.length === 0) {
                spin.stop(false, 'No reviews scraped');
                const err = new Error('No reviews scraped');
                err.hint = 'Try again, or use `--headless` (less reliable), or `--api` mode.';
                err.exitCode = 1;
                return reject(err);
            }
            // Write reviews.json in our canonical schema
            fs.mkdirSync(path.dirname(cfg.out), { recursive: true });
            fs.writeFileSync(cfg.out, JSON.stringify(allReviews, null, 2));
            spin.stop(true, `Scraped ${allReviews.length} reviews`);

            if (!ctx.quiet) {
                section('Result');
                log(`  ${apply('Reviews written', styles.dim).padEnd(14, ' ')}${apply(allReviews.length, styles.bold)}`);
                if (placeInfo) log(`  ${apply('Place', styles.dim).padEnd(14, ' ')}${apply(placeInfo.name || '', styles.cyan)}`);
                log(`  ${apply('Output file', styles.dim).padEnd(14, ' ')}${apply(cfg.out, styles.cyan)}`);
                rule();
            }

            resolve({
                ok: true,
                count: allReviews.length,
                output: cfg.out,
                place_name: placeInfo ? placeInfo.name : null,
                place: placeInfo,
                stdout: ctx.jsonOnly ? buf : undefined,
                summary: { reviews: allReviews.length, file: cfg.out,
                           place: placeInfo ? placeInfo.name : null },
            });
        });
        proc.on('error', (err) => { spin.stop(false, 'Failed to launch'); reject(err); });
    });
}