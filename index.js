require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { devices } = require('puppeteer');

puppeteer.use(StealthPlugin());

const ARGS = process.argv.slice(2);
const FLAG = (name) => ARGS.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const HAS = (name) => ARGS.includes(`--${name}`);

const CONFIG = {
    url: process.env.GOOGLE_MAPS_URL || FLAG('url') || 'https://maps.app.goo.gl/CCGmfPudoLzPoK2a7',
    parallelProxies: Number(process.env.PARALLEL_PROXIES || FLAG('parallel-proxies') || 2),
    navTimeoutMs: Number(process.env.NAV_TIMEOUT_MS || 30000),
    navSettleMs: Number(process.env.NAV_SETTLE_MS || 1500),
    clickDelayMs: Number(process.env.CLICK_DELAY_MS || 1500),
    scrollIntervalMs: Number(process.env.SCROLL_INTERVAL_MS || 1800),
    maxStableChecks: Number(process.env.MAX_STABLE_CHECKS || 3),
    headless: !HAS('headed'),
    fast: HAS('fast'),
    skipProxy: HAS('no-proxy'),
    proxyFile: path.join(__dirname, 'proxies.txt'),
    outDir: path.join(__dirname, 'output'),
    cacheFile: path.join(__dirname, '.url-cache.json'),
    cacheTtlHours: Number(process.env.CACHE_TTL_HOURS || 24),
};

const SCREENSHOTS_DIR = path.join(CONFIG.outDir, 'screenshots');

function getTimestamp() {
    return new Date().toISOString().replace(/[:.]/g, '-');
}

function parseProxy(proxyUrl) {
    if (!proxyUrl.startsWith('http://')) return null;
    try {
        const url = new URL(proxyUrl);
        return { server: url.host, username: url.username, password: url.password, raw: proxyUrl };
    } catch {
        return null;
    }
}

function loadProxies() {
    if (CONFIG.skipProxy) return [];
    if (!fs.existsSync(CONFIG.proxyFile)) return [];
    return fs.readFileSync(CONFIG.proxyFile, 'utf-8').split(/\r?\n/).filter(Boolean).map(parseProxy).filter(Boolean);
}

async function loadCache() {
    try { return JSON.parse(await fsp.readFile(CONFIG.cacheFile, 'utf-8')); }
    catch { return {}; }
}

async function saveCache(cache) {
    await fsp.writeFile(CONFIG.cacheFile, JSON.stringify(cache, null, 2));
}

function isCacheFresh(entry) {
    if (!entry) return false;
    const ageMs = Date.now() - new Date(entry.cachedAt).getTime();
    return ageMs < CONFIG.cacheTtlHours * 60 * 60 * 1000;
}

async function tryProxy(proxyDetails) {
    const label = proxyDetails?.server || 'no-proxy';
    const log = (msg) => console.log(`[${label}] ${msg}`);
    let browser = null;
    try {
        log('Launching browser');
        const args = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-blink-features=AutomationControlled',
        ];
        if (proxyDetails?.server) args.unshift(`--proxy-server=${proxyDetails.server}`);
        browser = await puppeteer.launch({ headless: CONFIG.headless, args });
        const page = await browser.newPage();
        page.on('console', msg => log(`[Browser] ${msg.text()}`));

        log('Emulating Pixel 2 XL');
        await page.emulate(devices['Pixel 2 XL']);

        if (proxyDetails?.username) {
            log('Authenticating proxy');
            await page.authenticate({ username: proxyDetails.username, password: proxyDetails.password });
        }

        log(`Navigating: ${CONFIG.url}`);
        await page.goto(CONFIG.url, { waitUntil: 'domcontentloaded', timeout: CONFIG.navTimeoutMs });

        try {
            await page.waitForSelector('.hjmQqc', { timeout: CONFIG.navTimeoutMs });
        } catch {
            const url = page.url();
            if (url.includes('sorry') || await page.$('iframe[src*="api2/anchor"]')) {
                log('CAPTCHA detected');
                if (!CONFIG.fast) await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `captcha-${getTimestamp()}.png`) });
                return { ok: false, reason: 'captcha' };
            }
        }

        log(`Page settled. Waiting ${CONFIG.navSettleMs}ms.`);
        await new Promise(r => setTimeout(r, CONFIG.navSettleMs));

        const moreBtn = await page.$('button.M77dve');
        if (moreBtn) {
            log('Clicking More reviews');
            await moreBtn.click();
            await new Promise(r => setTimeout(r, CONFIG.clickDelayMs));
        }

        const reviews = await collectReviews(page, log);
        log(`Extracted ${reviews.length} reviews`);

        const cache = await loadCache();
        cache[CONFIG.url] = { reviews, cachedAt: new Date().toISOString(), count: reviews.length };
        await saveCache(cache);
        await streamReviews(reviews);

        if (!CONFIG.fast) {
            await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `success-${getTimestamp()}.png`), fullPage: true });
        }
        log('Reviews saved');
        return { ok: true, count: reviews.length };
    } catch (error) {
        log(`Error: ${error.message}`);
        return { ok: false, reason: error.message };
    } finally {
        if (browser) await browser.close().catch(() => {});
    }
}

