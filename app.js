// ============================================
// app.js — Main entry: tabs, reveal init, 3D tilt, theme
// ============================================
import './cursor.js';
import './globe.js';
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
// sample-reviews.json is the LLM analysis output:
//   { sentiment: {positive, negative, neutral}, topics: [{topic, positive, negative, neutral}], reviews: [...] }
// ============================================
async function loadShowcase() {
    try {
        const [vizRes, reportRes] = await Promise.all([
            fetch('sample-reviews.json'),
            fetch('sample-report.md'),
        ]);

        if (!vizRes.ok || !reportRes.ok) return;

        const viz = await vizRes.json();
        const reportMd = await reportRes.text();

        const reviews = Array.isArray(viz.reviews) ? viz.reviews : [];
        const sentiment = viz.sentiment || {};
        const topicsList = Array.isArray(viz.topics) ? viz.topics : [];

        const pos = sentiment.positive || 0;
        const neu = sentiment.neutral || 0;
        const neg = sentiment.negative || 0;

        const donutData = [
            { label: 'Positive', value: pos, color: '#c5f900' },
            { label: 'Neutral', value: neu, color: '#0a0a0a' },
            { label: 'Negative', value: neg, color: '#c2410c' },
        ];

        const donutEl = document.getElementById('showcaseDonut');
        if (donutEl) renderDonut(donutEl, donutData, {
            centerLabel: pos + neu + neg,
            centerSubLabel: 'reviews',
        });

        const showPos = document.getElementById('showPos');
        const showNeu = document.getElementById('showNeu');
        const showNeg = document.getElementById('showNeg');
        if (showPos) showPos.textContent = pos;
        if (showNeu) showNeu.textContent = neu;
        if (showNeg) showNeg.textContent = neg;

        // Topic cloud — use the topics from the analysis output
        const topicWords = topicsList
            .map((t) => {
                const total = (t.positive || 0) + (t.negative || 0) + (t.neutral || 0);
                if (!total) return null;
                const sentiment = (t.positive || 0) >= (t.negative || 0) ? 'positive' : 'negative';
                return { text: t.topic, value: total, sentiment };
            })
            .filter(Boolean);

        const cloudEl = document.getElementById('showcaseCloud');
        if (cloudEl && topicWords.length) await renderWordCloud(cloudEl, topicWords);

        const reportEl = document.getElementById('showReport');
        if (reportEl) reportEl.innerHTML = marked.parse(reportMd, { breaks: true, gfm: true });

        const previewEl = document.getElementById('reviewsPreview');
        if (previewEl && reviews.length) {
            previewEl.textContent = JSON.stringify(reviews.slice(0, 5), null, 2) +
                `\n\n... ${reviews.length - 5} more reviews`;
        }
    } catch (err) {
        console.error('[showcase] failed to load', err);
    }
}

loadShowcase();

// ============================================
// 6. Globe popup — driven by MapLibre via window.GlobeAPI
// ============================================
const urlPasteForm = document.getElementById('urlPasteForm');
const urlPasteInput = document.getElementById('mapsUrl');
const urlPasteHint = document.getElementById('urlPasteHint');

let currentScrape = null; // AbortController for any in-flight scrape

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Build the popup HTML for an in-progress scrape (count visible)
function loadingPopupHTML(place, currentCount, total) {
    return `
        <article class="reatlas-popup" data-place-id="${escapeHtml(place.id || '')}">
            <header class="reatlas-popup-head">
                <span class="reatlas-popup-emoji" aria-hidden="true">${place.emoji || '📍'}</span>
                <div>
                    <h3 class="reatlas-popup-name">${escapeHtml(place.name)}</h3>
                    <p class="reatlas-popup-loc">${escapeHtml([place.city, place.country].filter(Boolean).join(', '))}</p>
                </div>
                <button class="reatlas-popup-close" type="button" aria-label="Close">×</button>
            </header>
            <div class="reatlas-popup-loading">
                <div class="reatlas-popup-spinner"></div>
                <span>Scraped ${currentCount || 0} / ${total || '?'}…</span>
            </div>
        </article>
    `;
}

