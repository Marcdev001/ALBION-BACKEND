'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MODEL_IDS, MODEL_BALANCES_BY_TIER, MODEL_BALANCE_TOTALS_BY_TIER, authorizeModel, canUseModel, getDeepInfraModelId, getModelAccessError, isKnownModel, mergeModelCaps } = require('../lib/modelCatalog');

test('catalog accepts the five exact DeepInfra IDs without changing case', () => {
	const expected = [
		'deepseek-ai/DeepSeek-V4-Flash',
		'deepseek-ai/DeepSeek-V4.1-Flash-1017',
		'XiaomiMiMo/MiMo-V2.6-Flash',
		'deepseek-ai/DeepSeek-V4-Pro-0813',
		'XiaomiMiMo/MiMo-V2.6-Pro'
	];

	assert.deepEqual(Object.values(MODEL_IDS), expected);
	for (const modelId of expected) {
		assert.equal(isKnownModel(modelId), true);
		assert.equal(getDeepInfraModelId(modelId), modelId);
	}
});

test('Free, Starter, and Pro model authorization matrix is enforced', () => {
	assert.deepEqual(
		Object.values(MODEL_IDS).map((modelId) => canUseModel('free', modelId)),
		[true, false, false, false, false]
	);
	assert.deepEqual(
		Object.values(MODEL_IDS).map((modelId) => canUseModel('starter', modelId)),
		[false, true, true, false, false]
	);
	assert.deepEqual(Object.values(MODEL_IDS).map((modelId) => canUseModel('pro', modelId)), [false, false, false, true, true]);
});

test('unknown and legacy aliases are rejected instead of being silently substituted', () => {
	for (const legacyId of ['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek/deepseek-v4.1-flash-1017', 'qwen/qwen3-coder-30b-a3b-instruct']) {
		assert.equal(isKnownModel(legacyId), false);
		assert.equal(getDeepInfraModelId(legacyId), null);
		assert.match(getModelAccessError('pro', legacyId), /not supported/);
	}
	assert.match(getModelAccessError('free', MODEL_IDS.STARTER_DEEPSEEK), /Starter or Pro/);
	assert.match(getModelAccessError('starter', MODEL_IDS.PRO_DEEPSEEK), /Pro/);
});

test('unauthorized exact model requests return a clear 403 decision', () => {
	for (const tier of ['free', 'starter', 'pro']) {
		for (const modelId of Object.values(MODEL_IDS)) {
			if (canUseModel(tier, modelId)) continue;
			const access = authorizeModel(tier, modelId);
			assert.equal(access.ok, false);
			assert.equal(access.status, 403);
			assert.ok(access.error.length > 0);
		}
	}
});

test('persisted exact-ID subscription balances override defaults without reviving aliases', () => {
	const caps = mergeModelCaps(
		{ [MODEL_IDS.FREE]: 100, [MODEL_IDS.STARTER_DEEPSEEK]: 200 },
		{ [MODEL_IDS.FREE]: 900, [MODEL_IDS.STARTER_DEEPSEEK]: 50, 'deepseek-v4-flash': 900, [MODEL_IDS.STARTER_MIMO]: 0 },
		[MODEL_IDS.STARTER_DEEPSEEK, MODEL_IDS.STARTER_MIMO]
	);

	assert.deepEqual(caps, {
		[MODEL_IDS.STARTER_DEEPSEEK]: 50,
		[MODEL_IDS.STARTER_MIMO]: 0
	});
});

test('Starter and Pro allocations match production values exactly', () => {
	assert.deepEqual(MODEL_BALANCES_BY_TIER.starter, {
		[MODEL_IDS.STARTER_DEEPSEEK]: 4_000_000,
		[MODEL_IDS.STARTER_MIMO]: 3_000_000
	});
	assert.deepEqual(MODEL_BALANCES_BY_TIER.pro, {
		[MODEL_IDS.PRO_DEEPSEEK]: 3_000_000,
		[MODEL_IDS.PRO_MIMO]: 5_000_000
	});
	assert.deepEqual(MODEL_BALANCE_TOTALS_BY_TIER, { starter: 7_000_000, pro: 8_000_000 });
});