'use strict';

function mapProviderStatus(status) {
	if (status === 429) return { status: 429, message: 'AI provider rate limit reached. Please retry shortly.' };
	if (status === 408 || status === 504) return { status: 504, message: 'AI provider timed out. Please retry shortly.' };
	if (status === 402) return { status: 503, message: 'AI provider is temporarily unavailable. Please try again shortly.' };
	return { status: 502, message: 'AI provider returned an error. Please try again shortly.' };
}

module.exports = { mapProviderStatus };