// Build the popup HTML for the final result
function contentPopupHTML(place, allReviews, scrapedAt) {
    const pos = allReviews.filter(r => r.stars >= 4).length;
    const neu = allReviews.filter(r => r.stars === 3).length;
    const neg = allReviews.filter(r => r.stars <= 2).length;
    const total = allReviews.length || 1;
    const pct = (n) => `${(n / total) * 100}%`;
    return `
        <article class="reatlas-popup" data-place-id="${escapeHtml(place.id || '')}">
            <header class="reatlas-popup-head">
                <span class="reatlas-popup-emoji" aria-hidden="true">${place.emoji || '📍'}</span>
                <div>
                    <h3 class="reatlas-popup-name">${escapeHtml(place.name || '')}</h3>
                    <p class="reatlas-popup-loc">${escapeHtml([place.city, place.country].filter(Boolean).join(', '))}</p>
                </div>
                <button class="reatlas-popup-close" type="button" aria-label="Close">×</button>
            </header>
            <div class="reatlas-popup-meta">
                <span class="reatlas-popup-rating">★ ${place.rating?.toFixed ? place.rating.toFixed(1) : (place.rating || '–')}</span>
                <span class="reatlas-popup-count">${allReviews.length} of ${(place.reviews_count_estimate || allReviews.length).toLocaleString()} reviews</span>
            </div>
            <div class="reatlas-popup-summary">
                <div class="reatlas-popup-bar">
                    <div class="reatlas-popup-bar-pos" style="width:${pct(pos)}"></div>
                    <div class="reatlas-popup-bar-neu" style="width:${pct(neu)}"></div>
                    <div class="reatlas-popup-bar-neg" style="width:${pct(neg)}"></div>
                </div>
                <div class="reatlas-popup-bar-legend">
                    <span><i></i>Pos</span>
                    <span><i></i>Neu</span>
                    <span><i></i>Neg</span>
                </div>
            </div>
            <a class="reatlas-popup-cta" href="/job.html?id=${encodeURIComponent(place.id || '')}" target="_blank" rel="noopener">
                Open full report
                <span aria-hidden="true">→</span>
            </a>
        </article>
    `;
}

function bindPopupClose(popup) {
    // Use a small delay so MapLibre's internal click handler finishes first
    setTimeout(() => {
        const el = popup.getElement();
        if (!el) return;
        // Read place id from the popup's data attribute so we can tell
        // globe.js to suppress the next "click bubbles back to marker" event.
        const article = el.querySelector('.reatlas-popup');
        const placeId = article?.dataset?.placeId;
        el.querySelectorAll('.reatlas-popup-close').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (placeId && window.GlobeAPI?.markClosing) {
                    window.GlobeAPI.markClosing(placeId);
                }
                popup.remove();
                if (currentScrape) currentScrape.abort();
            };
        });
        el.addEventListener('contextmenu', (e) => {
            // right-click also closes
            e.preventDefault();
            if (placeId && window.GlobeAPI?.markClosing) {
                window.GlobeAPI.markClosing(placeId);
            }
            popup.remove();
            if (currentScrape) currentScrape.abort();
        });
    }, 50);
}

// Track the popup so we can update its HTML as scraping progresses
let activePopup = null;
let activeScrapeMarker = null;

