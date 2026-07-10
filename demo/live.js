/**
 * Live mode: stream a real LLM analysis from OpenRouter directly from the browser.
 * Uses OpenAI-compatible Chat Completions with SSE streaming.
 * API key is held only in this tab; only openrouter.ai is contacted.
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
let activeController = null;

function buildPrompt(reviews) {
    const summary = reviews.map((r, i) => {
        const stars = r.stars ? ` (${r.stars}★)` : '';
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
## 3. Top Themes — What's Working
(3 themes with supporting quote)
## 4. Top Themes — Areas for Improvement
(3 themes with supporting quote)
## 5. Actionable Recommendations
(3-4 bullets)

Output ONLY the markdown report, no preamble.`;
}

async function streamFromOpenRouter({ apiKey, model, prompt, onChunk, onDone, onError }) {
    if (activeController) activeController.abort();
    activeController = new AbortController();

    try {
        const res = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': window.location.origin,
                'X-Title': 'Google Maps Review Analyzer Demo',
            },
            body: JSON.stringify({
                model,
                stream: true,
                messages: [{ role: 'user', content: prompt }],
            }),
            signal: activeController.signal,
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            onError(`OpenRouter ${res.status}: ${errText.slice(0, 200) || res.statusText}`);
            return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const data = trimmed.slice(5).trim();
                if (data === '[DONE]') {
                    onDone();
                    return;
                }
                try {
                    const parsed = JSON.parse(data);
                    const chunk = parsed.choices?.[0]?.delta?.content;
                    if (chunk) onChunk(chunk);
                } catch {
                    // ignore malformed lines
                }
            }
        }
        onDone();
    } catch (e) {
        if (e.name === 'AbortError') return;
        onError(e.message);
    }
}

async function loadLiveSample() {
    try {
        const sample = await fetch('./sample-reviews.json').then(r => r.json());
        const reviews = (sample.reviews || sample).slice(0, 12);
        document.getElementById('liveJsonInput').value = JSON.stringify(reviews, null, 2);
    } catch (e) {
        document.getElementById('liveStatus').textContent = `Could not load sample: ${e.message}`;
    }
}

function setLiveStatus(msg, isError = false) {
    const el = document.getElementById('liveStatus');
    el.textContent = msg;
    el.style.color = isError ? 'var(--red)' : '';
}

async function startStream() {
    const key = document.getElementById('openrouterKey').value.trim();
    const model = document.getElementById('modelSelect').value;
    const raw = document.getElementById('liveJsonInput').value.trim();

    if (!key) {
        setLiveStatus('OpenRouter API key required.', true);
        return;
    }
    if (!key.startsWith('sk-or-')) {
        setLiveStatus('That doesn\'t look like an OpenRouter key (should start with sk-or-).', true);
        return;
    }
    let reviews;
    try {
        reviews = JSON.parse(raw);
    } catch (e) {
        setLiveStatus(`Invalid JSON: ${e.message}`, true);
        return;
    }
    if (!Array.isArray(reviews) || reviews.length === 0) {
        setLiveStatus('Expected a non-empty array.', true);
        return;
    }

    const capped = reviews.slice(0, 50);
    if (reviews.length > capped.length) {
        setLiveStatus(`Capping to ${capped.length} reviews to stay within free-tier rate limits.`);
    } else {
        setLiveStatus('');
    }

    const prompt = buildPrompt(capped);

    document.getElementById('streamBtn').classList.add('hidden');
    document.getElementById('stopBtn').classList.remove('hidden');
    document.getElementById('liveResults').classList.remove('hidden');
    document.getElementById('liveReport').innerHTML = '';
    document.getElementById('liveReport').dataset.raw = '';
    setLiveStatus('Streaming from OpenRouter…');

    let buffer = '';
    await streamFromOpenRouter({
        apiKey: key,
        model,
        prompt,
        onChunk: (chunk) => {
            buffer += chunk;
            document.getElementById('liveReport').dataset.raw = buffer;
            document.getElementById('liveReport').innerHTML = marked.parse(buffer);
        },
        onDone: () => {
            setLiveStatus(`Done — ${model} (${buffer.length} chars)`);
            document.getElementById('streamBtn').classList.remove('hidden');
            document.getElementById('stopBtn').classList.add('hidden');
        },
        onError: (err) => {
            setLiveStatus(`Error: ${err}`, true);
            document.getElementById('streamBtn').classList.remove('hidden');
            document.getElementById('stopBtn').classList.add('hidden');
        },
    });
}

function stopStream() {
    if (activeController) activeController.abort();
    setLiveStatus('Stopped.');
    document.getElementById('streamBtn').classList.remove('hidden');
    document.getElementById('stopBtn').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('streamBtn').addEventListener('click', startStream);
    document.getElementById('stopBtn').addEventListener('click', stopStream);
    document.getElementById('liveLoadSampleBtn').addEventListener('click', loadLiveSample);
});