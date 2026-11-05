'use strict';

function firstRow(data) {
	return Array.isArray(data) ? data[0] : data;
}

function createPaidTierAccounting(supabase) {
	async function callRpc(name, args) {
		const { data, error } = await supabase.rpc(name, args);
		if (error) throw new Error(`[PAID-TIER] ${name} failed: ${error.message}`);
		return firstRow(data) || {};
	}

	async function reserve({ requestId, userId, tier, cycleStart, modelId, estimatedTokens, modelCap, totalCap }) {
		const result = await callRpc('albion_reserve_paid_tier_tokens', {
			p_request_id: requestId,
			p_user_id: userId,
			p_tier: tier,
			p_cycle_start: cycleStart,
			p_model_id: modelId,
			p_estimate: Math.max(0, Math.floor(Number(estimatedTokens) || 0)),
			p_model_cap: Math.max(0, Math.floor(Number(modelCap) || 0)),
			p_total_cap: Math.max(0, Math.floor(Number(totalCap) || 0))
		});
		return {
			allowed: result.allowed === true,
			requestId,
			status: result.status || null,
			reserved: Math.max(0, Number(result.reserved) || 0),
			used: Math.max(0, Number(result.used) || 0),
			remaining: Math.max(0, Number(result.remaining) || 0)
		};
	}

	async function settle(requestId, { promptTokens, completionTokens, actualCost = 0, sessionId = null } = {}) {
		return callRpc('albion_settle_paid_tier_tokens', {
			p_request_id: requestId,
			p_prompt_tokens: Math.max(0, Math.floor(Number(promptTokens) || 0)),
			p_completion_tokens: Math.max(0, Math.floor(Number(completionTokens) || 0)),
			p_actual_cost: Math.max(0, Number(actualCost) || 0),
			p_session_id: sessionId || null
		});
	}

	async function release(requestId) {
		return callRpc('albion_release_paid_tier_tokens', { p_request_id: requestId });
	}

	async function markUncertain(requestId) {
		return callRpc('albion_mark_paid_tier_tokens_uncertain', { p_request_id: requestId });
	}

	return { reserve, settle, release, markUncertain };
}

module.exports = { createPaidTierAccounting, firstRow };