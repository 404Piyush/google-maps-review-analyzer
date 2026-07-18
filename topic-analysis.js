require('dotenv').config({ override: true });
const axios = require('axios');
const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
const { detectGPU } = require('./lib/hardware-detect');

const ARGS = process.argv.slice(2);
const FLAG = (name) => ARGS.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const HAS = (name) => ARGS.includes(`--${name}`);

const MODELS = {
    fast: { extract: 'gemma2:2b', report: 'gemma2:2b' },
    balanced: { extract: 'gemma2:2b', report: 'qwen3:8b' },
    deep: { extract: 'qwen3:8b', report: 'qwen3:8b' },
};

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

const CONFIG = {
    inputFile: FLAG('input') || path.join(__dirname, 'output', 'reviews.json'),
    tier: FLAG('model') || process.env.MODEL_TIER || 'fast',
    batchSize: Number(FLAG('batch-size') || process.env.BATCH_SIZE || 10),
    concurrency: Number(FLAG('concurrency') || process.env.CONCURRENCY_LIMIT || 0),
    provider: FLAG('provider') || process.env.LLM_PROVIDER || 'ollama',
    openRouterKey: process.env.OPENROUTER_API_KEY,
    openRouterModel: FLAG('openrouter-model') || process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct:free',
    reportFile: path.join(__dirname, 'output', 'analysis-report.md'),
    intermediateFile: path.join(__dirname, 'output', 'intermediate-analysis.json'),
};

function resolveConcurrency(detected) {
    if (CONFIG.concurrency > 0) return CONFIG.concurrency;
    return detected.gpu ? Math.min(50, Math.max(8, detected.vramGB * 2)) : 4;
}

async function providerAvailable() {
    if (CONFIG.provider === 'openrouter') {
        if (!CONFIG.openRouterKey) {
            console.error('OPENROUTER_API_KEY env var is required for provider=openrouter.');
            console.error('   Get a free key at https://openrouter.ai/  (free models available)');
            process.exit(1);
        }
        return true;
    }
    try {
        await axios.get(`${OLLAMA_BASE}/api/tags`, { timeout: 3000 });
        return true;
    } catch {
        console.error(`Cannot reach Ollama at ${OLLAMA_BASE}. Either start Ollama or use --provider=openrouter.`);
        process.exit(1);
    }
}

async function callLLM(prompt, opts = {}) {
    if (CONFIG.provider === 'openrouter') {
        const { data } = await axios.post(
            `${OPENROUTER_BASE}/chat/completions`,
            {
                model: CONFIG.openRouterModel,
                messages: [{ role: 'user', content: prompt }],
                response_format: opts.jsonFormat ? { type: 'json_object' } : undefined,
            },
            { headers: { Authorization: `Bearer ${CONFIG.openRouterKey}` }, timeout: 60000 }
        );
        return data.choices[0].message.content;
    }
    const { data } = await axios.post(`${OLLAMA_BASE}/api/generate`, {
        model: opts.model,
        prompt,
        stream: false,
        format: opts.jsonFormat ? 'json' : undefined,
    }, { timeout: 300000 });
    return data.response;
}

function buildBatchPrompt(reviews) {
    return `Analyze each of the following reviews. For each, identify topics and overall sentiment (positive, negative, neutral).
Return ONLY a raw JSON array (no commentary) of objects in this exact format:
[{"index":0,"topics":["a","b"],"sentiment":"positive|negative|neutral"}, ...]

Reviews:
${reviews.map((r, i) => `${i}. ${r.text.replace(/\n/g, ' ').slice(0, 500)}`).join('\n')}

JSON array:`;
}

function buildSinglePrompt(text) {
    return `Analyze this review. Respond with ONLY a JSON object.
Format: {"topics":["a","b"],"sentiment":"positive|negative|neutral"}
Review: "${text.replace(/\n/g, ' ').slice(0, 500)}"
JSON:`;
}

