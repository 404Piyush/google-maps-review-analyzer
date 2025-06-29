const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// --- CONFIGURATION ---
const OLLAMA_API_URL = 'http://localhost:11434/api/generate';
const FAST_MODEL = 'gemma2:2b'; // Fast model for initial processing
const POWERFUL_MODEL = 'qwen3:8b'; // Powerful model for final analysis
const REVIEWS_FILE = path.join(__dirname, 'reviews.json');
const ANALYSIS_REPORT_FILE = path.join(__dirname, 'analysis-report.md');
const INTERMEDIATE_ANALYSIS_FILE = path.join(__dirname, 'intermediate-analysis.json'); // For debugging
const CONCURRENCY_LIMIT = 50; // Number of reviews to process in parallel
// --- END CONFIGURATION ---

/**
 * Phase 1: Analyze a single review for topics and sentiment using the FAST model.
 */
async function analyzeReview(review) {
    const prompt = `Analyze the following review. Identify key topics and the overall sentiment (positive, negative, or neutral).
Respond with ONLY a single, raw JSON object in the format: {"topics": ["list", "of", "topics"], "sentiment": "positive|negative|neutral"}.

Review: "${review.text}"

JSON:`;

    try {
        const response = await axios.post(OLLAMA_API_URL, {
            model: FAST_MODEL,
            prompt: prompt,
            stream: false,
            format: 'json',
        });

        const analysis = JSON.parse(response.data.response);
        return {
            ...review,
            analysis,
        };
    } catch (error) {
        console.error(`Error analyzing review for "${review.author}". Reason: ${error.message}`);
        return {
            ...review,
            analysis: { topics: ['Error'], sentiment: 'unknown' },
        };
    }
}

/**
 * Phase 2: Generate a final summary report using the POWERFUL model.
 */
