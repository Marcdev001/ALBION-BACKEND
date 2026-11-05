'use strict';

const MODEL_IDS = Object.freeze({
	FREE: 'deepseek-ai/DeepSeek-V4-Flash',
	STARTER_DEEPSEEK: 'deepseek-ai/DeepSeek-V4.1-Flash-1017',
	STARTER_MIMO: 'XiaomiMiMo/MiMo-V2.6-Flash',
	PRO_DEEPSEEK: 'deepseek-ai/DeepSeek-V4-Pro-0813',
	PRO_MIMO: 'XiaomiMiMo/MiMo-V2.6-Pro'
});

const MODELS_BY_TIER = Object.freeze({
	free: Object.freeze([MODEL_IDS.FREE]),
	// Existing Learner subscriptions retain their previous single-model access.
	learner: Object.freeze([MODEL_IDS.FREE, MODEL_IDS.STARTER_DEEPSEEK]),
	starter: Object.freeze([MODEL_IDS.STARTER_DEEPSEEK, MODEL_IDS.STARTER_MIMO]),
	pro: Object.freeze([MODEL_IDS.PRO_DEEPSEEK, MODEL_IDS.PRO_MIMO])
});

const MODEL_BALANCES_BY_TIER = Object.freeze({
	starter: Object.freeze({
		[MODEL_IDS.STARTER_DEEPSEEK]: 4_000_000,
		[MODEL_IDS.STARTER_MIMO]: 3_000_000
	}),
	pro: Object.freeze({
		[MODEL_IDS.PRO_DEEPSEEK]: 3_000_000,
		[MODEL_IDS.PRO_MIMO]: 5_000_000
	})
});

const MODEL_BALANCE_TOTALS_BY_TIER = Object.freeze(Object.fromEntries(
	Object.entries(MODEL_BALANCES_BY_TIER).map(([tier, balances]) => [
		tier,
		Object.values(balances).reduce((total, balance) => total + balance, 0)
	])
));

function isKnownModel(modelId) {
	return Object.values(MODEL_IDS).includes(modelId);
}

function getDeepInfraModelId(modelId) {
	return isKnownModel(modelId) ? modelId : null;
}

function canUseModel(tier, modelId) {
	return Boolean(MODELS_BY_TIER[tier]?.includes(modelId));
}

function authorizeModel(tier, modelId) {
	const error = getModelAccessError(tier, modelId);
	return error ? { ok: false, status: 403, error } : { ok: true };
}

function mergeModelCaps(defaultCaps, subscriptionBalances, allowedModels = Object.keys(defaultCaps)) {
	const allowed = new Set(allowedModels);
	const caps = Object.fromEntries(Object.entries(defaultCaps).filter(([modelId]) => allowed.has(modelId)));
	for (const [modelId, value] of Object.entries(subscriptionBalances || {})) {
		const cap = Number(value);
		if (allowed.has(modelId) && isKnownModel(modelId) && Number.isFinite(cap) && (cap >= 0 || cap === -1)) {
			caps[modelId] = cap;
		}
	}
	return caps;
}

function getModelAccessError(tier, modelId) {
	if (canUseModel(tier, modelId)) return null;
	if (!isKnownModel(modelId)) {
		return `Model '${modelId}' is not supported. Use an exact model ID from the current catalog.`;
	}
	if (tier === 'free') {
		return 'This model requires a Starter or Pro plan.';
	}
	if (tier === 'learner' && (modelId === MODEL_IDS.STARTER_MIMO || modelId === MODEL_IDS.PRO_DEEPSEEK || modelId === MODEL_IDS.PRO_MIMO)) {
		return 'This model requires a Starter or Pro plan.';
	}
	if (tier === 'starter' && (modelId === MODEL_IDS.PRO_DEEPSEEK || modelId === MODEL_IDS.PRO_MIMO)) {
		return 'This model requires a Pro plan.';
	}
	return 'This model is not included in your current plan.';
}

module.exports = { MODEL_IDS, MODELS_BY_TIER, MODEL_BALANCES_BY_TIER, MODEL_BALANCE_TOTALS_BY_TIER, isKnownModel, getDeepInfraModelId, canUseModel, authorizeModel, mergeModelCaps, getModelAccessError };