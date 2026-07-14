// ============================================
// interactive.js — Paste-JSON tab (client-side analysis)
// Uses D3.js donut + word cloud from viz.js
// Inline AFINN-style lexicon (no network)
// ============================================
import { renderDonut, renderWordCloud } from './viz.js';

const POSITIVE_WORDS = new Set([
    'amazing','awesome','excellent','fantastic','wonderful','great','good','best','love','loved','perfect','perfectly',
    'friendly','helpful','kind','attentive','professional','clean','fresh','delicious','tasty','yummy','flavorful',
    'fast','quick','efficient','smooth','recommend','recommended','definitely','must','gem','hidden','outstanding',
    'cozy','charming','beautiful','stunning','impressive','exceptional','superb','top','quality','worth','value',
    'happy','pleased','satisfied','enjoyed','enjoyable','pleasant','warm','welcoming','inviting','relaxing','comfortable',
    'knowledgeable','accommodating','generous','reasonable','affordable','fair','honest','reliable','trustworthy','consistent',
    'fun','delightful','magical','memorable','special','unique','fabulous','brilliant','smart','clever','thoughtful',
    'incredible','phenomenal','divine','heavenly','spotless','pristine','polished','crispy','tender','juicy','freshly',
    'loved','awesome','phenomenal','5star','topnotch','solid','crisp','prompt','attentive','considerate','sweet',
    'love','wow','wow!','must-try','must try','go-to','favorite','favourite','best'
]);

const NEGATIVE_WORDS = new Set([
    'terrible','awful','horrible','bad','worst','hate','hated','disappointing','disappointed','rude','unprofessional',
    'dirty','filthy','gross','slow','cold','stale','bland','tasteless','overpriced','expensive','overcooked','undercooked',
    'salty','bland','watery','oily','greasy','burnt','tough','dry','tasteless','forgetful','ignored','long','wait',
    'waited','rushed','noisy','loud','cramped','tiny','small','uncomfortable','broken','damaged','moldy','expired',
    'stale','unfresh','mediocre','okay','meh','nothing','average','avoid','waste','wasted','refund','complaint',
    'unhappy','upset','angry','frustrated','annoyed','disgusted','horrendous','atrocious','appalling','dreadful',
    'shabby','shoddy','sloppy','careless','clueless','useless','pointless','ridiculous','unacceptable','pathetic',
    'wouldn\'t','never','won\'t','not worth','overpriced','rip-off','ripoff','scam','fake','misleading','lying',
    'ignored','forgotten','forgetful','rude','impolite','unhelpful','unkind','mean','aggressive','hostile','cold',
    'freezing','lukewarm','soggy','limp','rubbery','tough','chewy','bitter','sour','rancid','off','sketchy',
    'sick','ill','food poisoning','hair','bug','insect','roach','rat','dirty','unsanitary','unhygienic','smelly'
]);

const STOPWORDS = new Set([
    'the','a','an','and','or','but','is','was','were','are','be','been','being','have','has','had','do','does','did',
    'will','would','should','could','may','might','must','shall','can','need','dare','ought','used','to','of','in',
    'for','on','with','at','by','from','as','into','through','during','before','after','above','below','between',
    'out','off','over','under','again','further','then','once','here','there','when','where','why','how','all',
    'any','both','each','few','more','most','other','some','such','no','nor','not','only','own','same','so',
    'than','too','very','just','because','if','while','about','against','also','among','around','it','its','this',
    'that','these','those','i','me','my','myself','we','our','ours','ourselves','you','your','yours','he','him',
    'his','she','her','hers','they','them','their','theirs','what','which','who','whom','am','up','down','get',
    'got','go','went','come','came','take','took','make','made','one','two','three'
]);