async function streamReviews(reviews) {
    if (!fs.existsSync(CONFIG.outDir)) fs.mkdirSync(CONFIG.outDir, { recursive: true });
    const filePath = path.join(CONFIG.outDir, 'reviews.json');
    const ws = fs.createWriteStream(filePath);
    ws.write('[\n');
    for (let i = 0; i < reviews.length; i++) {
        ws.write(JSON.stringify(reviews[i]));
        if (i < reviews.length - 1) ws.write(',\n');
    }
    ws.write('\n]\n');
    await new Promise(resolve => ws.end(resolve));
}

async function collectReviews(page, log) {
    log('Waiting for review stream to load');
    await page.waitForSelector('.hjmQqc', { timeout: 15000 });

    log(`Auto-scrolling (interval=${CONFIG.scrollIntervalMs}ms)`);
    await page.evaluate(async (intervalMs, maxStableChecks) => {
        const findScrollable = (el) => {
            let p = el.parentElement;
            while (p) {
                if (p === document.body) return document.body;
                const s = getComputedStyle(p);
                if (s.overflowY === 'auto' || s.overflowY === 'scroll') return p;
                p = p.parentElement;
            }
            return document.body;
        };
        const target = await new Promise((resolve) => {
            let tries = 0;
            const t = setInterval(() => {
                const el = document.querySelector('.hjmQqc');
                if (el) { clearInterval(t); return resolve(el); }
                if (++tries >= 5) { clearInterval(t); return resolve(null); }
            }, 500);
        });
        if (!target) return;
        const scrollable = findScrollable(target);
        await new Promise((resolve) => {
            let lastHeight = -1;
            let stable = 0;
            const timer = setInterval(() => {
                const isBody = scrollable === document.body;
                const h = isBody ? document.body.scrollHeight : scrollable.scrollHeight;
                if (h === lastHeight) {
                    if (++stable >= maxStableChecks) { clearInterval(timer); resolve(); }
                } else { stable = 0; lastHeight = h; }
                if (isBody) window.scrollBy(0, 800); else scrollable.scrollBy(0, 800);
            }, intervalMs);
        });
    }, CONFIG.scrollIntervalMs, CONFIG.maxStableChecks);

    log('Extracting reviews');
    return page.evaluate(() => {
        const out = [];
        document.querySelectorAll('.hjmQqc').forEach((el) => {
            try {
                const name = el.querySelector('.IaK8zc.CVo7Bb')?.textContent?.trim();
                const time = el.querySelector('.bHyEBc')?.textContent?.trim();
                const aria = el.querySelector('.HeTgld')?.getAttribute('aria-label');
                const stars = aria ? parseFloat(aria.match(/\d+(\.\d+)?/)?.[0] || '') || 'N/A' : 'N/A';
                const text = el.querySelector('span.d5K5Pd')?.textContent?.trim() || '';
                if (name && time) out.push({ name, time, stars, text });
            } catch {}
        });
        return out;
    });
}

async function raceProxies(proxies) {
    if (proxies.length === 0) return tryProxy(null);
    if (proxies.length <= CONFIG.parallelProxies) {
        const results = await Promise.all(proxies.map(tryProxy));
        return results.find(r => r.ok) || { ok: false, reason: 'all failed' };
    }
    const queue = [...proxies];
    const inFlight = [];
    const tryOne = (p) => tryProxy(p).then(r => ({ r, p }));
    while (queue.length > 0 && inFlight.length < CONFIG.parallelProxies) {
        inFlight.push(tryOne(queue.shift()));
    }
    while (inFlight.length > 0) {
        const { r, p } = await Promise.race(inFlight);
        inFlight.splice(inFlight.findIndex(p => p), 1);
        if (r.ok) return r;
        if (queue.length > 0) inFlight.push(tryOne(queue.shift()));
    }
    return { ok: false, reason: 'all failed' };
}

(async () => {
    const t0 = Date.now();
    console.log(`Starting scrape: ${CONFIG.url}`);
    console.log(`   parallel-proxies: ${CONFIG.parallelProxies}, fast: ${CONFIG.fast}`);

    if (!CONFIG.fast && !fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

    const cache = await loadCache();
    const cached = cache[CONFIG.url];
    if (cached && isCacheFresh(cached) && !HAS('no-cache')) {
        console.log(`Cache hit (${cached.count} reviews, <${CONFIG.cacheTtlHours}h old)`);
        await streamReviews(cached.reviews);
        console.log(`Done in ${Date.now() - t0}ms (cache)`);
        if (HAS('analyze')) {
            const { execSync } = require('child_process');
            try {
                console.log('Running topic analysis...');
                execSync(`node topic-analysis.js --input "${path.join(CONFIG.outDir, 'reviews.json')}"`, { stdio: 'inherit' });
            } catch (e) { console.error('Analysis failed:', e.message); }
        }
        return;
    }

    const proxies = CONFIG.skipProxy ? [] : loadProxies();
    console.log(`Loaded ${proxies.length} proxies`);

    const result = await raceProxies(proxies);

    if (result.ok) {
        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        console.log(`\nDone in ${elapsed}s — ${result.count} reviews -> ${path.join(CONFIG.outDir, 'reviews.json')}`);
        if (HAS('analyze')) {
            const { execSync } = require('child_process');
            try {
                console.log('Running topic analysis...');
                execSync(`node topic-analysis.js --input "${path.join(CONFIG.outDir, 'reviews.json')}"`, { stdio: 'inherit' });
            } catch (e) { console.error('Analysis failed:', e.message); }
        }
    } else {
        console.log(`\nScrape failed: ${result.reason}`);
        process.exit(1);
    }
})();
