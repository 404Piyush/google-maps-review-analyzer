/**
 * Paste-JSON mode: client-side sentiment + topic aggregation.
 * No network calls. Pure browser JS.
 *
 * Sentiment scoring: AFINN-165-inspired inline word list. For a real
 * sentiment model, swap for `sentiment` npm package or a WebLLM call.
 */

const POSITIVE_WORDS = new Set([
    'amazing', 'awesome', 'excellent', 'fantastic', 'wonderful', 'great', 'good', 'best',
    'love', 'loved', 'lovely', 'perfect', 'perfectly', 'superb', 'outstanding', 'brilliant',
    'friendly', 'kind', 'helpful', 'attentive', 'professional', 'accommodating', 'welcoming',
    'clean', 'cozy', 'beautiful', 'gorgeous', 'spacious', 'comfortable', 'pleasant', 'nice',
    'delicious', 'tasty', 'fresh', 'flavorful', 'yummy', 'satisfying', 'perfectly cooked',
    'fast', 'quick', 'prompt', 'efficient', 'speedy', 'smooth',
    'affordable', 'reasonable', 'worth', 'value', 'gem', 'recommend', 'recommended',
    'memorable', 'enjoyable', 'pleasant', 'impressive', 'outstanding', 'exceptional',
]);

const NEGATIVE_WORDS = new Set([
    'awful', 'terrible', 'horrible', 'worst', 'bad', 'poor', 'disappointing', 'disappointed',
    'rude', 'unprofessional', 'unhelpful', 'unfriendly', 'slow', 'sluggish', 'delayed',
    'dirty', 'messy', 'filthy', 'disgusting', 'gross', 'smelly', 'sticky', 'stale',
    'overpriced', 'expensive', 'costly', 'waste', 'ripoff', 'scam',
    'cold', 'burnt', 'tasteless', 'bland', 'soggy', 'oily', 'salty', 'soggy',
    'loud', 'noisy', 'cramped', 'crowded', 'uncomfortable', 'tiny',
    'broken', 'damaged', 'faulty', 'wrong', 'mistake', 'error',
    'avoid', 'never', 'worst', 'hate', 'hated', 'dislike',
]);

const STOPWORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
    'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'i', 'me', 'my',
    'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'yourself', 'he',
    'him', 'his', 'she', 'her', 'hers', 'it', 'its', 'itself', 'they', 'them', 'their',
    'theirs', 'what', 'which', 'who', 'whom', 'this', 'that', 'these', 'those', 'am',
    'if', 'then', 'else', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each',
    'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 'just', 'of', 'in', 'on', 'at', 'to', 'from',
    'with', 'by', 'for', 'about', 'into', 'through', 'over', 'under', 'out', 'off',
    'up', 'down', 'as', 'because', 'until', 'while', 'again', 'further', 'once',
]);

function tokenize(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s']/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

function scoreText(text) {
    const tokens = tokenize(text);
    let pos = 0, neg = 0;
    for (const t of tokens) {
        if (POSITIVE_WORDS.has(t)) pos++;
        else if (NEGATIVE_WORDS.has(t)) neg++;
    }
    const score = pos - neg;
    let sentiment = 'neutral';
    if (score > 0) sentiment = 'positive';
    else if (score < 0) sentiment = 'negative';
    return { sentiment, score, pos, neg };
}

function extractTopics(text, maxTopics = 4) {
    const tokens = tokenize(text);
    const freq = {};
    for (const t of tokens) {
        if (POSITIVE_WORDS.has(t) || NEGATIVE_WORDS.has(t)) continue;
        if (t.length < 4) continue;
        freq[t] = (freq[t] || 0) + 1;
    }
    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxTopics)
        .map(([w]) => w);
}

