// ============================================
// live.js — Streamed LLM analysis via /api/analyze
// ============================================
import { marked } from 'marked';

const SAMPLE_LIVE = [
    { name: 'Maya', stars: 5, text: 'The ramen here is incredible — rich broth, perfectly cooked noodles, and the chashu melts in your mouth. Service was warm and quick. Will be back next week.' },
    { name: 'Liam', stars: 4, text: 'Great spot for a quick lunch. The gyoza was crispy and flavorful, but the portion size was a little small for the price.' },
    { name: 'Aisha', stars: 5, text: 'Hands down the best ramen in the city. Cozy vibe, friendly staff, and the spicy miso broth is unreal. Highly recommend.' },
    { name: 'Noah', stars: 2, text: 'Waited 35 minutes despite a reservation. Food was lukewarm when it arrived. Disappointing for the price point.' },
    { name: 'Sofia', stars: 5, text: 'Hidden gem! Fresh noodles, generous toppings, and reasonable prices. The staff was attentive and welcoming.' },
    { name: 'Ethan', stars: 1, text: 'Overpriced and underwhelming. The broth tasted canned and the noodles were soggy. Would not return.' },
    { name: 'Zoe', stars: 4, text: 'Solid ramen place with good flavor. A bit cramped inside but the food makes up for it.' },
    { name: 'Kai', stars: 5, text: 'Phenomenal. The tonkotsu broth is rich and creamy, noodles have perfect bite. Service is top-notch.' },
    { name: 'Priya', stars: 3, text: 'It was okay. Nothing wrong, but nothing memorable. Probably won\'t rush back.' },
    { name: 'Marcus', stars: 5, text: 'Best ramen experience I\'ve had outside of Japan. The kakuni is divine. Worth every penny.' },
];

const modelSelect = document.getElementById('modelSelect');
const liveJsonInput = document.getElementById('liveJsonInput');
const streamBtn = document.getElementById('streamBtn');
const stopBtn = document.getElementById('stopBtn');
const liveLoadSampleBtn = document.getElementById('liveLoadSampleBtn');
const liveResults = document.getElementById('liveResults');
const liveReport = document.getElementById('liveReport');
const liveMeta = document.getElementById('liveMeta');
const liveStatus = document.getElementById('liveStatus');

let currentController = null;

function setLiveStatus(msg, type = '') {
    if (!liveStatus) return;
    liveStatus.textContent = msg;
    liveStatus.className = `status${type ? ' is-' + type : ''}`;
}

function skeletonHTML() {
    return `
        <div class="skeleton" style="height:24px;width:60%;margin:12px 0;"></div>
        <div class="skeleton" style="height:14px;width:90%;margin:8px 0;"></div>
        <div class="skeleton" style="height:14px;width:85%;margin:8px 0;"></div>
        <div class="skeleton" style="height:14px;width:70%;margin:8px 0;"></div>
        <div class="skeleton" style="height:24px;width:50%;margin:20px 0 8px;"></div>
        <div class="skeleton" style="height:14px;width:80%;margin:8px 0;"></div>
        <div class="skeleton" style="height:14px;width:60%;margin:8px 0;"></div>
    `;
}

function renderMarkdown(text) {
    return marked.parse(text, { breaks: true, gfm: true });
}

async function streamAnalysis() {
    let raw;
    try {
        raw = JSON.parse(liveJsonInput.value.trim());
    } catch (err) {
        setLiveStatus('invalid JSON: ' + err.message, 'error');
        return;
    }
    if (!Array.isArray(raw) || raw.length === 0) {
        setLiveStatus('provide a non-empty reviews array', 'error');
        return;
    }

    const reviews = raw.slice(0, 50); // server caps at 50
    const model = modelSelect.value;
    const startTime = performance.now();

    // Reset UI
    liveResults.hidden = false;
    liveReport.innerHTML = skeletonHTML();
    liveMeta.textContent = `streaming from ${model.split('/').pop()}`;
    streamBtn.hidden = true;
    stopBtn.hidden = false;
    setLiveStatus('connecting…');

    currentController = new AbortController();

    try {
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reviews, model }),
            signal: currentController.signal,
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`server error ${response.status}: ${errText.slice(0, 100)}`);
        }

        setLiveStatus('streaming…');
        liveReport.innerHTML = '';

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                const data = line.slice(6).trim();
                if (data === '[DONE]') break;
                if (!data) continue;
                try {
                    const json = JSON.parse(data);
                    const chunk = json.choices?.[0]?.delta?.content || json.choices?.[0]?.message?.content || '';
                    if (chunk) {
                        fullText += chunk;
                        liveReport.innerHTML = renderMarkdown(fullText);
                    }
                } catch {
                    // Non-JSON line, treat as raw token
                    fullText += data;
                    liveReport.innerHTML = renderMarkdown(fullText);
                }
            }
        }

        const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
        liveMeta.textContent = `completed in ${elapsed}s · ${reviews.length} reviews`;
        setLiveStatus(`done · ${elapsed}s`, 'success');
    } catch (err) {
        if (err.name === 'AbortError') {
            setLiveStatus('stopped', 'error');
            liveMeta.textContent = 'stopped by user';
        } else {
            setLiveStatus('failed: ' + err.message, 'error');
            liveReport.innerHTML = `<p style="color:var(--rust);">⚠ ${err.message}</p>`;
        }
    } finally {
        streamBtn.hidden = false;
        stopBtn.hidden = true;
        currentController = null;
    }
}

if (streamBtn) streamBtn.addEventListener('click', streamAnalysis);
if (stopBtn) stopBtn.addEventListener('click', () => currentController?.abort());

if (liveLoadSampleBtn) {
    liveLoadSampleBtn.addEventListener('click', () => {
        liveJsonInput.value = JSON.stringify(SAMPLE_LIVE, null, 2);
        setLiveStatus(`loaded ${SAMPLE_LIVE.length} sample reviews`, 'success');
    });
}