async function analyzeBatch(batch, model) {
    if (batch.length === 1) {
        try {
            const raw = await callLLM(buildSinglePrompt(batch[0].text), { model, jsonFormat: true });
            return [{ ...batch[0], analysis: JSON.parse(raw) }];
        } catch {
            return [{ ...batch[0], analysis: { topics: ['Error'], sentiment: 'unknown' } }];
        }
    }
    try {
        const raw = await callLLM(buildBatchPrompt(batch), { model, jsonFormat: false });
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch {
            const m = raw.match(/\[[\s\S]*\]/);
            if (m) parsed = JSON.parse(m[0]); else throw new Error('no JSON array in response');
        }
        const arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.results) ? parsed.results : null);
        if (!arr) throw new Error('expected JSON array');
        return batch.map((r, i) => ({
            ...r,
            analysis: arr[i] || { topics: ['Error'], sentiment: 'unknown' },
        }));
    } catch (e) {
        console.warn(`Batch parse failed (${batch.length} reviews), falling back to single-item: ${e.message}`);
        const results = [];
        for (const r of batch) {
            try {
                const raw = await callLLM(buildSinglePrompt(r.text), { model, jsonFormat: true });
                results.push({ ...r, analysis: JSON.parse(raw) });
            } catch {
                results.push({ ...r, analysis: { topics: ['Error'], sentiment: 'unknown' } });
            }
        }
        return results;
    }
}