function analyzeReviews(reviews) {
    const withText = reviews.filter(r => r.text && String(r.text).trim() !== '');
    const analyzed = withText.map(r => {
        const score = scoreText(r.text);
        const topics = extractTopics(r.text);
        return { ...r, analysis: { ...score, topics } };
    });

    const sentiments = { positive: 0, negative: 0, neutral: 0 };
    const topicStats = {};
    for (const r of analyzed) {
        sentiments[r.analysis.sentiment]++;
        for (const topic of r.analysis.topics) {
            topicStats[topic] = topicStats[topic] || { count: 0, positive: 0, negative: 0, neutral: 0 };
            topicStats[topic].count++;
            topicStats[topic][r.analysis.sentiment]++;
        }
    }

    const topTopics = Object.entries(topicStats)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 8)
        .map(([topic, d]) => ({ topic, ...d }));

    return { analyzed, sentiments, topTopics, total: withText.length };
}

function renderStats(containerId, result) {
    const { sentiments, topTopics, total } = result;
    const posPct = total ? ((sentiments.positive / total) * 100).toFixed(1) : '0';
    const negPct = total ? ((sentiments.negative / total) * 100).toFixed(1) : '0';
    const neuPct = total ? ((sentiments.neutral / total) * 100).toFixed(1) : '0';

    const topicTable = topTopics.length === 0 ? '_No topics detected_'
        : `| Topic | Mentions | Positive | Negative | Neutral |\n|:---|---:|---:|---:|---:|\n` +
          topTopics.map(t => {
              const p = ((t.positive / t.count) * 100).toFixed(0);
              const n = ((t.negative / t.count) * 100).toFixed(0);
              const u = ((t.neutral / t.count) * 100).toFixed(0);
              return `| **${t.topic}** | ${t.count} | ${p}% | ${n}% | ${u}% |`;
          }).join('\n');

    const md = `# Sentiment Breakdown
- **Positive:** ${posPct}% (${sentiments.positive} reviews)
- **Negative:** ${negPct}% (${sentiments.negative} reviews)
- **Neutral:** ${neuPct}% (${sentiments.neutral} reviews)
- **Total analyzed:** ${total} reviews

# Top Topics (keyword frequency)
${topicTable}

<sub>💡 This is client-side analysis (no LLM call). For an LLM-powered executive report with recommendations, switch to the <b>Live via OpenRouter</b> tab.</sub>`;

    document.getElementById(containerId).innerHTML = marked.parse(md);
}

let pasteCharts = [];
function clearPasteCharts() {
    pasteCharts.forEach(c => c.destroy());
    pasteCharts = [];
}

function renderPasteResults(result) {
    clearPasteCharts();
    document.getElementById('pasteResults').classList.remove('hidden');
    renderStats('pasteStats', result);
    pasteCharts.push(renderSentimentChart('pasteSentimentChart', result.sentiments));
    pasteCharts.push(renderTopicsChart('pasteTopicsChart', result.topics));
}

async function loadPasteSample() {
    try {
        const sample = await fetch('./sample-reviews.json').then(r => r.json());
        const reviews = sample.reviews || sample;
        document.getElementById('jsonInput').value = JSON.stringify(reviews, null, 2);
        runAnalysis();
    } catch (e) {
        document.getElementById('pasteStatus').textContent = `Could not load sample: ${e.message}`;
    }
}

function runAnalysis() {
    const raw = document.getElementById('jsonInput').value.trim();
    const status = document.getElementById('pasteStatus');
    if (!raw) {
        status.textContent = 'Paste some JSON first.';
        return;
    }
    let reviews;
    try {
        reviews = JSON.parse(raw);
    } catch (e) {
        status.textContent = `Invalid JSON: ${e.message}`;
        return;
    }
    if (!Array.isArray(reviews)) {
        status.textContent = 'Expected an array of reviews.';
        return;
    }
    const t0 = performance.now();
    const result = analyzeReviews(reviews);
    const elapsed = (performance.now() - t0).toFixed(0);
    renderPasteResults(result);
    status.textContent = `Analyzed ${result.total} reviews in ${elapsed}ms (local)`;
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('analyzeBtn').addEventListener('click', runAnalysis);
    document.getElementById('loadSampleBtn').addEventListener('click', loadPasteSample);
});