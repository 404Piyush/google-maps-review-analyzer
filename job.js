// ============================================
// job.js — Loads reviews for ?id= or ?url=
// Renders the dedicated report page
// ============================================

import { marked } from 'marked';

const params = new URLSearchParams(location.search);
const placeId = params.get('id');
const mapsUrl = params.get('url');
const searchQuery = params.get('q');

const loadingEl = document.getElementById('jobLoading');
const errorEl = document.getElementById('jobError');
const reportEl = document.getElementById('jobReport');

let allReviews = [];
let currentFilter = 'all';
let displayCount = 12;

// ============================================
// Step 1: resolve place (load metadata if known)
// ============================================
async function resolvePlace() {
    // Try known places first
    if (placeId) {
        try {
            const m = await import('./globe-data.js');
            const match = m.PLACES.find(p => p.id === placeId);
            if (match) return { match, endpoint: `/api/scrape?id=${encodeURIComponent(placeId)}` };
        } catch (e) { /* fall through */ }
    }
    if (mapsUrl) return { endpoint: `/api/scrape?url=${encodeURIComponent(mapsUrl)}` };
    if (searchQuery) return { endpoint: `/api/scrape?query=${encodeURIComponent(searchQuery)}` };
    return null;
}

// ============================================
// Step 2: render
// ============================================
async function main() {
    const resolved = await resolvePlace();
    if (!resolved) {
        showError('Add a place id or URL to the URL.', 'Missing parameters');
        return;
    }
    document.getElementById('jobLoadingPlace').textContent = resolved.match
        ? resolved.match.name
        : 'reviews';

    let res, data;
    try {
        res = await fetch(resolved.endpoint);
        data = await res.json();
    } catch (err) {
        showError(err.message, 'Network error');
        return;
    }

    if (!res.ok || !data.ok) {
        showError(data.message || data.error || 'Unknown error', 'Could not load this report');
        return;
    }

    render(data, resolved.match);
    loadingEl.hidden = true;
    reportEl.hidden = false;
}

function render(data, knownPlace) {
    const place = data.place;
    allReviews = data.reviews || [];

    // Header
    const placeForDisplay = knownPlace || { name: place.name, city: '', country: '', category: '', emoji: '' };
    document.getElementById('jobCategory').textContent = placeForDisplay.category || 'Place';
    document.getElementById('jobName').textContent = place.name || placeForDisplay.name;
    const loc = [placeForDisplay.city, placeForDisplay.country].filter(Boolean).join(', ');
    document.getElementById('jobLoc').textContent = loc || '—';
    document.getElementById('jobRating').textContent = place.rating?.toFixed(1) || '—';
    document.getElementById('jobReviewCount').textContent = allReviews.length;

    // Sentiment
    const pos = allReviews.filter(r => r.stars >= 4).length;
    const neu = allReviews.filter(r => r.stars === 3).length;
    const neg = allReviews.filter(r => r.stars <= 2).length;
    document.getElementById('jobPosPercent').textContent = allReviews.length
        ? Math.round((pos / allReviews.length) * 100) + '%'
        : '—';

    // Provenance
    const date = data.scraped_at ? new Date(data.scraped_at).toLocaleDateString() : '';
    document.getElementById('jobProvenance').textContent = date
        ? `Scraped ${date}`
        : 'Live scrape';

    // Filter chip counts
    document.getElementById('jobFilterAllCount').textContent = allReviews.length;
    ['5','4','3','2','1'].forEach(stars => {
        const count = allReviews.filter(r => r.stars === Number(stars)).length;
        document.getElementById('jobFilter' + stars + 'Count').textContent = count;
    });

    // Reviews
    renderReviews();

    // Filter chips
    document.querySelectorAll('.job-filter-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('.job-filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            currentFilter = chip.dataset.filter;
            displayCount = 12;
            renderReviews();
        });
    });

    // AI summary button
    document.getElementById('jobAiBtn').addEventListener('click', generateAiSummary);
}

function renderReviews() {
    const filtered = currentFilter === 'all'
        ? allReviews
        : allReviews.filter(r => r.stars === Number(currentFilter));

    const visible = filtered.slice(0, displayCount);
    const el = document.getElementById('jobReviews');
    el.innerHTML = visible.map((r, i) => `
        <article class="job-review" data-reveal data-reveal-delay="${Math.min(i * 40, 400)}">
            <header class="job-review-head">
                <span class="job-review-author">${escapeHtml(r.author || 'Anonymous')}</span>
                <span class="job-review-meta">
                    <span class="job-review-stars">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</span>
                    <span class="job-review-time">${escapeHtml(r.time || '')}</span>
                </span>
            </header>
            <p class="job-review-text">${escapeHtml(r.text || '')}</p>
        </article>
    `).join('');

    const moreBtn = document.getElementById('jobReviewsMore');
    if (filtered.length > displayCount) {
        moreBtn.hidden = false;
        moreBtn.textContent = `Load more (${filtered.length - displayCount} remaining)`;
    } else {
        moreBtn.hidden = true;
    }
    moreBtn.onclick = () => {
        displayCount = Math.min(displayCount + 12, filtered.length);
        renderReviews();
    };

    requestAnimationFrame(() => {
        document.querySelectorAll('#jobReviews [data-reveal]').forEach((el, i) => {
            el.style.opacity = '0';
            el.style.transform = 'translateY(12px)';
            el.style.transition = `opacity 0.5s ${i * 40}ms ease, transform 0.5s ${i * 40}ms ease`;
            requestAnimationFrame(() => {
                el.style.opacity = '1';
                el.style.transform = 'translateY(0)';
            });
        });
    });
}

// ============================================
// AI Summary — streams from /api/analyze
// ============================================
let abortController = null;
async function generateAiSummary() {
    if (abortController) abortController.abort();
    abortController = new AbortController();

    const btn = document.getElementById('jobAiBtn');
    const out = document.getElementById('jobAiBody');
    btn.disabled = true;
    btn.textContent = 'Streaming…';
    out.innerHTML = '';

    try {
        const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: abortController.signal,
            body: JSON.stringify({
                reviews: allReviews.slice(0, 50).map(r => ({ text: r.text, stars: r.stars })),
                model: 'nvidia/nemotron-3-ultra-550b-a55b:free',
            }),
        });
        if (!res.ok) throw new Error(`API ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            out.innerHTML = marked.parse(buffer, { breaks: true, gfm: true });
        }
    } catch (err) {
        if (err.name !== 'AbortError') {
            out.innerHTML = `<p class="job-ai-empty">Generation failed: ${escapeHtml(err.message)}</p>`;
        }
    } finally {
        btn.disabled = false;
        btn.textContent = 'Regenerate';
    }
}

// ============================================
// Helpers
// ============================================
function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function showError(msg, title) {
    loadingEl.hidden = true;
    errorEl.hidden = false;
    document.getElementById('jobErrorMsg').textContent = msg;
    if (title) {
        document.querySelector('.job-error-title').textContent = title;
    }
}

// Scroll progress
const bar = document.querySelector('.scroll-progress');
function updateProgress() {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    const pct = max > 0 ? (h.scrollTop / max) * 100 : 0;
    if (bar) bar.style.width = pct + '%';
}
window.addEventListener('scroll', updateProgress, { passive: true });
updateProgress();

main();