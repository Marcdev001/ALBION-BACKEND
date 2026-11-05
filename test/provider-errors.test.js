'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mapProviderStatus } = require('../lib/providerErrors');

test('upstream statuses map to safe client responses without provider bodies', () => {
	assert.deepEqual(mapProviderStatus(429), { status: 429, message: 'AI provider rate limit reached. Please retry shortly.' });
	assert.deepEqual(mapProviderStatus(408), { status: 504, message: 'AI provider timed out. Please retry shortly.' });
	assert.deepEqual(mapProviderStatus(504), { status: 504, message: 'AI provider timed out. Please retry shortly.' });
	assert.deepEqual(mapProviderStatus(402), { status: 503, message: 'AI provider is temporarily unavailable. Please try again shortly.' });
	assert.deepEqual(mapProviderStatus(500), { status: 502, message: 'AI provider returned an error. Please try again shortly.' });
});