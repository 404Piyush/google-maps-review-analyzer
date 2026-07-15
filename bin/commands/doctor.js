// ============================================
// doctor.js — `reatlas doctor`  env + dep sanity check
// ============================================
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ui = require('../../lib/ui.js');
const { apply, styles, success, warn, fail, info, section, rule, icons, log } = ui;

module.exports = async function doctor(args, ctx) {
    section('reatlas doctor');
    let allOk = true;

    // ---- Node version ----
    const nodeVer = process.version;
    const nodeOk = /^v(1[8-9]|[2-9]\d|\d{3})/.test(nodeVer);
    if (nodeOk) success(`Node ${nodeVer} (>= 18)`);
    else { fail(`Node ${nodeVer} — need >= 18`); allOk = false; }

    // ---- Required scripts present ----
    const required = ['index.js', 'places-api.js', 'topic-analysis.js', 'analyze.js', 'package.json'];
    for (const f of required) {
        const ok = fs.existsSync(path.join(process.cwd(), f));
        if (ok) success(`${f} present`);
        else { fail(`${f} missing`); allOk = false; }
    }

    // ---- .env ----
    if (fs.existsSync(path.join(process.cwd(), '.env'))) {
        success('.env present');
    } else if (fs.existsSync(path.join(process.cwd(), '.env.example'))) {
        warn('.env missing (run `reatlas init`)');
    } else {
        warn('.env.example also missing');
    }

    // ---- OpenRouter ----
    const hasOr = !!process.env.OPENROUTER_API_KEY;
    if (hasOr) success('OPENROUTER_API_KEY set (cloud LLM ready)');
    else warn('OPENROUTER_API_KEY not set (needed for cloud LLM or `reatlas globe` AI summary)');

    // ---- Places API ----
    const hasPlaces = !!process.env.GOOGLE_PLACES_API_KEY;
    if (hasPlaces) success('GOOGLE_PLACES_API_KEY set (Places API ready)');
    else info('GOOGLE_PLACES_API_KEY not set (needed for `reatlas scrape --api`)');

    // ---- Ollama local ----
    try {
        const v = execSync('ollama --version', { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
        success(`Ollama installed (${v})`);
        try {
            const models = execSync('ollama list', { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
            const hasGemma = /gemma2:2b/.test(models);
            const hasQwen = /qwen3:8b/.test(models);
            if (hasGemma) success('Ollama model gemma2:2b available');
            else info('Ollama model gemma2:2b not pulled (run: ollama pull gemma2:2b)');
            if (hasQwen) success('Ollama model qwen3:8b available');
            else info('Ollama model qwen3:8b not pulled (run: ollama pull qwen3:8b)');
        } catch { warn('Could not run `ollama list` (server may not be running)'); }
    } catch {
        info('Ollama not installed (only matters for local LLM, not OpenRouter)');
    }

    // ---- Puppeteer + stealth ----
    try { require.resolve('puppeteer-extra'); success('puppeteer-extra installed'); }
    catch { warn('puppeteer-extra not installed (scraper mode requires it)'); }
    try { require.resolve('puppeteer-extra-plugin-stealth'); success('puppeteer-extra-plugin-stealth installed'); }
    catch { warn('stealth plugin not installed'); }

    // ---- proxies.txt ----
    const proxiesPath = path.join(process.cwd(), 'proxies.txt');
    if (fs.existsSync(proxiesPath)) {
        const lines = fs.readFileSync(proxiesPath, 'utf8').trim().split('\n').filter(l => l.startsWith('http'));
        success(`proxies.txt has ${lines.length} entries`);
    } else {
        info('proxies.txt not found (you can create one with `echo "http://user:pass@host:port" > proxies.txt`)');
    }

    rule();
    if (allOk) success('All required checks passed.');
    else fail('Some required checks failed.');
    log();
    process.exit(allOk ? 0 : 1);
};