'use strict';

const MAX_COMPLETION_TOKENS = 4096;

function getMaxCompletionTokens(body = {}) {
	const requested = Number(body.max_completion_tokens ?? body.max_tokens);
	if (!Number.isFinite(requested) || requested <= 0) return MAX_COMPLETION_TOKENS;
	return Math.min(Math.floor(requested), MAX_COMPLETION_TOKENS);
}

function evaluateTierQuota({ usedTokens, estimatedTokens = 0, cap } = {}) {
	const totalCap = Math.max(0, Math.floor(Number(cap) || 0));
	const used = Math.max(0, Math.floor(Number(usedTokens) || 0));
	const estimate = Math.max(0, Math.floor(Number(estimatedTokens) || 0));
	const remaining = Math.max(0, totalCap - used);
	const allowed = totalCap > 0 && used + estimate <= totalCap;
	return { allowed, used, estimated: estimate, cap: totalCap, remaining };
}

module.exports = { evaluateTierQuota, getMaxCompletionTokens, MAX_COMPLETION_TOKENS };