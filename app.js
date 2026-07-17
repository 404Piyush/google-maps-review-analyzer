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
// 6. Globe popup — HTML positioned via Three.js screen coords
// ============================================
const urlPasteForm = document.getElementById('urlPasteForm');
const urlPasteInput = document.getElementById('mapsUrl');
const urlPasteHint = document.getElementById('urlPasteHint');

let currentScrape = null; // AbortController

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Build / show a single managed popup element
const globePopup = document.createElement('div');
globePopup.className = 'reatlas-popup-wrap';
globePopup.setAttribute('aria-hidden', 'true');
globePopup.style.display = 'none';
document.body.appendChild(globePopup);

let popupPlaceId = null;
let popupActiveMarker = null;

function showPopup(html, placeId = null) {
    popupPlaceId = placeId;
    globePopup.innerHTML = html;
    globePopup.style.display = 'block';
    globePopup.setAttribute('aria-hidden', 'false');
    // Clear any previous marker highlight since popup shows it
    if (popupActiveMarker && window.GlobeAPI?.setActivePin) {
        // No-op; the popup itself is the active state
    }
    bindPopupClose();
}

function hidePopup() {
    if (currentScrape) currentScrape.abort();
    globePopup.style.display = 'none';
    globePopup.setAttribute('aria-hidden', 'true');
    if (window.GlobeAPI?.close) window.GlobeAPI.close();
    popupPlaceId = null;
}

function bindPopupClose() {
    const closeBtns = globePopup.querySelectorAll('.reatlas-popup-close');
    closeBtns.forEach(btn => {
        btn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (popupPlaceId && window.GlobeAPI?.markClosing) {
                window.GlobeAPI.markClosing(popupPlaceId);
            }
            hidePopup();
        };
    });
}

function loadingPopupHTML(place, currentCount, total) {
    return `
        <article class="reatlas-popup" data-place-id="${escapeHtml(place.id || '')}">
            <div class="reatlas-popup-tail" aria-hidden="true"></div>
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

function contentPopupHTML(place, allReviews) {
    const pos = allReviews.filter(r => r.stars >= 4).length;
    const neu = allReviews.filter(r => r.stars === 3).length;
    const neg = allReviews.filter(r => r.stars <= 2).length;
    const total = allReviews.length || 1;
    const pct = (n) => `${(n / total) * 100}%`;
    return `
        <article class="reatlas-popup" data-place-id="${escapeHtml(place.id || '')}">
            <div class="reatlas-popup-tail" aria-hidden="true"></div>
            <header class="reatlas-popup-head">
                <span class="reatlas-popup-emoji" aria-hidden="true">${place.emoji || '📍'}</span>
                <div>
                    <h3 class="reatlas-popup-name">${escapeHtml(place.name || '')}</h3>
                    <p class="reatlas-popup-loc">${escapeHtml([place.city, place.country].filter(Boolean).join(', '))}</p>
                </div>
                <button class="reatlas-popup-close" type="button" aria-label="Close">×</button>
            </header>
            <div class="reatlas-popup-meta">
                <span class="reatlas-popup-rating">${typeof place.rating === 'number' ? '★ ' + place.rating.toFixed(1) : '★ –'}</span>
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
            <a class="reatlas-popup-cta magnetic" href="/job.html?id=${encodeURIComponent(place.id || '')}">
                Open full report
                <span aria-hidden="true">→</span>
            </a>
        </article>
    `;
}

function emptyPopupHTML(placeName) {
    return `
        <article class="reatlas-popup reatlas-popup-empty">
            <div class="reatlas-popup-tail" aria-hidden="true"></div>
            <header class="reatlas-popup-head">
                <div>
                    <h3 class="reatlas-popup-name">Not yet scraped</h3>
                    <p class="reatlas-popup-loc">No cached reviews for ${escapeHtml(placeName || 'this place')}</p>
                </div>
                <button class="reatlas-popup-close" type="button" aria-label="Close">×</button>
            </header>
            <p class="reatlas-popup-empty-text">
                Run the local scraper and the report will appear here.
            </p>
            <a class="reatlas-popup-cta magnetic" href="https://github.com/404Piyush/google-maps-review-analyzer#readme" target="_blank" rel="noopener">
                How scraping works <span aria-hidden="true">→</span>
            </a>
        </article>
    `;
}

async function loadPlace(place) {
    if (currentScrape) currentScrape.abort();
    const ctrl = new AbortController();
    currentScrape = ctrl;

    showPopup(loadingPopupHTML(place, 0, null), place.id);

    const params = place.id ? `?id=${encodeURIComponent(place.id)}`
                : place.mapsUrl ? `?url=${encodeURIComponent(place.mapsUrl)}`
                : place.query ? `?query=${encodeURIComponent(place.query)}`
                : null;
    if (!params) {
        showPopup(emptyPopupHTML(place.name), null);
        resetHint();
        return;
    }

    // Hard timeout — if the server doesn't respond in 12s, show empty popup
    const timeoutCtrl = new AbortController();
    const timeoutId = setTimeout(() => timeoutCtrl.abort(), 12000);
    // Merge aborts: if either fires, abort
    ctrl.signal.addEventListener('abort', () => timeoutCtrl.abort());
    timeoutCtrl.signal.addEventListener('abort', () => ctrl.abort());

    try {
        const res = await fetch(`/api/scrape${params}`, { signal: timeoutCtrl.signal });
        clearTimeout(timeoutId);
        if (!res.ok || !res.body) {
            showPopup(emptyPopupHTML(place.name), null);
            resetHint();
            return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let meta = null;
        let allReviews = [];
        let streamEnded = false;
        let erroredEarly = false;

        while (!streamEnded) {
            const { value, done } = await reader.read();
            if (done) { streamEnded = true; break; }
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
                    if (!ctrl.signal.aborted) {
                        globePopup.innerHTML = loadingPopupHTML(place, evt.scraped || allReviews.length, evt.total);
                        bindPopupClose();
                    }
                } else if (evt.type === 'done') {
                    // Stream finished
                } else if (evt.type === 'error') {
                    erroredEarly = true;
                }
            }
        }

        if (erroredEarly) {
            showPopup(emptyPopupHTML(place.name), null);
            resetHint();
            return;
        }

        if (meta && allReviews.length > 0) {
            const finalPlace = {
                ...place,
                name: meta.place?.name || place.name,
                rating: meta.place?.rating || place.rating,
                reviews_count_estimate: meta.place?.reviews_count_estimate || allReviews.length,
            };
            showPopup(contentPopupHTML(finalPlace, allReviews), finalPlace.id);
            resetHint();
        } else {
            showPopup(emptyPopupHTML(place.name), null);
            resetHint();
        }
    } catch (err) {
        if (err.name === 'AbortError' && !ctrl.signal.aborted) {
            // Pure timeout (not user-cancel): the server is too slow — show empty
            showPopup(emptyPopupHTML(place.name), null);
        } else if (err.name !== 'AbortError') {
            console.error('[scrape]', err);
            showPopup(emptyPopupHTML(place.name), null);
        }
        resetHint();
    }
}

function resetHint() {
    if (urlPasteHint) urlPasteHint.innerHTML = '';
}

// ============================================
// Wire up events
// ============================================
window.addEventListener('globe:select', (e) => loadPlace(e.detail));
window.addEventListener('globe:close', () => hidePopup());

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    if (globePopup.style.display !== 'none') hidePopup();
});

urlPasteForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = urlPasteInput.value.trim();
    if (!raw) {
        urlPasteInput.focus();
        urlPasteHint.innerHTML = `<span style="color:var(--accent-dark)">Type a Maps URL, pick a demo chip below, or paste a place ID.</span>`;
        setTimeout(() => { urlPasteHint.innerHTML = ''; }, 4500);
        return;
    }

    // Smart-detect input format:
    //   1. Maps URL (https://…) or maps.app.goo.gl short link  →  ?url=
    //   2. Slug (cafe-de-flore, etc.)                          →  ?id=
    //   3. Free text query ("Café de Flore Paris")             →  ?q=
    //   4. Google Place ID (ChIJ…)                            →  show "needs Places API" hint
    let endpoint = null;
    let displayLabel = raw;

    const looksLikeUrl = /^https?:\/\//.test(raw) ||
        /^(maps\.app\.goo\.gl|goo\.gl)\//.test(raw);
    const looksLikeSlug = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/i.test(raw);
    const looksLikePlaceId = /^ChIJ[a-zA-Z0-9_-]{20,}$/.test(raw);

    if (looksLikeUrl) {
        endpoint = `?url=${encodeURIComponent(raw)}`;
        displayLabel = `URL → ${raw.slice(0, 50)}${raw.length > 50 ? '…' : ''}`;
    } else if (looksLikePlaceId) {
        urlPasteHint.innerHTML = `Google Place IDs aren't cached locally. Run <code>reatlas scrape "${raw}"</code> to fetch + cache this one.`;
        return;
    } else if (looksLikeSlug) {
        endpoint = `?id=${encodeURIComponent(raw.toLowerCase())}`;
        displayLabel = `slug → ${raw}`;
    } else {
        // Free text — treat as a place name search
        endpoint = `?q=${encodeURIComponent(raw)}`;
        displayLabel = `searching → ${raw}`;
    }

    urlPasteHint.innerHTML = `Resolving <code>${escapeHtml(displayLabel)}</code>…`;
    const detail = {};
    if (endpoint.startsWith('?url=')) detail.mapsUrl = raw;
    else if (endpoint.startsWith('?query=')) detail.query = raw;
    else if (endpoint.startsWith('?id=')) detail.id = raw.toLowerCase();
    loadPlace(detail);
});

