'use strict';

const crypto = require('crypto');

const DEFAULT_SUPPORTED_PAY_CURRENCIES = Object.freeze(['usdttrc20']);

function normalizePayCurrency(currency) {
	return typeof currency === 'string' ? currency.trim().toLowerCase() : '';
}

function isSupportedPayCurrency(currency, supportedCurrencies = DEFAULT_SUPPORTED_PAY_CURRENCIES) {
	const normalized = normalizePayCurrency(currency);
	return Boolean(normalized && supportedCurrencies.map(normalizePayCurrency).includes(normalized));
}

function sortKeysRecursively(value) {
	if (Array.isArray(value)) return value.map(sortKeysRecursively);
	if (!value || typeof value !== 'object') return value;
	return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeysRecursively(value[key])]));
}

function verifyNowPaymentsSignature(payload, receivedSignature, secret) {
	if (typeof receivedSignature !== 'string' || !/^[a-f0-9]{128}$/i.test(receivedSignature) || !secret) return false;
	const canonicalPayload = JSON.stringify(sortKeysRecursively(payload));
	const expected = crypto.createHmac('sha512', secret).update(canonicalPayload).digest();
	const received = Buffer.from(receivedSignature, 'hex');
	return received.length === expected.length && crypto.timingSafeEqual(expected, received);
}

function matchesRegisteredInvoice(invoice, payload) {
	if (!invoice || !payload || String(payload.payment_status || '').toLowerCase() !== 'finished') return false;
	const expectedAmountCents = Math.round(Number(invoice.expected_amount) * 100);
	const paidAmountCents = Math.round(Number(payload.price_amount) * 100);
	return Number.isFinite(expectedAmountCents)
		&& Number.isFinite(paidAmountCents)
		&& expectedAmountCents === paidAmountCents
		&& String(payload.price_currency || '').toLowerCase() === String(invoice.price_currency || '').toLowerCase()
		&& String(payload.pay_currency || '').toLowerCase() === String(invoice.pay_currency || '').toLowerCase();
}

module.exports = {
	DEFAULT_SUPPORTED_PAY_CURRENCIES,
	normalizePayCurrency,
	isSupportedPayCurrency,
	sortKeysRecursively,
	verifyNowPaymentsSignature,
	matchesRegisteredInvoice
};