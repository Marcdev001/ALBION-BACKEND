'use strict';

const BASE_URL = (process.env.ALBION_STAGING_URL || '').replace(/\/$/, '');
const accounts = {
	free: process.env.ALBION_STAGING_FREE_TOKEN,
	starter: process.env.ALBION_STAGING_STARTER_TOKEN,
	pro: process.env.ALBION_STAGING_PRO_TOKEN
};

const MODELS = {
	free: 'deepseek-ai/DeepSeek-V4-Flash',
	starter: 'deepseek-ai/DeepSeek-V4.1-Flash-1017',
	starterProhibited: 'deepseek-ai/DeepSeek-V4-Pro-0813',
	pro: 'XiaomiMiMo/MiMo-V2.6-Pro'
};

if (!BASE_URL || Object.values(accounts).some((token) => !token)) {
	console.error('Set ALBION_STAGING_URL and tier-specific ALBION_STAGING_*_TOKEN variables.');
	process.exit(2);
}

async function postModel(tier, model, expectedStatus, { path = '/v1/chat/completions', shape = 'openai', stream = false } = {}) {
	const body = {
		messages: [{ role: 'user', content: 'Reply with OK.' }],
		estimated_tokens: 32,
		...(shape === 'legacy' ? { model_preference: model } : {}),
		...(shape === 'agent' ? { requestedModel: model } : {}),
		...(shape === 'openai' ? { model } : {}),
		...(stream ? { stream: true } : {})
	};
	const response = await fetch(`${BASE_URL}${path}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${accounts[tier]}`
		},
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(90000)
	});

	if (response.status !== expectedStatus) {
		throw new Error(`${tier} request for ${model}: expected HTTP ${expectedStatus}, received ${response.status}`);
	}

	if (expectedStatus === 200) {
		if (response.headers.get('x-albion-active-model') !== model) {
			throw new Error(`${tier} response did not confirm the requested model.`);
		}
		if (stream && !response.headers.get('content-type')?.includes('text/event-stream')) {
			throw new Error(`${tier} streaming request did not return an SSE response.`);
		}
		await response.arrayBuffer();
		console.log(`${tier} ${stream ? 'streaming' : shape} smoke check passed.`);
		return;
	}

	const responseBody = await response.json();
	if (responseBody.code !== 'model_access_denied') {
		throw new Error(`${tier} locked-model response was not a model-access denial.`);
	}
	console.log(`${tier} locked-model smoke check passed.`);
}

async function main() {
	await postModel('free', MODELS.free, 200, { path: '/chat', shape: 'legacy' });
	await postModel('starter', MODELS.starter, 200, { path: '/api/generate', shape: 'agent' });
	await postModel('pro', MODELS.pro, 200, { stream: true });
	await postModel('free', MODELS.starter, 403);
	await postModel('free', MODELS.pro, 403);
	await postModel('starter', MODELS.starterProhibited, 403);
	console.log('Staging model access smoke checks passed. Requests consume provider tokens.');
}

main().catch((err) => {
	console.error(`Staging smoke checks failed: ${err.message}`);
	process.exitCode = 1;
});