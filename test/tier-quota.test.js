'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateTierQuota, getMaxCompletionTokens, MAX_COMPLETION_TOKENS } = require('../lib/tierQuota');

test('aggregate tier quota blocks requests beyond the exact allocated plan total', () => {
	assert.deepEqual(evaluateTierQuota({ usedTokens: 6_999_000, estimatedTokens: 1_000, cap: 7_000_000 }), {
		allowed: true,
		used: 6_999_000,
		estimated: 1_000,
		cap: 7_000_000,
		remaining: 1_000
	});
	assert.equal(evaluateTierQuota({ usedTokens: 7_000_000, estimatedTokens: 1, cap: 7_000_000 }).allowed, false);
	assert.equal(evaluateTierQuota({ usedTokens: 7_000_000, estimatedTokens: 0, cap: 7_000_000 }).allowed, true);
});

test('per-model allocations cannot be consumed beyond the aggregate Starter or Pro total', () => {
	assert.equal(evaluateTierQuota({ usedTokens: 0, estimatedTokens: 7_000_001, cap: 7_000_000 }).allowed, false);
	assert.equal(evaluateTierQuota({ usedTokens: 0, estimatedTokens: 8_000_001, cap: 8_000_000 }).allowed, false);
});

test('completion token reservation is server-bounded and consistent with request limits', () => {
	assert.equal(getMaxCompletionTokens({ max_tokens: 1200 }), 1200);
	assert.equal(getMaxCompletionTokens({ max_completion_tokens: 1600 }), 1600);
	assert.equal(getMaxCompletionTokens({ max_tokens: 9000 }), MAX_COMPLETION_TOKENS);
	assert.equal(getMaxCompletionTokens({ max_tokens: -1 }), MAX_COMPLETION_TOKENS);
	assert.equal(getMaxCompletionTokens({}), MAX_COMPLETION_TOKENS);
});