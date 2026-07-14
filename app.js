// ============================================
// app.js — Main entry: tabs, reveal init, 3D tilt, theme
// ============================================
import './cursor.js';
import './hero-3d.js';
import './interactive.js';
import './live.js';
import { initReveal, initCounters, initBenchBars } from './reveal.js';
import { renderDonut, renderWordCloud } from './viz.js';
import { marked } from 'marked';

// ============================================
// 0. Mark JS as alive — enables [data-reveal] hide state
// (if this never runs, content stays visible by default)
// ============================================
document.documentElement.classList.add('js-reveal');

// ============================================
// 1. Reveal observers
// ============================================
initReveal();
initCounters();
initBenchBars();

// ============================================
// 2. Tab system
// ============================================
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.tab-panel');
const underline = document.querySelector('.tab-underline');

function moveUnderline(activeTab) {
    if (!underline || !activeTab) return;
    const rect = activeTab.getBoundingClientRect();
    const parentRect = activeTab.parentElement.getBoundingClientRect();
    underline.style.width = rect.width + 'px';
    underline.style.transform = `translateX(${rect.left - parentRect.left - 6}px)`;
}

tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        tabs.forEach((t) => {
            t.classList.toggle('active', t === tab);
            t.setAttribute('aria-selected', t === tab ? 'true' : 'false');
        });
        panels.forEach((p) => {
            const isActive = p.dataset.panel === target;
            p.classList.toggle('active', isActive);
            p.hidden = !isActive;
        });
        moveUnderline(tab);
    });
});

// Position underline on load + resize
const firstTab = document.querySelector('.tab.active');
if (firstTab) {
    requestAnimationFrame(() => moveUnderline(firstTab));
}
window.addEventListener('resize', () => {
    const active = document.querySelector('.tab.active');
    if (active) moveUnderline(active);
});

// ============================================
// 3. 3D tilt on hover for cards
// ============================================
const tiltEls = document.querySelectorAll('.tilt');
tiltEls.forEach((el) => {
    let raf = null;

    el.addEventListener('mousemove', (e) => {
        const rect = el.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;

        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
            const max = el.classList.contains('tile-lg') ? 6 :
                        el.classList.contains('tile-md') ? 5 :
                        el.classList.contains('cta-inner') ? 0 : 4;
            if (max === 0) return;
            el.style.transform = `perspective(1200px) rotateY(${x * max}deg) rotateX(${-y * max}deg) translateZ(8px)`;
            // Move inner content slightly to enhance depth
            const inner = el.querySelector('.viz-header, h3, .tile-meta, .kpi');
            if (inner) {
                inner.style.transform = `translateZ(20px)`;
            }
        });
    });

    el.addEventListener('mouseleave', () => {
        if (raf) cancelAnimationFrame(raf);
        el.style.transform = '';
        const inner = el.querySelector('.viz-header, h3, .tile-meta, .kpi');
        if (inner) inner.style.transform = '';
    });
});

// ============================================
// 4. Scroll progress bar
// ============================================
const progressBar = document.querySelector('.scroll-progress');
function updateProgress() {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    const pct = max > 0 ? (h.scrollTop / max) * 100 : 0;
    if (progressBar) progressBar.style.width = pct + '%';
}
window.addEventListener('scroll', updateProgress, { passive: true });
updateProgress();

// ============================================
// 5. Showcase: pre-baked viz
// ============================================
async function loadShowcase() {
    try {
        const [reviewsRes, reportRes] = await Promise.all([
            fetch('sample-reviews.json'),
            fetch('sample-report.md'),
        ]);

        if (!reviewsRes.ok || !reportRes.ok) return;

        const reviews = await reviewsRes.json();
        const reportMd = await reportRes.text();

        // Sentiment counts
        const sentiments = reviews.map((r) => {
            const s = r.stars >= 4 ? 'positive' : r.stars <= 2 ? 'negative' : 'neutral';
            return s;
        });
        const pos = sentiments.filter((s) => s === 'positive').length;
        const neu = sentiments.filter((s) => s === 'neutral').length;
        const neg = sentiments.filter((s) => s === 'negative').length;

        const donutData = [
            { label: 'Positive', value: pos, color: '#c5f900' },
            { label: 'Neutral', value: neu, color: '#0a0a0a' },
            { label: 'Negative', value: neg, color: '#c2410c' },
        ];

        const donutEl = document.getElementById('showcaseDonut');
        if (donutEl) renderDonut(donutEl, donutData, { centerLabel: reviews.length, centerSubLabel: 'reviews' });

        // Update legend numbers
        const showPos = document.getElementById('showPos');
        const showNeu = document.getElementById('showNeu');
        const showNeg = document.getElementById('showNeg');
        if (showPos) showPos.textContent = pos;
        if (showNeu) showNeu.textContent = neu;
        if (showNeg) showNeg.textContent = neg;

        // Topic cloud (extract from reviews)
        const counts = new Map();
        const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'is', 'was', 'were', 'are', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'it', 'its', 'this', 'that', 'i', 'we', 'you', 'they', 'was', 'were', 'our', 'my', 'your', 'their']);
        reviews.forEach((r) => {
            const text = (r.text || '').toLowerCase();
            const words = text.match(/\b[a-z]{4,}\b/g) || [];
            const seen = new Set();
            for (const w of words) {
                if (STOPWORDS.has(w) || seen.has(w)) continue;
                seen.add(w);
                counts.set(w, (counts.get(w) || 0) + 1);
            }
        });
        const topics = [...counts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 18)
            .map(([text, value]) => {
                // Determine sentiment by neighbor context
                const containingReviews = reviews.filter((r) => (r.text || '').toLowerCase().includes(text));
                const avgStars = containingReviews.reduce((sum, r) => sum + (Number(r.stars) || 0), 0) / containingReviews.length;
                const sentiment = avgStars >= 4 ? 'positive' : avgStars <= 2 ? 'negative' : 'neutral';
                return { text, value, sentiment };
            });

        const cloudEl = document.getElementById('showcaseCloud');
        if (cloudEl) await renderWordCloud(cloudEl, topics);

        // Render report
        const reportEl = document.getElementById('showReport');
        if (reportEl) reportEl.innerHTML = marked.parse(reportMd, { breaks: true, gfm: true });

        // Show preview
        const previewEl = document.getElementById('reviewsPreview');
        if (previewEl) {
            previewEl.textContent = JSON.stringify(reviews.slice(0, 5), null, 2) +
                `\n\n... ${reviews.length - 5} more reviews`;
        }
    } catch (err) {
        console.error('[showcase] failed to load', err);
    }
}