async function generateFinalReport(analyzedReviews) {
    console.log(`\nGenerating final report with ${POWERFUL_MODEL}...`);

    // 1. Overall Sentiment Breakdown
    const totalReviewsWithAnalysis = analyzedReviews.filter(r => r.analysis && r.analysis.sentiment !== 'unknown').length;
    const sentimentCounts = analyzedReviews.reduce((acc, r) => {
        const sentiment = r.analysis?.sentiment || 'unknown';
        acc[sentiment] = (acc[sentiment] || 0) + 1;
        return acc;
    }, {});
    const sentimentPercentages = {
        positive: ((sentimentCounts.positive || 0) / totalReviewsWithAnalysis * 100).toFixed(1),
        negative: ((sentimentCounts.negative || 0) / totalReviewsWithAnalysis * 100).toFixed(1),
        neutral: ((sentimentCounts.neutral || 0) / totalReviewsWithAnalysis * 100).toFixed(1),
    };

    // 2. Topic-Sentiment Analysis
    const topicAnalysis = {};
    analyzedReviews.forEach(r => {
        const topics = r.analysis?.topics || [];
        const sentiment = r.analysis?.sentiment || 'unknown';
        if (topics.length > 0 && topics[0] !== 'Error' && sentiment !== 'unknown') {
            topics.forEach(topic => {
                const cleanTopic = topic.trim().toLowerCase().replace(/"/g, '');
                if (!cleanTopic) return;
                if (!topicAnalysis[cleanTopic]) {
                    topicAnalysis[cleanTopic] = { count: 0, positive: 0, negative: 0, neutral: 0 };
                }
                topicAnalysis[cleanTopic].count++;
                topicAnalysis[cleanTopic][sentiment]++;
            });
        }
    });
    
    // 3. Create Topic-Sentiment Table for the prompt
    const sortedTopics = Object.entries(topicAnalysis).sort((a, b) => b[1].count - a[1].count);
    let topicTable = `| Topic | Mentions | Positive | Negative | Neutral |\n`;
    topicTable += `|:---|---:|---:|---:|---:|\n`;
    sortedTopics.slice(0, 10).forEach(([topic, data]) => {
        const posPercent = ((data.positive / data.count) * 100).toFixed(0);
        const negPercent = ((data.negative / data.count) * 100).toFixed(0);
        const neuPercent = ((data.neutral / data.count) * 100).toFixed(0);
        topicTable += `| **${topic}** | ${data.count} | ${posPercent}% | ${negPercent}% | ${neuPercent}% |\n`;
    });

    const positiveReviewSamples = analyzedReviews.filter(r => r.analysis?.sentiment === 'positive').slice(0, 5).map(r => `- "${r.text}"`).join('\n');
    const negativeReviewSamples = analyzedReviews.filter(r => r.analysis?.sentiment === 'negative').slice(0, 5).map(r => `- "${r.text}"`).join('\n');

    const prompt = `You are a data analyst creating a business report. Based on the following customer review data, create a concise, data-driven summary.
The report MUST be structured with the following markdown headings. Do NOT add any conversational text or introductions.

# Customer Feedback Analysis
## 1. Executive Summary
(Provide a brief, one-paragraph summary of key findings, mentioning overall sentiment percentages and the most-discussed topics.)

## 2. Sentiment Analysis
### Overall Sentiment Breakdown
- **Positive:** ${sentimentPercentages.positive}% (${sentimentCounts.positive || 0} reviews)
- **Negative:** ${sentimentPercentages.negative}% (${sentimentCounts.negative || 0} reviews)
- **Neutral:** ${sentimentPercentages.neutral}% (${sentimentCounts.neutral || 0} reviews)

### Key Topics Sentiment
(This table shows the sentiment breakdown for the top 10 most frequently mentioned topics.)
${topicTable}

## 3. Deep Dive: Key Themes
### What's Working Well
(List the top 3 most praised themes based on the data. For each, explain its strength and use a supporting quote from the positive review samples.)

### Areas for Improvement
(List the top 3 most criticized themes. For each, explain the problem and use a supporting quote from the negative review samples.)

## 4. Actionable Recommendations
(Based ONLY on the feedback, provide a bulleted list of 2-4 concrete, prioritized actions the business should take.)

---
DATA FOR CONTEXT:
- Positive Reviews Sample:
${positiveReviewSamples}
- Negative Reviews Sample:
${negativeReviewSamples}
---

Final Report:
`;

    try {
        const response = await axios.post(OLLAMA_API_URL, {
            model: POWERFUL_MODEL,
            prompt: prompt,
            stream: false,
        });
        
        // Isolate the response to ensure no extra text is included.
        const reportContent = response.data.response;
        return reportContent;
    } catch (error) {
        console.error(`Error connecting to Ollama for final report: ${error.message}`);
        return "Error generating report.";
    }
}

async function main() {
    console.log('🚀 Starting advanced review analysis...');
    let reviews;
    try {
        const data = await fs.readFile(REVIEWS_FILE, 'utf8');
        reviews = JSON.parse(data);
    } catch (error) {
        console.error(`❌ Error reading or parsing reviews.json: ${error.message}`);
        return;
    }

    const reviewsWithText = reviews.filter(r => r.text && r.text.trim() !== '');
    console.log(`✅ Loaded ${reviews.length} reviews. Analyzing ${reviewsWithText.length} with text content.`);
    console.log(`Phase 1: Analyzing reviews with ${FAST_MODEL} (Concurrency: ${CONCURRENCY_LIMIT})`);

    const analyzedReviews = [];
    for (let i = 0; i < reviewsWithText.length; i += CONCURRENCY_LIMIT) {
        const batch = reviewsWithText.slice(i, i + CONCURRENCY_LIMIT);
        const analysisPromises = batch.map(analyzeReview);
        const results = await Promise.all(analysisPromises);
        analyzedReviews.push(...results);
        console.log(` -> Batch ${Math.floor(i / CONCURRENCY_LIMIT) + 1} complete. (${analyzedReviews.length}/${reviewsWithText.length})`);
    }

    await fs.writeFile(INTERMEDIATE_ANALYSIS_FILE, JSON.stringify(analyzedReviews, null, 2));
    console.log(`✅ Phase 1 complete. Intermediate results saved.`);

    const finalReport = await generateFinalReport(analyzedReviews);
    await fs.writeFile(ANALYSIS_REPORT_FILE, finalReport, 'utf8');
    console.log(`\n✅ Analysis complete! Report saved to ${ANALYSIS_REPORT_FILE}`);
}

main();