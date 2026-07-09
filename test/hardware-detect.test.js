const { test } = require('node:test');
const assert = require('node:assert/strict');
const { detectGPU } = require('../lib/hardware-detect');

test('detectGPU returns an object with gpu and vramGB', async () => {
    const result = await detectGPU();
    assert.equal(typeof result, 'object');
    assert.ok('gpu' in result);
    assert.ok('vramGB' in result);
});