async function analyzeAll(reviews, model, concurrency) {
    const batches = [];
    for (let i = 0; i < reviews.length; i += CONFIG.batchSize) batches.push(reviews.slice(i, i + CONFIG.batchSize));
    const results = new Array(reviews.length);
    let completed = 0;
    const queue = batches.map((b, idx) => ({ batch: b, baseIdx: idx * CONFIG.batchSize }));
    async function worker() {
        while (queue.length > 0) {
            const item = queue.shift();
            if (!item) break;
            const res = await analyzeBatch(item.batch, model);
            res.forEach((r, j) => { results[item.baseIdx + j] = r; });
            completed += item.batch.length;
            const pct = ((completed / reviews.length) * 100).toFixed(0);
            process.stdout.write(`\r   [${pct}%] ${completed}/${reviews.length} reviews analyzed`);
        }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    process.stdout.write('\n');
    return results.filter(Boolean);
}

function aggregateTopicStats(analyzedReviews) {
    const topics = {};
    const sentiments = { positive: 0, negative: 0, neutral: 0 };
    analyzedReviews.forEach((r) => {
        const sent = r.analysis?.sentiment;
        if (sent && sentiments[sent] !== undefined) sentiments[sent]++;
        const topicsList = r.analysis?.topics || [];
        if (topicsList[0] === 'Error') return;
        topicsList.forEach((t) => {
            const key = t.trim().toLowerCase().replace(/"/g, '');
            if (!key) return;
            topics[key] = topics[key] || { count: 0, positive: 0, negative: 0, neutral: 0 };
            topics[key].count++;
            if (sentiments[sent] !== undefined) topics[key][sent]++;
        });
    });
    return { topics, sentiments };
}

async function generateReport(analyzed, model) {
    const { topics, sentiments } = aggregateTopicStats(analyzed);
    const totalWithAnalysis = analyzed.filter(r => r.analysis?.sentiment !== 'unknown').length || 1;
    const pct = (n) => ((n / totalWithAnalysis) * 100).toFixed(1);
    const sortedTopics = Object.entries(topics).sort((a, b) => b[1].count - a[1].count).slice(0, 10);
    const topicTable = sortedTopics.map(([t, d]) => {
        const p = ((d.positive / d.count) * 100).toFixed(0);
        const n = ((d.negative / d.count) * 100).toFixed(0);
        const u = ((d.neutral / d.count) * 100).toFixed(0);
        return `| **${t}** | ${d.count} | ${p}% | ${n}% | ${u}% |`;
    }).join('\n');
    const header = `| Topic | Mentions | Positive | Negative | Neutral |\n|:---|---:|---:|---:|---:|`;
    const positives = analyzed.filter(r => r.analysis?.sentiment === 'positive').slice(0, 5).map(r => `- "${r.text.replace(/"/g, "'").slice(0, 200)}"`).join('\n');
    const negatives = analyzed.filter(r => r.analysis?.sentiment === 'negative').slice(0, 5).map(r => `- "${r.text.replace(/"/g, "'").slice(0, 200)}"`).join('\n');

    const prompt = `You are a data analyst. Based on the customer review data below, write a concise business report. Output ONLY the markdown report, no preamble.

# Customer Feedback Analysis

## 1. Executive Summary
(one paragraph)

## 2. Sentiment Analysis
### Overall Sentiment Breakdown
- **Positive:** ${pct(sentiments.positive)}% (${sentiments.positive} reviews)
- **Negative:** ${pct(sentiments.negative)}% (${sentiments.negative} reviews)
- **Neutral:** ${pct(sentiments.neutral)}% (${sentiments.neutral} reviews)

### Key Topics Sentiment
${header}
${topicTable}

## 3. Deep Dive: Key Themes
### What's Working Well
(top 3 themes with supporting quote)

### Areas for Improvement
(top 3 themes with supporting quote)

## 4. Actionable Recommendations
(2-4 bullet points)

---
Positive samples:
${positives}

Negative samples:
${negatives}
---
`;
    try {
        return await callLLM(prompt, { model, jsonFormat: false });
    } catch (e) {
        return `Report generation failed: ${e.message}\n\n## Statistics\n${header}\n${topicTable}`;
    }
}

async function main() {
    const t0 = Date.now();
    console.log('Starting review analysis pipeline');
    console.log(`   tier: ${CONFIG.tier} | batch-size: ${CONFIG.batchSize} | provider: ${CONFIG.provider}`);

    const detected = CONFIG.provider === 'ollama' ? await detectGPU() : { gpu: false };
    const concurrency = resolveConcurrency(detected);
    console.log(`   hardware: ${detected.gpu ? `GPU (${detected.gpu}, ${detected.vramGB}GB VRAM)` : 'CPU'} | concurrency: ${concurrency}`);

    await providerAvailable();

    let reviews;
    try {
        const raw = await fsp.readFile(CONFIG.inputFile, 'utf8');
        reviews = JSON.parse(raw);
        if (!Array.isArray(reviews) && Array.isArray(reviews?.reviews)) reviews = reviews.reviews;
        if (!Array.isArray(reviews)) {
            console.error(`Expected a JSON array (or {reviews:[…]}) in ${CONFIG.inputFile}`);
            process.exit(1);
        }
    } catch (e) {
        console.error(`Cannot read ${CONFIG.inputFile}: ${e.message}`);
        process.exit(1);
    }
    const withText = reviews.filter(r => r.text && String(r.text).trim() !== '');
    console.log(`Loaded ${reviews.length} reviews (${withText.length} with text)`);

    const model = MODELS[CONFIG.tier]?.extract || MODELS.fast.extract;

    let analyzed = [];
    if (fs.existsSync(CONFIG.intermediateFile) && !HAS('force')) {
        try {
            analyzed = JSON.parse(await fsp.readFile(CONFIG.intermediateFile, 'utf8'));
            console.log(`Resumed ${analyzed.length} reviews from ${CONFIG.intermediateFile}`);
        } catch {}
    }

    const remaining = withText.filter(r => !analyzed.find(a => a.name === r.name && a.time === r.time));
    if (remaining.length > 0) {
        console.log(`Phase 1: extracting topics/sentiment with ${model} (${remaining.length} reviews)`);
        const fresh = await analyzeAll(remaining, model, concurrency);
        analyzed = analyzed.concat(fresh);
        if (!fs.existsSync(path.dirname(CONFIG.intermediateFile))) await fs.mkdir(path.dirname(CONFIG.intermediateFile), { recursive: true });
        await fsp.writeFile(CONFIG.intermediateFile, JSON.stringify(analyzed, null, 2));
    }

    console.log(`Phase 2: generating final report with ${MODELS[CONFIG.tier]?.report || model}`);
    if (!fs.existsSync(path.dirname(CONFIG.reportFile))) await fs.mkdir(path.dirname(CONFIG.reportFile), { recursive: true });
    const report = await generateReport(analyzed, MODELS[CONFIG.tier]?.report || model);
    await fsp.writeFile(CONFIG.reportFile, report, 'utf8');

    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`\nDone in ${elapsed}s — report: ${CONFIG.reportFile}`);
}

if (require.main === module) main().catch(e => { console.error('Fatal:', e); process.exit(1); });

module.exports = { analyzeAll, generateReport, aggregateTopicStats, buildBatchPrompt, buildSinglePrompt };
