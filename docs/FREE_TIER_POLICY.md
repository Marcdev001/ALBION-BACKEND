# Albion Free Tier Policy

## Allowance

- **200,000 tokens lifetime, per user.**
- The allowance is a one-time grant. It does **not** reset daily, weekly, monthly, or per billing cycle.
- When the allowance is exhausted the account is locked out of AI requests until the user upgrades.

## Provider routing

- The free tier uses **DeepInfra only** with the exact model ID `deepseek-ai/DeepSeek-V4-Flash`.
- The API key is read from the backend's `DEEPINFRA_API_KEY` environment secret.
- There is **no Groq routing**, no key rotation, and no cross-provider fallback.
- Provider failures return safe mapped `429`, `502`, `503`, or `504` responses. Failed calls do not consume lifetime tokens because the pending reservation is released.

## Token accounting

- Usage lives in Supabase `user_token_usage` and is updated through atomic RPCs:
  - `albion_reserve_free_tier_tokens`
  - `albion_commit_free_tier_tokens`
  - `albion_release_free_tier_tokens`
- The proxy reserves an estimated token count **before** calling the provider, commits actual usage afterwards, and releases the reservation on failure. Parallel requests therefore cannot bypass the cap.
- Streaming requests request `stream_options.include_usage = true` and commit the final usage chunk. If the provider omits usage, the proxy falls back to a deterministic character-based estimate.

## Responses

| Condition | Status | Body |
| --- | --- | --- |
| Allowance available | `200` | Normal provider response |
| Lifetime cap reached (pre-flight or reservation) | `402` | `Free tier lifetime limit reached (200k tokens). Please upgrade to continue.` |
| Provider unavailable / accounting unavailable | `503` | Safe generic provider or accounting error |
| Provider rate-limited | `429` | Retryable provider rate-limit message |
| Provider timed out | `504` | Retryable timeout message |

`402` responses use `code: "free_tier_lifetime_limit_reached"` so clients can show the upgrade lockout without parsing prose.

Provider pricing and funding status must be verified against the DeepInfra account before publishing cost claims or enabling production traffic.
