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
// 6. Globe popup — anchored to active pin, fetches /api/scrape as NDJSON
// ============================================
const globePopup = document.getElementById('globePopup');
const popupEmpty = document.getElementById('popupEmpty');
const popupClose = globePopup?.querySelector('.popup-close');
const popupCloseEmpty = popupEmpty?.querySelector('.popup-close');
const urlPasteForm = document.getElementById('urlPasteForm');
const urlPasteInput = document.getElementById('mapsUrl');
const urlPasteHint = document.getElementById('urlPasteHint');

let currentScrape = null; // AbortController for any in-flight scrape

function hideAllPopups() {
    globePopup && (globePopup.hidden = true);
    popupEmpty && (popupEmpty.hidden = true);
    if (window.GlobeAPI) window.GlobeAPI.close();
}

function showPopupLoading(place) {
    if (!globePopup) return;
    hideAllPopups();
    globePopup.hidden = false;
    // Optimistic fill
    globePopup.querySelector('.popup-name').textContent = place.name || 'Loading…';
    globePopup.querySelector('.popup-loc').textContent = [place.city, place.country].filter(Boolean).join(', ');
    globePopup.querySelector('.popup-emoji').textContent = place.emoji || '📍';
    globePopup.querySelector('.popup-rating').textContent = place.rating ? `★ ${place.rating}` : '';
    globePopup.querySelector('.popup-reviewcount').textContent = 'Scraping…';
    globePopup.querySelector('.popup-summary').style.display = 'none';
    globePopup.querySelector('#popupCta').style.display = 'none';
}

function showPopupContent(place, allReviews, scrapedAt) {
    if (!globePopup) return;
    hideAllPopups();
    globePopup.hidden = false;

    // Header
    globePopup.querySelector('.popup-name').textContent = place.name || '';
    globePopup.querySelector('.popup-loc').textContent = [place.city, place.country].filter(Boolean).join(', ');
    globePopup.querySelector('.popup-emoji').textContent = place.emoji || '📍';
    globePopup.querySelector('.popup-rating').textContent = place.rating ? `★ ${place.rating}` : '';

    // Summary
    const pos = allReviews.filter(r => r.stars >= 4).length;
    const neu = allReviews.filter(r => r.stars === 3).length;
    const neg = allReviews.filter(r => r.stars <= 2).length;
    const total = allReviews.length || 1;
    globePopup.querySelector('.popup-reviewcount').textContent =
        `${allReviews.length} of ${place.reviews_count_estimate?.toLocaleString() || allReviews.length} reviews`;
    const barPos = globePopup.querySelector('.popup-bar-pos');
    const barNeu = globePopup.querySelector('.popup-bar-neu');
    const barNeg = globePopup.querySelector('.popup-bar-neg');
    if (barPos) barPos.style.width = `${(pos / total) * 100}%`;
    if (barNeu) barNeu.style.width = `${(neu / total) * 100}%`;
    if (barNeg) barNeg.style.width = `${(neg / total) * 100}%`;

    globePopup.querySelector('.popup-summary').style.display = '';

    // Link to job page
    const cta = globePopup.querySelector('#popupCta');
    if (cta) {
        cta.href = `/job.html?id=${encodeURIComponent(place.id)}`;
        cta.style.display = '';
    }

    // Cache for job page (in case user reloads)
    try {
        sessionStorage.setItem(`scraped:${place.id}`, JSON.stringify({
            place,
            reviews: allReviews,
            scraped_at: scrapedAt,
            source: 'cache',
        }));
    } catch {}
}

function showPopupEmpty(placeName) {
    if (!popupEmpty) return;
    hideAllPopups();
    popupEmpty.hidden = false;
    popupEmpty.querySelector('.popup-name').textContent = 'Not yet scraped';
    popupEmpty.querySelector('.popup-loc').textContent = placeName
        ? `No cache for “${placeName}”`
        : 'No cache for this place';
}

async function loadPlace(place) {
    if (currentScrape) currentScrape.abort();
    const ctrl = new AbortController();
    currentScrape = ctrl;

    showPopupLoading(place);

    const params = place.id ? `?id=${encodeURIComponent(place.id)}`
                : place.mapsUrl ? `?url=${encodeURIComponent(place.mapsUrl)}`
                : place.query ? `?query=${encodeURIComponent(place.query)}`
                : null;
    if (!params) {
        showPopupEmpty('unknown');
        return;
    }

    try {
        const res = await fetch(`/api/scrape${params}`, { signal: ctrl.signal });
        if (!res.ok || !res.body) {
            showPopupEmpty(place.name);
            return;
        }
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
                    // Update place meta info from API
                    if (meta.place) Object.assign(place, meta.place);
                } else if (evt.type === 'batch') {
                    allReviews = allReviews.concat(evt.reviews || []);
                    // Live update the count
                    const c = globePopup.querySelector('.popup-reviewcount');
                    if (c) {
                        const total = evt.total || meta?.total_estimate || allReviews.length;
                        c.textContent = `Scraped ${evt.scraped || allReviews.length} / ${total} reviews…`;
                    }
                    // As soon as we have some data, render the content (the popup already shows place name)
                    if (allReviews.length >= 1 && !globePopup.classList.contains('visible-data')) {
                        // No-op — keep showing loading until done
                    }
                } else if (evt.type === 'done') {
                    scrapedAt = evt.scraped_at;
                } else if (evt.type === 'error') {
                    showPopupEmpty(meta?.place?.name || place.name || null);
                    return;
                }
            }
        }

        if (meta && allReviews.length > 0) {
            const finalPlace = {
                ...place,
                name: meta.place?.name || place.name,
                rating: meta.place?.rating || place.rating,
                reviews_count_estimate: meta.place?.reviews_count_estimate || allReviews.length,
            };
            showPopupContent(finalPlace, allReviews, scrapedAt);
        } else {
            showPopupEmpty(place.name);
        }
    } catch (err) {
        if (err.name !== 'AbortError') showPopupEmpty(place.name);
    }
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ============================================
// Wire up events
// ============================================
window.addEventListener('globe:select', (e) => loadPlace(e.detail));
window.addEventListener('globe:close', () => {
    if (currentScrape) currentScrape.abort();
    hideAllPopups();
});

popupClose?.addEventListener('click', () => {
    if (currentScrape) currentScrape.abort();
    hideAllPopups();
});
popupCloseEmpty?.addEventListener('click', () => {
    if (currentScrape) currentScrape.abort();
    hideAllPopups();
});

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (currentScrape) currentScrape.abort();
    hideAllPopups();
});

urlPasteForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const url = urlPasteInput.value.trim();
    if (!url) return;
    urlPasteHint.innerHTML = `Resolving <code>${escapeHtml(url.slice(0, 60))}${url.length > 60 ? '…' : ''}</code>…`;
    // Pass URL to globe — globe will dispatch globe:select with place={id?url?query?}
    // We need a synthetic place object. Use a meta fetch via api/scrape?url first to resolve.
    window.dispatchEvent(new CustomEvent('globe:select', { detail: { mapsUrl: url, name: url.slice(0, 40) } }));
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