loadShowcase();

// ============================================
// 6. Globe story panel — fetches REAL reviews from /api/scrape
// ============================================
const storyPanel = document.getElementById('storyPanel');
const storyClose = storyPanel?.querySelector('.story-close');
const urlPasteForm = document.getElementById('urlPasteForm');
const urlPasteInput = document.getElementById('mapsUrl');
const urlPasteHint = document.getElementById('urlPasteHint');

let currentPlaceData = null;

function setPanelState(state) {
    storyPanel?.querySelector('.story-loading')?.toggleAttribute('hidden', state !== 'loading');
    storyPanel?.querySelector('.story-error')?.toggleAttribute('hidden', state !== 'error');
    storyPanel?.querySelector('.story-content')?.style && (storyPanel.querySelector('.story-content').style.display = state === 'content' ? 'block' : (state === 'content' ? '' : 'none'));
    if (state === 'content') storyPanel.querySelector('.story-content').style.display = 'block';
    else storyPanel.querySelector('.story-content').style.display = 'none';
}

function showLoading() {
    storyPanel.classList.add('visible');
    storyPanel.setAttribute('aria-hidden', 'false');
    storyPanel.querySelector('.story-loading').hidden = false;
    storyPanel.querySelector('.story-error').hidden = true;
    storyPanel.querySelector('.story-content').style.display = 'none';
}

function showError(title, message, hint) {
    storyPanel.classList.add('visible');
    storyPanel.setAttribute('aria-hidden', 'false');
    storyPanel.querySelector('.story-loading').hidden = true;
    storyPanel.querySelector('.story-error').hidden = false;
    storyPanel.querySelector('.story-content').style.display = 'none';
    storyPanel.querySelector('.story-error-title').textContent = title;
    storyPanel.querySelector('.story-error-message').textContent = message;
    storyPanel.querySelector('.story-error-hint').textContent = hint || '';

    // Clear stale reviews so error state isn't polluted by previous content
    document.getElementById('storyReviews').innerHTML = '';
    document.getElementById('storyReviewCount').textContent = '0';
    document.getElementById('storyBarPos').style.width = '0%';
    document.getElementById('storyBarNeu').style.width = '0%';
    document.getElementById('storyBarNeg').style.width = '0%';
    document.getElementById('storyProvenance').textContent = '';
    document.getElementById('storyNarrative').innerHTML = '';
}

function showContent() {
    storyPanel.classList.add('visible');
    storyPanel.setAttribute('aria-hidden', 'false');
    storyPanel.querySelector('.story-loading').hidden = true;
    storyPanel.querySelector('.story-error').hidden = true;
    storyPanel.querySelector('.story-content').style.display = 'block';
}

function closeStory() {
    storyPanel?.classList.remove('visible');
    storyPanel?.setAttribute('aria-hidden', 'true');
    currentPlaceData = null;
}

