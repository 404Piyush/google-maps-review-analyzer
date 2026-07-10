/**
 * Vercel serverless function: proxy to OpenRouter.
 * Keeps the API key server-side; the browser only sees this endpoint.
 */
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b:free';
const MAX_REVIEWS = 50;

function buildPrompt(reviews) {
    const summary = reviews.map((r, i) => {
        const stars = r.stars ? ` (${r.stars}\u2605)` : '';
        const text = String(r.text || '').replace(/\n/g, ' ').slice(0, 400);
        return `${i + 1}.${stars} "${text}"`;
    }).join('\n');

    return `You are a data analyst. Here are ${reviews.length} customer reviews:

${summary}

Write a concise executive report. Use these markdown headings:

# Customer Feedback Analysis
## 1. Executive Summary
(one paragraph)
## 2. Sentiment Breakdown
(percentages from the data)
## 3. Top Themes - What's Working
(3 themes with supporting quote)
## 4. Top Themes - Areas for Improvement
(3 themes with supporting quote)
## 5. Actionable Recommendations
(3-4 bullets)

Output ONLY the markdown report, no preamble.`;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'OPENROUTER_API_KEY not configured on server' });
    }

    const { reviews, model } = req.body || {};
    if (!Array.isArray(reviews) || reviews.length === 0) {
        return res.status(400).json({ error: 'reviews array required' });
    }

    const capped = reviews.slice(0, MAX_REVIEWS);
    const selectedModel = model || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
    const prompt = buildPrompt(capped);

    let upstream;
    try {
        upstream = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': `https://${req.headers.host}`,
                'X-Title': 'Google Maps Review Analyzer Demo',
            },
            body: JSON.stringify({
                model: selectedModel,
                stream: true,
                messages: [{ role: 'user', content: prompt }],
            }),
        });
    } catch (e) {
        return res.status(502).json({ error: `Upstream fetch failed: ${e.message}` });
    }

    if (!upstream.ok) {
        const errText = await upstream.text().catch(() => '');
        return res.status(upstream.status).json({
            error: `OpenRouter ${upstream.status}`,
            detail: errText.slice(0, 500),
        });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const reader = upstream.body.getReader();
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
        }
    } catch (e) {
        try { res.end(); } catch {}
        return;
    }
    res.end();
};
