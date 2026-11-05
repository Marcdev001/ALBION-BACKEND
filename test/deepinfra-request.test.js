'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MODEL_IDS } = require('../lib/modelCatalog');
const { buildDeepInfraRequestBody } = require('../lib/deepinfraRequest');

test('all catalog IDs are forwarded exactly for ordinary chat requests', () => {
	for (const modelId of Object.values(MODEL_IDS)) {
		assert.equal(buildDeepInfraRequestBody({ modelId, messages: [{ role: 'user', content: 'hello' }] }).model, modelId);
	}
});

test('streaming tool/agent requests preserve the model and OpenAI request fields', () => {
	const modelId = MODEL_IDS.PRO_MIMO;
	const tools = [{ type: 'function', function: { name: 'apply_edit', parameters: { type: 'object' } } }];
	const request = buildDeepInfraRequestBody({
		modelId,
		messages: [{ role: 'user', content: 'edit this file' }],
		stream: true,
		body: { tools, tool_choice: 'auto', max_completion_tokens: 1200 }
	});

	assert.equal(request.model, modelId);
	assert.equal(request.stream, true);
	assert.deepEqual(request.stream_options, { include_usage: true });
	assert.deepEqual(request.tools, tools);
	assert.equal(request.tool_choice, 'auto');
	assert.equal(request.max_completion_tokens, 1200);
});

test('legacy aliases are never remapped to a DeepInfra model', () => {
	assert.throws(
		() => buildDeepInfraRequestBody({ modelId: 'deepseek-v4-flash', messages: [{ role: 'user', content: 'hi' }] }),
		/Unsupported DeepInfra model ID/
	);
});