'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { TIER_PRICES_USD } = require('../lib/tierPricing');

test('NOWPayments plan prices are fixed server-side in USD', () => {
	assert.deepEqual(TIER_PRICES_USD, { learner: 3, starter: 8, pro: 14 });
	assert.equal(Object.isFrozen(TIER_PRICES_USD), true);
});