// ============================================
// Fetch reviews from /api/scrape
// ============================================
async function loadPlace(place) {
    currentPlaceData = place;
    showLoading();

    // Pre-fill header with optimistic place data while scraping
    const fill = place.coords ? {
        name: place.name,
        location: `${place.city || ''}, ${place.country || ''}`.replace(/^,\s*|\s*,\s*$/g, ''),
        emoji: place.emoji || '📍',
        rating: place.rating ? `★ ${place.rating}` : '',
        tagline: place.tagline || '',
    } : { name: place.name || 'Loading…', location: '', emoji: '📍', rating: '', tagline: '' };

    storyPanel.querySelector('.story-name').textContent = fill.name;
    storyPanel.querySelector('.story-location').textContent = fill.location;
    storyPanel.querySelector('.story-emoji').textContent = fill.emoji;
    storyPanel.querySelector('.story-rating').textContent = fill.rating;
    storyPanel.querySelector('.story-tagline').textContent = fill.tagline;

    try {
        let url;
        if (place.id) {
            url = `/api/scrape?id=${encodeURIComponent(place.id)}`;
        } else if (place.mapsUrl) {
            url = `/api/scrape?url=${encodeURIComponent(place.mapsUrl)}`;
        } else if (place.query) {
            url = `/api/scrape?query=${encodeURIComponent(place.query)}`;
        } else {
            throw new Error('No place id, URL, or query provided');
        }

        const res = await fetch(url);
        const data = await res.json();

        if (!res.ok || !data.ok) {
            const hint = data.hint ? `\n\n${data.hint}` : '';
            showError(
                'No cached scrape for this place',
                data.message || data.error || 'Unknown error',
                hint
            );
            return;
        }

        renderReviews(data);
    } catch (err) {
        showError('Network error', err.message, 'Is the API server running? Try `npm run dev` locally.');
    }
}

function renderReviews(data) {
    const { place, reviews, scraped_at, source } = data;

    // Header
    storyPanel.querySelector('.story-name').textContent = place.name;
    storyPanel.querySelector('.story-location').textContent = '';
    storyPanel.querySelector('.story-emoji').textContent = '';
    storyPanel.querySelector('.story-rating').textContent = place.rating ? `★ ${place.rating}` : '';
    storyPanel.querySelector('.story-tagline').textContent =
        `${place.reviews_count_estimate?.toLocaleString() || reviews.length} reviews on Google Maps`;

    // Sentiment stats
    const pos = reviews.filter(r => r.stars >= 4).length;
    const neu = reviews.filter(r => r.stars === 3).length;
    const neg = reviews.filter(r => r.stars <= 2).length;
    const total = reviews.length || 1;
    document.getElementById('storyReviewCount').textContent = reviews.length;
    document.getElementById('storyBarPos').style.width = `${(pos / total) * 100}%`;
    document.getElementById('storyBarNeu').style.width = `${(neu / total) * 100}%`;
    document.getElementById('storyBarNeg').style.width = `${(neg / total) * 100}%`;

    // Provenance
    const prov = document.getElementById('storyProvenance');
    const date = scraped_at ? new Date(scraped_at).toLocaleDateString() : 'unknown';
    prov.textContent = `Scraped ${date} · source: ${source || 'cache'}`;

    // Reviews list
    const reviewsEl = document.getElementById('storyReviews');
    reviewsEl.innerHTML = reviews.map(r => `
        <article class="story-review">
            <div class="story-review-head">
                <span class="story-review-author">${escapeHtml(r.author || 'Anonymous')}</span>
                <span class="story-review-meta">
                    <span class="story-review-stars">${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}</span>
                    <span class="story-review-time">${escapeHtml(r.time || '')}</span>
                </span>
            </div>
            <p class="story-review-text">${escapeHtml(r.text || '')}</p>
        </article>
    `).join('');

    // Reset narrative
    const narrativeEl = document.getElementById('storyNarrative');
    narrativeEl.innerHTML = '<p class="story-narrative-empty">Click regenerate to get an AI-written summary of these reviews.</p>';

    showContent();
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============================================
// Wire up events
// ============================================
window.addEventListener('globe:select', (e) => loadPlace(e.detail));

storyClose?.addEventListener('click', closeStory);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && storyPanel?.classList.contains('visible')) closeStory();
});

urlPasteForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = urlPasteInput.value.trim();
    if (!url) return;
    urlPasteHint.innerHTML = `Resolving <code>${escapeHtml(url.slice(0, 60))}${url.length > 60 ? '…' : ''}</code> and scraping…`;
    loadPlace({ mapsUrl: url });
});

// ============================================
// AI summary via /api/analyze
// ============================================
const analyzeBtn = document.getElementById('storyAnalyzeBtn');
analyzeBtn?.addEventListener('click', async () => {
    if (!currentPlaceData) return;
    const reviews = Array.from(document.querySelectorAll('#storyReviews .story-review-text')).map(el => ({
        text: el.textContent,
        stars: 4,
    }));
    if (reviews.length === 0) return;

    analyzeBtn.disabled = true;
    analyzeBtn.textContent = 'Streaming…';
    const narrativeEl = document.getElementById('storyNarrative');
    narrativeEl.textContent = '';

    try {
        const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reviews, model: 'nvidia/nemotron-3-ultra-550b-a55b:free' }),
        });
        if (!res.ok) throw new Error(`API ${res.status}`);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            narrativeEl.textContent += chunk;
        }
    } catch (err) {
        narrativeEl.textContent = `AI summary failed: ${err.message}`;
    } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.textContent = 'Regenerate';
    }
});