# Albion Cline Proxy Configuration

To wire the embedded Cline extension to the Albion Backend Proxy, add the following JSON to your VSCodium `settings.json` (File > Preferences > Settings > search "settings.json" or press `Ctrl+,` and click the `{}` icon in the top right).

```json
{
  "cline.apiProvider": "openai",
  "cline.openAiBaseUrl": "http://localhost:3000/v1",
  "cline.openAiApiKey": "YOUR_SUPABASE_JWT_TOKEN_HERE",
  "cline.openAiModelId": "deepseek-ai/DeepSeek-V4-Flash",
  "albion.proxyUrl": "http://localhost:3000",
  "albion.apiKey": "YOUR_SUPABASE_JWT_TOKEN_HERE"
}
```

## How This Works

1. `cline.apiProvider: "openai"` tells Cline to use the OpenAI-compatible API format.
2. `cline.openAiBaseUrl` is the OpenAI API base URL. Cline appends `/chat/completions`, reaching the existing `/v1/chat/completions` route.
3. `cline.openAiApiKey` injects the Supabase JWT, which our proxy's `authenticate()` middleware will validate.
4. `cline.openAiModelId` selects the exact model ID. The backend authorizes it against the authenticated subscription and does not rename it.
5. The `albion.*` settings are declared in our extension's `package.json` for future UI integration.

## Request Contract

```
Cline Extension
  │
  │  POST http://localhost:3000/v1/chat/completions
  │  Headers: Authorization: Bearer <Supabase JWT>
  │  Body: { model, messages, stream?, tools?, tool_choice?, ... }
  │
  ▼
Albion Proxy (server.js, port 3000)
  │
  ├─ 1. authenticate() → Validates JWT via Supabase
  ├─ 2. Resolves tier from the authenticated user's active subscription
  ├─ 3. Enforces the tier/model matrix and per-model caps
  ├─ 4. Preserves OpenAI streaming and tool-call fields
  │
  │  POST https://api.deepinfra.com/v1/openai/chat/completions
  │  Headers: Authorization: Bearer <backend-only DEEPINFRA_API_KEY>
  │  Body: { model: <same exact model ID>, messages: [...], stream?, tools?, ... }
  │
  ▼
DeepInfra
  └─ Receives the exact case-sensitive model ID; its API key is never sent to the IDE
```

The IDE must send the exact case-sensitive model ID in `model`. The backend rejects locked models with HTTP 403 even if the IDE UI allows selection. The Supabase access token is the bearer credential; never put the DeepInfra key in IDE settings.

Supabase access JWTs expire. A production editor integration must read the current access token from the Supabase session, refresh the session when needed, and send the current token on every request. A JWT pasted once into a static `cline.openAiApiKey` setting will eventually receive HTTP 401 and must be replaced manually; the backend cannot refresh a user's session on the IDE's behalf. The custom `albion.*` settings do not authenticate requests unless the Albion extension uses them to add the `Authorization` header.

The editor can bundle the five IDs from the catalog or load authenticated `GET /api/pricing` for current IDs. There is no OpenAI `GET /v1/models` route in this backend, so do not depend on OpenAI model-list discovery.

The legacy `POST /chat` route remains available for clients that send `{ messages, model_preference }`. Do not configure the OpenAI SDK base URL to `/chat`; the OpenAI-compatible path is `/v1/chat/completions` (or `/chat/completions` without the `/v1` prefix).

For the Albion-specific agent integration, `POST /api/generate` accepts `{ requestedModel, messages, stream? }` (or `model` as an alias) and uses the same auth, tier, cap, and upstream handler.

Checkout remains `POST /api/create-nowpayment-invoice` with `{ planTier, userId, email }` plus `Authorization: Bearer <Supabase access token>` when available. It returns `{ invoice_url, order_id }`; the configured backend currently accepts USDT TRC20 only.

## Testing the Connection

### Prerequisites
1. Ensure the proxy is running: `node server.js` (in `albion-proxy/`), or use the deployed Railway base URL.
2. Configure `DEEPINFRA_API_KEY` only in the backend environment.

### Steps
1. Open the extracted `VSCodium.exe` portable build.
2. Open Settings (`Ctrl+,`) → click the `{}` icon (top right) to open `settings.json`.
3. Paste the JSON snippet above (replace `YOUR_SUPABASE_JWT_TOKEN_HERE` with a valid test token).
4. Save and reload the window (`Ctrl+Shift+P` → "Reload Window").
5. Open the Cline panel (right sidebar, Cline icon).
6. Type: "Hello, are you connected to the Albion proxy?"
7. Check the `albion-proxy` terminal. You should see:
  - Authentication and subscription lookup succeed.
  - `X-Albion-Active-Model` matches the selected exact model ID.
  - The response was routed to DeepInfra.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Cline shows "Invalid API key" | JWT expired or malformed | Get a fresh JWT from Supabase auth |
| 401 from proxy | `cline.openAiApiKey` not set | Add your JWT to `settings.json` |
| 502 from proxy | DeepInfra returned an error | Check backend provider status and funding without exposing secrets |
| "Connection refused" | Proxy not running | Start proxy: `node server.js` |
| 403 model access denied | The selected model is outside the account's active tier | Check the account's active `subscriptions` row and the exact model ID |
