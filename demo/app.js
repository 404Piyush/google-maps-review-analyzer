(async () => {
    async function fetchText(url) {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`${url}: ${r.status}`);
        return r.text();
    }
    async function fetchJson(url) {
        return JSON.parse(await fetchText(url));
    }

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
        Chart.defaults.color = c.text;
        Chart.defaults.borderColor = c.grid;
        Chart.defaults.font.family = "'Inter', sans-serif";
        Chart.defaults.font.size = 12;
    }

    function renderReport(md) {
        document.getElementById('report').innerHTML = marked.parse(md);
    }

    function renderReviewsPreview(data) {
        const sample = (data.reviews || data).slice(0, 6);
        document.getElementById('reviewsPreview').textContent = JSON.stringify(sample, null, 2);
    }

    function renderSentimentChart(data) {
        const ctx = document.getElementById('sentimentChart').getContext('2d');
        const c = chartColors();
        new Chart(ctx, {
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

    function renderTopicsChart(topics) {
        const ctx = document.getElementById('topicsChart').getContext('2d');
        const c = chartColors();
        const labels = topics.map(t => t.topic);
        const pos = topics.map(t => t.positive);
        const neg = topics.map(t => t.negative);
        const neu = topics.map(t => t.neutral);
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    { label: 'Positive', data: pos, backgroundColor: c.positive },
                    { label: 'Negative', data: neg, backgroundColor: c.negative },
                    { label: 'Neutral', data: neu, backgroundColor: c.neutral },
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

    try {
        chartDefaults();
        const [reportMd, reviews] = await Promise.all([
            fetchText('./sample-report.md'),
            fetchJson('./sample-reviews.json'),
        ]);
        const demo = reviews.__demo || {};
        renderReport(reportMd);
        renderReviewsPreview(reviews);
        if (demo.sentiment) renderSentimentChart(demo.sentiment);
        if (demo.topics) renderTopicsChart(demo.topics);
    } catch (e) {
        console.warn('Demo data not available:', e.message);
        document.getElementById('report').innerHTML =
            '<p class="muted">Sample report not bundled with this deployment.</p>';
    }
})();
