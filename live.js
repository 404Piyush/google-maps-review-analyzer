/**
 * Live mode: stream a real LLM analysis from /api/analyze (server-side proxy).
 * The OpenRouter API key is stored on the server, never sent to the browser.
 */
let activeController = null;

async function streamFromBackend({ reviews, model, onChunk, onDone, onError }) {
    if (activeController) activeController.abort();
    activeController = new AbortController();

    try {
        const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reviews, model }),
            signal: activeController.signal,
        });

        if (!res.ok) {
            let detail = res.statusText;
            try {
                const body = await res.json();
                detail = body.error || body.detail || JSON.stringify(body);
            } catch {}
            onError(`Server ${res.status}: ${detail}`);
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
    const model = document.getElementById('modelSelect').value;
    const raw = document.getElementById('liveJsonInput').value.trim();

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

    if (reviews.length > 50) {
        setLiveStatus(`Capping to 50 reviews to stay within free-tier rate limits.`);
    } else {
        setLiveStatus('');
    }

    document.getElementById('streamBtn').classList.add('hidden');
    document.getElementById('stopBtn').classList.remove('hidden');
    document.getElementById('liveResults').classList.remove('hidden');
    document.getElementById('liveReport').innerHTML = '';
    document.getElementById('liveReport').dataset.raw = '';
    setLiveStatus('Streaming from server (Nemotron 3 Ultra 550B)...');

    let buffer = '';
    await streamFromBackend({
        reviews,
        model,
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
