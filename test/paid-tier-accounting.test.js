'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPaidTierAccounting } = require('../lib/paidTierAccounting');

function fakeSupabase(overrides = {}) {
	const calls = [];
	return {
		calls,
		async rpc(name, args) {
			calls.push({ name, args });
			if (overrides.error) return { data: null, error: { message: overrides.error } };
			if (name === 'albion_reserve_paid_tier_tokens') {
				return { data: { allowed: true, status: 'reserved', reserved: args.p_estimate, remaining: 100 }, error: null };
			}
			if (name === 'albion_settle_paid_tier_tokens') return { data: { status: 'settled' }, error: null };
			if (name === 'albion_release_paid_tier_tokens') return { data: { status: 'released' }, error: null };
			return { data: { status: 'uncertain' }, error: null };
		}
	};
}

test('reserve sends identity, active cycle, model, and both caps to the atomic RPC', async () => {
	const supabase = fakeSupabase();
	const accounting = createPaidTierAccounting(supabase);
	const result = await accounting.reserve({
		requestId: '5db3a3b2-c3e8-422a-9ea1-a7a5a17f0f3f',
		userId: 'user-1',
		tier: 'starter',
		cycleStart: '2026-11-01T00:00:00.000Z',
		modelId: 'deepseek-ai/DeepSeek-V4.1-Flash-1017',
		estimatedTokens: 1234,
		modelCap: 4_000_000,
		totalCap: 7_000_000
	});

	assert.equal(result.allowed, true);
	assert.equal(result.reserved, 1234);
	assert.equal(supabase.calls[0].name, 'albion_reserve_paid_tier_tokens');
	assert.equal(supabase.calls[0].args.p_model_cap, 4_000_000);
	assert.equal(supabase.calls[0].args.p_total_cap, 7_000_000);
});

test('settle, release, and uncertainty use separate idempotent RPC operations', async () => {
	const supabase = fakeSupabase();
	const accounting = createPaidTierAccounting(supabase);
	const requestId = '5db3a3b2-c3e8-422a-9ea1-a7a5a17f0f3f';

	await accounting.settle(requestId, { promptTokens: 50, completionTokens: 20, actualCost: 0.01, sessionId: 's1' });
	await accounting.release(requestId);
	await accounting.markUncertain(requestId);

	assert.deepEqual(supabase.calls.map((call) => call.name), [
		'albion_settle_paid_tier_tokens',
		'albion_release_paid_tier_tokens',
		'albion_mark_paid_tier_tokens_uncertain'
	]);
	assert.equal(supabase.calls[0].args.p_prompt_tokens, 50);
	assert.equal(supabase.calls[0].args.p_session_id, 's1');
});

test('accounting errors are surfaced to the caller', async () => {
	const accounting = createPaidTierAccounting(fakeSupabase({ error: 'database unavailable' }));
	await assert.rejects(() => accounting.release('5db3a3b2-c3e8-422a-9ea1-a7a5a17f0f3f'), /database unavailable/);
});