async function loadPlace(place, maplibregl) {
    if (currentScrape) currentScrape.abort();
    const ctrl = new AbortController();
    currentScrape = ctrl;

    // Open or re-use popup anchored to the marker (MapLibre Popup)
    if (window.GlobeAPI) {
        if (activePopup) {
            try { activePopup.remove(); } catch {}
            activePopup = null;
        }
        // Find the marker for this place
        const markers = (window.GlobeAPI.getAllMarkers && window.GlobeAPI.getAllMarkers()) || [];
        const marker = markers.find(m => m && m._placeId === place.id) || place.marker || place._marker || null;
        activeScrapeMarker = marker;
        if (maplibregl && marker) {
            activePopup = new maplibregl.Popup({
                offset: 22,
                anchor: 'bottom',
                closeButton: false,
                closeOnClick: false,
                maxWidth: '320px',
                className: 'reatlas-popup-wrap',
                offsetWidth: 320,
            })
                .setLngLat(marker.getLngLat())
                .setHTML(loadingPopupHTML(place, 0, null))
                .addTo(window.GlobeAPI.map);
            bindPopupClose(activePopup);
        } else {
            // No marker for unknown URL — show at map center
            activePopup = window.GlobeAPI.showEmptyState && window.GlobeAPI.showEmptyState(null);
        }
    }

    const params = place.id ? `?id=${encodeURIComponent(place.id)}`
                : place.mapsUrl ? `?url=${encodeURIComponent(place.mapsUrl)}`
                : place.query ? `?query=${encodeURIComponent(place.query)}`
                : null;
    if (!params) return;

    try {
        const res = await fetch(`/api/scrape${params}`, { signal: ctrl.signal });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let meta = null;
        let allReviews = [];
        let scrapedAt = null;

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            let nl;
            while ((nl = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, nl).trim();
                buffer = buffer.slice(nl + 1);
                if (!line) continue;
                let evt;
                try { evt = JSON.parse(line); } catch { continue; }
                if (evt.type === 'meta') {
                    meta = evt;
                    if (meta.place) Object.assign(place, meta.place);
                } else if (evt.type === 'batch') {
                    allReviews = allReviews.concat(evt.reviews || []);
                    // Live update loading text
                    if (activePopup) {
                        activePopup.setHTML(loadingPopupHTML(place, evt.scraped || allReviews.length, evt.total));
                        bindPopupClose(activePopup);
                    }
                } else if (evt.type === 'done') {
                    scrapedAt = evt.scraped_at;
                } else if (evt.type === 'error') {
                    return; // leave popup showing
                }
            }
        }

        if (meta && allReviews.length > 0 && activePopup) {
            const finalPlace = {
                ...place,
                name: meta.place?.name || place.name,
                rating: meta.place?.rating || place.rating,
                reviews_count_estimate: meta.place?.reviews_count_estimate || allReviews.length,
            };
            activePopup.setHTML(contentPopupHTML(finalPlace, allReviews, scrapedAt));
            bindPopupClose(activePopup);
        }
    } catch (err) {
        if (err.name !== 'AbortError') console.error('[scrape]', err);
    }
}

// ============================================
// Wire up events
// ============================================

// Patch GlobeAPI.getAllMarkers before listeners run — needed for lookup
// (added here so app.js doesn't need to know about MapLibre internals)
window.addEventListener('globe:ready', () => {
    // No-op — markers are looked up by place reference passed to loadPlace
});

let _maplibre = null;
async function getMaplibre() {
    if (_maplibre) return _maplibre;
    try {
        const mod = await import('maplibre-gl');
        _maplibre = mod.default || mod;
        window.maplibregl = _maplibre;
    } catch (e) {
        _maplibre = window.maplibregl || null;
    }
    return _maplibre;
}

window.addEventListener('globe:select', async (e) => {
    const ml = await getMaplibre();
    loadPlace(e.detail, ml);
});
window.addEventListener('globe:close', () => {
    if (currentScrape) currentScrape.abort();
    if (activePopup) { try { activePopup.remove(); } catch {} }
    activePopup = null;
});

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (currentScrape) currentScrape.abort();
    if (activePopup) { try { activePopup.remove(); } catch {} }
    activePopup = null;
});

urlPasteForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = urlPasteInput.value.trim();
    if (!url) return;
    urlPasteHint.innerHTML = `Resolving <code>${escapeHtml(url.slice(0, 60))}${url.length > 60 ? '…' : ''}</code>…`;
    const ml = await getMaplibre();
    loadPlace({ mapsUrl: url, name: url.slice(0, 40) }, ml);
});

// ============================================
// Animate popup position to follow the active pin
// ============================================
function syncPopupPosition() {
    const id = window.GlobeAPI?.getActivePinId?.();
    if (!id) return requestAnimationFrame(syncPopupPosition);
    const visiblePopup = (!globePopup.hidden && globePopup) || (!popupEmpty.hidden && popupEmpty);
    if (!visiblePopup) return requestAnimationFrame(syncPopupPosition);
    const pos = window.GlobeAPI.getPinScreenPos(id);
    if (!pos) return requestAnimationFrame(syncPopupPosition);
    if (!pos.onFront) {
        visiblePopup.style.opacity = '0';
    } else {
        visiblePopup.style.opacity = '1';
        // Anchor above the pin (popup-tail points down)
        const containerRect = document.querySelector('#hero3d')?.getBoundingClientRect();
        if (containerRect) {
            const x = containerRect.left + pos.x;
            const y = containerRect.top + pos.y - 18; // 18px above the pin
            visiblePopup.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
        } else {
            // Fallback to viewport coords
            visiblePopup.style.transform = `translate(${pos.x}px, ${pos.y}px) translate(-50%, -100%)`;
        }
    }
    requestAnimationFrame(syncPopupPosition);
}
requestAnimationFrame(syncPopupPosition);