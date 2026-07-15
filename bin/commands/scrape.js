// ============================================
// scrape.js — `reatlas scrape <url>`
// Resolve a Maps URL, run the scraper, write output/reviews.json
// ============================================
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const https = require('https');
const { URL } = require('url');

const ui = require('../../lib/ui.js');
const { brand, apply, styles, icons, info, success, warn, fail, section, rule, Spinner, Progress } = ui;

const cfg = {
    out: path.join(process.cwd(), 'output', 'reviews.json'),
    parallelProxies: Number(process.env.PARALLEL_PROXIES || 2),
    useApi: false,
};

function parseFlags(args) {
    const out = { url: null, api: false, fast: false, headless: true };
    args.forEach(a => {
        if (!a.startsWith('--')) { out.url = a; return; }
        switch (a) {
            case '--api': out.api = true; break;
            case '--fast': out.fast = true; break;
            case '--headed': out.headless = false; break;
            case '--parallel-proxies=0': cfg.parallelProxies = 0; break;
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

module.exports = async function scrape(args, ctx) {
    const { url, api, fast, headless } = parseFlags(args);

    if (!url) {
        const err = new Error('Missing URL');
        err.hint = `Try: reatlas scrape https://maps.app.goo.gl/...`;
        err.exitCode = 1;
        throw err;
    }

    if (!ctx.quiet) {
        section('reatlas scrape');
        log(`  ${apply('URL', styles.dim).padEnd(14, ' ')}${apply(url, styles.bold)}`);
        log(`  ${apply('Mode', styles.dim).padEnd(14, ' ')}${apply(api ? 'Google Places API' : (headless ? 'Puppeteer stealth' : 'Puppeteer headed'), styles.cyan)}${fast ? ` ${apply('(fast)', styles.dim)}` : ''}`);
        log(`  ${apply('Output', styles.dim).padEnd(14, ' ')}${apply(cfg.out, styles.dim)}`);
        rule();
    }

    // ---- Resolve short URL to get final URL + place name ----
    let resolvedUrl = url;
    if (url.includes('maps.app.goo.gl') || url.includes('goo.gl')) {
        const spin = new Spinner('Resolving Maps short URL').start();
        try {
            const r = await resolveShortUrl(url);
            resolvedUrl = r.finalUrl;
            spin.stop(true, `Resolved to ${resolvedUrl.slice(0, 60)}…`);
        } catch (e) {
            spin.stop(false, 'Short URL resolve failed (continuing with input)');
        }
    }

    const placeName = extractPlaceFromUrl(resolvedUrl);
    if (placeName && !ctx.quiet) info(`Place: ${apply(placeName, styles.bold)}`);

    // ---- Pre-flight checks ----
    const script = api ? 'places-api.js' : 'index.js';
    const scriptPath = path.join(process.cwd(), script);
    if (!fs.existsSync(scriptPath)) {
        const err = new Error(`Missing script: ${script}`);
        err.exitCode = 1;
        throw err;
    }

    if (api) {
        if (!process.env.GOOGLE_PLACES_API_KEY) {
            const err = new Error('GOOGLE_PLACES_API_KEY is not set');
            err.hint = `Get a free key at https://developers.google.com/maps/documentation/places/web-service/get-api-key, then run: reatlas init`;
            err.exitCode = 1;
            throw err;
        }
    } else {
        try {
            require.resolve('puppeteer-extra');
        } catch {
            const err = new Error('Scraper dependencies not installed');
            err.hint = `Run: npm install (puppeteer-extra + stealth are in optionalDependencies). On Linux you may also need: apt-get install -y chromium-browser`;
            err.exitCode = 1;
            throw err;
        }
    }

    // ---- Pre-count existing reviews for progress estimate ----
    let preCount = 0;
    if (fs.existsSync(cfg.out)) {
        try { preCount = JSON.parse(fs.readFileSync(cfg.out, 'utf8')).length || 0; } catch {}
    }

    // ---- Run ----
    const scrapeArgs = [script, `--url=${url}`];
    if (api) scrapeArgs.push('--analyze'); // chain analyze if requested
    else {
        if (fast) scrapeArgs.push('--fast');
        if (cfg.parallelProxies > 0) scrapeArgs.push(`--parallel-proxies=${cfg.parallelProxies}`);
    }

    const spin = new Spinner(api ? 'Calling Places API…' : (headless ? 'Launching browser…' : 'Launching browser (headed)…'))
        .start();

    return new Promise((resolve, reject) => {
        const proc = spawn(process.execPath, scrapeArgs, {
            stdio: ctx.quiet ? 'pipe' : ['ignore', 'pipe', 'pipe'],
            env: { ...process.env, URL: url, GOOGLE_MAPS_URL: url, FORCE_COLOR: '1' },
        });

        let out = '', errOut = '';
        if (proc.stdout) proc.stdout.on('data', (d) => {
            const s = d.toString();
            out += s;
            if (!ctx.quiet) {
                const cleaned = s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
                spin.update(cleaned.split('\n').filter(Boolean).pop()?.slice(0, 60) || 'Working…');
            }
        });
        if (proc.stderr) proc.stderr.on('data', (d) => {
            const s = d.toString();
            errOut += s;
        });

        proc.on('exit', (code) => {
            if (code !== 0) {
                spin.stop(false, 'Scrape failed');
                const err = new Error(`Scraper exited with code ${code}`);
                err.hint = `Last lines of output:\n${(errOut || out).trim().split('\n').slice(-5).join('\n')}`;
                err.exitCode = code || 1;
                return reject(err);
            }
            spin.stop(true, 'Scrape complete');

            // Count results
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

            resolve({
                ok: true,
                url,
                resolved_url: resolvedUrl,
                place_name: placeName,
                count,
                output: cfg.out,
                stdout: ctx.jsonOnly ? out : undefined,
                summary: {
                    place: placeName || 'unknown',
                    reviews: count,
                    file: cfg.out,
                },
            });
        });

        proc.on('error', (err) => {
            spin.stop(false, 'Failed to launch');
            reject(err);
        });
    });
};