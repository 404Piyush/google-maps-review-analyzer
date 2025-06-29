const fs = require('fs');
const path = require('path');

const REVIEWS_FILE = path.join(__dirname, 'extracted-reviews.json');
const REPORT_FILE = path.join(__dirname, 'analysis-report.md');

// Basic list of positive/negative words for sentiment scoring
const POSITIVE_WORDS = ['good', 'great', 'amazing', 'awesome', 'love', 'best', 'excellent', 'nice', 'friendly', 'top-notch', 'wonderful', 'highly recommend', 'must-visit', 'cozy', 'fun'];
const NEGATIVE_WORDS = ['bad', 'terrible', 'awful', 'poor', 'hate', 'worst', 'disappointing', 'rude', 'problem', 'issue'];

function analyzeReviews() {
    console.log('📊 Starting review analysis...');

    if (!fs.existsSync(REVIEWS_FILE)) {
        console.error(`❌ Analysis failed: ${REVIEWS_FILE} not found.`);
        return;
    }

    const reviewsData = fs.readFileSync(REVIEWS_FILE, 'utf-8');
    const reviews = JSON.parse(reviewsData);

    if (reviews.length === 0) {
        console.log('⚠️ No reviews to analyze.');
        fs.writeFileSync(REPORT_FILE, '# Analysis Report\n\nNo reviews were extracted, so no analysis could be performed.\n');
        return;
    }

    let totalStars = 0;
    let reviewCount = 0;
    const wordCounts = {};
    let positiveReviews = 0;
    let negativeReviews = 0;
    let neutralReviews = 0;

    for (const review of reviews) {
        // Star analysis
        if (typeof review.stars === 'number') {
            totalStars += review.stars;
            reviewCount++;
        }

        // Sentiment analysis based on keywords
        const comment = (review.comment || '').toLowerCase();
        let score = 0;
        POSITIVE_WORDS.forEach(word => {
            if (comment.includes(word)) score++;
        });
        NEGATIVE_WORDS.forEach(word => {
            if (comment.includes(word)) score--;
        });

        if (score > 0) positiveReviews++;
        else if (score < 0) negativeReviews++;
        else neutralReviews++;

        // Word frequency analysis (simple tokenization)
        const words = comment.replace(/[^\\w\\s]/g, '').split(/\\s+/);
        for (const word of words) {
            if (word.length > 3) { // Ignore short words
                wordCounts[word] = (wordCounts[word] || 0) + 1;
            }
        }
    }

    const averageRating = reviewCount > 0 ? (totalStars / reviewCount).toFixed(2) : 'N/A';

    const sortedWords = Object.entries(wordCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 15);

    // --- Generate Markdown Report ---
    let reportContent = `# Google Maps Review Analysis Report\n\n`;
    reportContent += `Analysis based on **${reviews.length}** reviews.\n\n`;
    reportContent += `## 📊 At a Glance\n\n`;
    reportContent += `*   **Average Star Rating:** ${averageRating} / 5\n`;
    reportContent += `*   **Positive Reviews:** ${positiveReviews}\n`;
    reportContent += `*   **Negative Reviews:** ${negativeReviews}\n`;
    reportContent += `*   **Neutral Reviews:** ${neutralReviews}\n\n`;
    reportContent += `## 🔑 Most Common Keywords\n\n`;
    reportContent += `| Keyword | Mentions |\n`;
    reportContent += `|---|---|\n`;
    for (const [word, count] of sortedWords) {
        reportContent += `| ${word} | ${count} |\n`;
    }

    fs.writeFileSync(REPORT_FILE, reportContent);
    console.log(`✅ Analysis complete. Report saved to ${REPORT_FILE}`);
}

analyzeReviews(); 