function analyzeSentiment(text) {
    const words = text.toLowerCase().match(/\b[\w']+\b/g) || [];
    let score = 0;
    let hits = 0;
    for (const w of words) {
        if (POSITIVE_WORDS.has(w)) { score += 1; hits++; }
        else if (NEGATIVE_WORDS.has(w)) { score -= 1; hits++; }
    }
    if (hits === 0) return { label: 'neutral', score: 0 };
    if (score > 0) return { label: 'positive', score };
    if (score < 0) return { label: 'negative', score };
    return { label: 'neutral', score: 0 };
}

function extractTopics(reviews, maxTopics = 12) {
    const counts = new Map();
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
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxTopics)
        .map(([text, value]) => ({ text, value, sentiment: 'neutral' }));
}

function computeStats(reviews) {
    const total = reviews.length;
    const stars = reviews.map((r) => Number(r.stars) || 0).filter((s) => s > 0);
    const avgStars = stars.length ? (stars.reduce((a, b) => a + b, 0) / stars.length).toFixed(2) : '—';
    const sentiments = reviews.map((r) => analyzeSentiment(r.text || '').label);
    const pos = sentiments.filter((s) => s === 'positive').length;
    const neu = sentiments.filter((s) => s === 'neutral').length;
    const neg = sentiments.filter((s) => s === 'negative').length;
    return { total, avgStars, pos, neu, neg };
}

// Sample data (matches the showcase)
const SAMPLE = [
    { name: 'Alice', stars: 5, text: 'Amazing food and super friendly staff. The pasta was perfectly cooked and the service was fast. Definitely coming back!' },
    { name: 'Bob', stars: 4, text: 'Good coffee, cozy atmosphere. A bit pricey but worth it for the quality.' },
    { name: 'Carol', stars: 5, text: 'Best brunch in town. The pancakes are divine and the staff is so attentive and welcoming.' },
    { name: 'Dan', stars: 2, text: 'Waited 40 minutes for cold food. Disappointing for the price.' },
    { name: 'Eve', stars: 5, text: 'Outstanding service! The waiter was knowledgeable about the menu and gave great recommendations.' },
    { name: 'Frank', stars: 1, text: 'Terrible experience. Rude staff and the food was stale. Would not recommend.' },
    { name: 'Grace', stars: 4, text: 'Nice ambiance, tasty food. A little noisy on weekends but otherwise great spot.' },
    { name: 'Henry', stars: 5, text: 'Hidden gem! Fresh ingredients, generous portions, and reasonable prices. Loved everything we ordered.' },
    { name: 'Ivy', stars: 3, text: 'Average food. Nothing wrong with it but nothing memorable either.' },
    { name: 'Jack', stars: 5, text: 'Phenomenal experience from start to finish. The dessert was incredible and the wine list is top-notch.' },
];

function renderResults(reviews) {
    const stats = computeStats(reviews);
    const topics = extractTopics(reviews);

    const sentimentData = [
        { label: 'Positive', value: stats.pos, color: '#c5f900' },
        { label: 'Neutral', value: stats.neu, color: '#0a0a0a' },
        { label: 'Negative', value: stats.neg, color: '#c2410c' },
    ];

    // Color topics by adjacent word context
    topics.forEach((t) => {
        const reviewsWithWord = reviews.filter((r) => (r.text || '').toLowerCase().includes(t.text));
        const sentiments = reviewsWithWord.map((r) => analyzeSentiment(r.text || '').label);
        const pos = sentiments.filter((s) => s === 'positive').length;
        const neg = sentiments.filter((s) => s === 'negative').length;
        if (pos > neg && pos > 0) t.sentiment = 'positive';
        else if (neg > pos && neg > 0) t.sentiment = 'negative';
        else t.sentiment = 'neutral';
    });

    const donutEl = document.getElementById('pasteDonut');
    const cloudEl = document.getElementById('pasteCloud');
    if (donutEl) renderDonut(donutEl, sentimentData, { centerLabel: stats.total, centerSubLabel: 'reviews' });
    if (cloudEl) renderWordCloud(cloudEl, topics);

    const statsEl = document.getElementById('pasteStats');
    const metaEl = document.getElementById('pasteMeta');
    if (metaEl) metaEl.textContent = `${stats.total} reviews`;
    if (statsEl) {
        const posPct = stats.total ? Math.round((stats.pos / stats.total) * 100) : 0;
        const negPct = stats.total ? Math.round((stats.neg / stats.total) * 100) : 0;
        statsEl.innerHTML = `
            <h3>Summary</h3>
            <p>Analyzed <strong>${stats.total}</strong> reviews in your browser using a local lexicon — no data left this tab.</p>
            <h3>Stars</h3>
            <p>Average rating: <strong>${stats.avgStars}</strong> / 5</p>
            <h3>Sentiment</h3>
            <ul>
                <li><strong>${stats.pos}</strong> positive (${posPct}%)</li>
                <li><strong>${stats.neu}</strong> neutral</li>
                <li><strong>${stats.neg}</strong> negative (${negPct}%)</li>
            </ul>
            <h3>Top topics</h3>
            <p>${topics.slice(0, 8).map((t) => `<code>${t.text}</code>`).join(' · ')}</p>
        `;
    }
}

// Wire up DOM
const jsonInput = document.getElementById('jsonInput');
const analyzeBtn = document.getElementById('analyzeBtn');
const loadSampleBtn = document.getElementById('loadSampleBtn');
const pasteResults = document.getElementById('pasteResults');
const pasteStatus = document.getElementById('pasteStatus');

function setStatus(msg, type = '') {
    if (!pasteStatus) return;
    pasteStatus.textContent = msg;
    pasteStatus.className = `status${type ? ' is-' + type : ''}`;
}

function tryParse() {
    const raw = jsonInput.value.trim();
    if (!raw) {
        setStatus('paste some JSON to analyze', 'error');
        return null;
    }
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error('must be an array');
        if (parsed.length === 0) {
            setStatus('array is empty', 'error');
            return null;
        }
        setStatus(`${parsed.length} reviews parsed`, 'success');
        return parsed;
    } catch (err) {
        setStatus('invalid JSON: ' + err.message, 'error');
        return null;
    }
}

if (analyzeBtn) {
    analyzeBtn.addEventListener('click', () => {
        const reviews = tryParse();
        if (!reviews) return;
        renderResults(reviews);
        pasteResults.hidden = false;
    });
}

if (loadSampleBtn) {
    loadSampleBtn.addEventListener('click', () => {
        jsonInput.value = JSON.stringify(SAMPLE, null, 2);
        renderResults(SAMPLE);
        pasteResults.hidden = false;
        setStatus(`loaded ${SAMPLE.length} sample reviews`, 'success');
    });
}