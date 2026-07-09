const { test } = require('node:test');
const assert = require('node:assert/strict');
const { aggregateTopicStats, buildBatchPrompt, buildSinglePrompt } = require('../topic-analysis.js');

test('aggregateTopicStats counts sentiments and topics', () => {
    const analyzed = [
        { text: 'a', analysis: { topics: ['service', 'food'], sentiment: 'positive' } },
        { text: 'b', analysis: { topics: ['service'], sentiment: 'positive' } },
        { text: 'c', analysis: { topics: ['wait'], sentiment: 'negative' } },
        { text: 'd', analysis: { topics: ['Error'], sentiment: 'unknown' } },
    ];
    const { topics, sentiments } = aggregateTopicStats(analyzed);
    assert.equal(sentiments.positive, 2);
    assert.equal(sentiments.negative, 1);
    assert.equal(topics.service.count, 2);
    assert.equal(topics.wait.count, 1);
});

test('buildBatchPrompt includes all reviews with indexes', () => {
    const reviews = [{ text: 'review one' }, { text: 'review two' }];
    const prompt = buildBatchPrompt(reviews);
    assert.match(prompt, /0\. review one/);
    assert.match(prompt, /1\. review two/);
    assert.match(prompt, /JSON array/);
});

test('buildSinglePrompt truncates overly long reviews', () => {
    const long = 'a'.repeat(10000);
    const prompt = buildSinglePrompt(long);
    assert.ok(prompt.length < 10000);
    assert.match(prompt, /JSON/);
});

test('aggregateTopicStats returns empty for empty input', () => {
    const { topics, sentiments } = aggregateTopicStats([]);
    assert.deepEqual(topics, {});
    assert.deepEqual(sentiments, { positive: 0, negative: 0, neutral: 0 });
});