// Quick-pick demo chips → fire loadPlace with the chip's known slug
document.querySelectorAll('.chip[data-place-id]').forEach(chip => {
    chip.addEventListener('click', (e) => {
        e.preventDefault();
        const placeId = chip.dataset.placeId;
        urlPasteHint.innerHTML = `Loading <code>${escapeHtml(chip.textContent.trim())}</code>…`;
        // Rotate globe to the place
        if (window.GlobeAPI?.rotateTo) window.GlobeAPI.rotateTo(placeId);
        loadPlace({ id: placeId, name: chip.textContent.trim() });
        // Scroll the globe into view
        document.getElementById('try')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
});

// ============================================
// Sync popup position to the active pin
// ============================================
const heroContainer = () => document.getElementById('hero3d');

function syncPopupPosition() {
    if (!window.GlobeAPI) {
        requestAnimationFrame(syncPopupPosition);
        return;
    }
    const activeId = window.GlobeAPI.getActivePinId?.();
    const showing = globePopup.style.display !== 'none';
    if (!showing || !activeId) {
        requestAnimationFrame(syncPopupPosition);
        return;
    }
    const pos = window.GlobeAPI.getPinScreenPos?.(activeId);
    const container = heroContainer();
    if (pos && container) {
        const cRect = container.getBoundingClientRect();
        if (!pos.onFront) {
            globePopup.style.opacity = '0';
        } else {
            globePopup.style.opacity = '1';
            const x = cRect.left + pos.x;
            const y = cRect.top + pos.y - 18;
            globePopup.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
        }
    } else {
        // Active but no screen pos yet — hide
        globePopup.style.opacity = '0';
    }
    requestAnimationFrame(syncPopupPosition);
}
requestAnimationFrame(syncPopupPosition);