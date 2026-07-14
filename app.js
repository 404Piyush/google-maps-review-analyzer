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