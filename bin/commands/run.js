// ============================================
// run.js — `reatlas run <url>`  scrape + analyze in one shot
// ============================================
'use strict';

const scrapeCmd = require('./scrape');
const analyzeCmd = require('./analyze');

module.exports = async function run(args, ctx) {
    // Split flags: everything before "--" is for scrape, after is for analyze
    const scrapeArgs = [];
    const analyzeFlags = [];
    let inAnalyze = false;
    for (const a of args) {
        if (a === '--') { inAnalyze = true; continue; }
        if (inAnalyze || a === '--model=fast' || a === '--model=balanced' || a === '--model=deep' || a.startsWith('--model=') || a.startsWith('--provider=') || a.startsWith('--output=')) {
            analyzeFlags.push(a);
        } else {
            scrapeArgs.push(a);
        }
    }

    const scrapeResult = await scrapeCmd(scrapeArgs, ctx);
    return analyzeCmd([scrapeResult.output, ...analyzeFlags], ctx);
};