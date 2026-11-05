const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const {
  DEFAULT_SUPPORTED_PAY_CURRENCIES,
  normalizePayCurrency,
  isSupportedPayCurrency,
  sortKeysRecursively,
  verifyNowPaymentsSignature,
  matchesRegisteredInvoice
} = require('../lib/nowpayments');

test('NOWPayments signatures cover recursively sorted JSON and reject malformed signatures', () => {
  const secret = 'test_ipn_secret_12345';
  const payload = {
    z: 1,
    nested: { z: 'last', a: 'first' },
    a: [{ z: true, a: false }]
  };
  const canonical = JSON.stringify(sortKeysRecursively(payload));
  const signature = crypto.createHmac('sha512', secret).update(canonical).digest('hex');

  assert.equal(verifyNowPaymentsSignature(payload, signature, secret), true);
  assert.equal(verifyNowPaymentsSignature(payload, signature, 'wrong secret'), false);
  assert.equal(verifyNowPaymentsSignature(payload, 'not-a-signature', secret), false);
  assert.equal(verifyNowPaymentsSignature(payload, signature.slice(0, -2), secret), false);
});

test('NOWPayments signature canonicalization is independent of object key order', () => {
  assert.equal(
    JSON.stringify(sortKeysRecursively({ b: { d: 1, c: 2 }, a: 3 })),
    JSON.stringify(sortKeysRecursively({ a: 3, b: { c: 2, d: 1 } }))
  );
});

test('NOWPayments activation requires a finished payment matching invoice amount and both currencies', () => {
  const invoice = { expected_amount: 8, price_currency: 'usd', pay_currency: 'usdttrc20' };
  const payment = { payment_status: 'finished', price_amount: '8.00', price_currency: 'USD', pay_currency: 'USDTTRC20' };

  assert.equal(matchesRegisteredInvoice(invoice, payment), true);
  assert.equal(matchesRegisteredInvoice(invoice, { ...payment, payment_status: 'confirmed' }), false);
  assert.equal(matchesRegisteredInvoice(invoice, { ...payment, price_amount: 7 }), false);
  assert.equal(matchesRegisteredInvoice(invoice, { ...payment, price_currency: 'eur' }), false);
  assert.equal(matchesRegisteredInvoice(invoice, { ...payment, pay_currency: 'usdtbsc' }), false);
});

test('NOWPayments invoice currency allowlist only permits USDT on TRON', () => {
  assert.deepEqual(DEFAULT_SUPPORTED_PAY_CURRENCIES, ['usdttrc20']);
  assert.equal(normalizePayCurrency(' USDTTRC20 '), 'usdttrc20');
  assert.equal(isSupportedPayCurrency('usdttrc20'), true);
  assert.equal(isSupportedPayCurrency('usdcerc20'), false);
  assert.equal(isSupportedPayCurrency('usdtbsc'), false);
  assert.equal(isSupportedPayCurrency('unknowncoin'), false);
  assert.equal(isSupportedPayCurrency('usdcerc20', ['usdttrc20']), false);
});
