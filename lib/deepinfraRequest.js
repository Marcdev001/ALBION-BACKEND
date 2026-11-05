'use strict';

const { getDeepInfraModelId } = require('./modelCatalog');

function buildDeepInfraRequestBody({ modelId, messages, stream = false, body = {}, temperature } = {}) {
	const model = getDeepInfraModelId(modelId);
	if (!model) throw new Error('Unsupported DeepInfra model ID');
	if (!Array.isArray(messages) || messages.length === 0) throw new Error('messages array is required');

	return {
		model,
		messages,
		...(stream ? { stream: true, stream_options: body.stream_options || { include_usage: true } } : {}),
		...(body.tools ? { tools: body.tools } : {}),
		...(body.tool_choice ? { tool_choice: body.tool_choice } : {}),
		...(body.temperature != null ? { temperature: body.temperature } : temperature != null ? { temperature } : {}),
		...(body.max_tokens != null ? { max_tokens: body.max_tokens } : {}),
		...(body.max_completion_tokens != null ? { max_completion_tokens: body.max_completion_tokens } : {}),
		...(body.reasoning_effort != null ? { reasoning_effort: body.reasoning_effort } : {})
	};
}

module.exports = { buildDeepInfraRequestBody };