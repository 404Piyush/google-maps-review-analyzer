/**
 * Showcase mode: render pre-baked sample report + charts.
 * Also wires up the tab switching shared by all three modes.
 */

function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

function chartColors() {
    return {
        positive: '#9ece6a',
        negative: '#f7768e',
        neutral: '#e0af68',
        grid: 'rgba(122,162,247,0.08)',
        text: '#c8c9d6',
    };
}

function chartDefaults() {
    const c = chartColors();
    if (!window.Chart) return;
    Chart.defaults.color = c.text;
    Chart.defaults.borderColor = c.grid;
    Chart.defaults.font.family = "'Inter', sans-serif";
    Chart.defaults.font.size = 12;
}

function switchTab(name) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    $$('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
}

function initTabs() {
    $$('.tab').forEach(tab => {
        tab.addEventListener('click', () => switchTab(tab.dataset.tab));
    });
}

async function loadShowcase() {
    async function fetchText(url) {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`${url}: ${r.status}`);
        return r.text();
    }
    async function fetchJson(url) {
        return JSON.parse(await fetchText(url));
    }

    try {
        const [reportMd, reviews] = await Promise.all([
            fetchText('./sample-report.md'),
            fetchJson('./sample-reviews.json'),
        ]);
        const demo = reviews.__demo || {};
        $('#report').innerHTML = marked.parse(reportMd);
        const sample = (reviews.reviews || reviews).slice(0, 6);
        $('#reviewsPreview').textContent = JSON.stringify(sample, null, 2);
        if (demo.sentiment) renderSentimentChart('sentimentChart', demo.sentiment);
        if (demo.topics) renderTopicsChart('topicsChart', demo.topics);
    } catch (e) {
        console.warn('Showcase data not available:', e.message);
        $('#report').innerHTML = '<p class="muted">Sample report not bundled with this deployment.</p>';
    }
}

function renderSentimentChart(canvasId, data) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const c = chartColors();
    return new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Positive', 'Negative', 'Neutral'],
            datasets: [{
                data: [data.positive, data.negative, data.neutral],
                backgroundColor: [c.positive, c.negative, c.neutral],
                borderColor: '#181926',
                borderWidth: 3,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
        },
    });
}

function renderTopicsChart(canvasId, topics) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    const c = chartColors();
    const labels = topics.map(t => t.topic);
    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Positive', data: topics.map(t => t.positive), backgroundColor: c.positive },
                { label: 'Negative', data: topics.map(t => t.negative), backgroundColor: c.negative },
                { label: 'Neutral', data: topics.map(t => t.neutral), backgroundColor: c.neutral },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: true, ticks: { autoSkip: false, maxRotation: 60 } },
                y: { stacked: true, beginAtZero: true },
            },
            plugins: { legend: { position: 'bottom' } },
        },
    });
}

document.addEventListener('DOMContentLoaded', () => {
    chartDefaults();
    initTabs();
    loadShowcase();
});