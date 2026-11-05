# Staging Model Smoke Test

Run against a staging deployment configured with the production-equivalent Supabase schema, DeepInfra key, provider endpoint, and rate-limit settings. The script prints only pass/fail summaries and does not print bearer tokens or model responses.

The requests are real and consume provider tokens. Use dedicated staging accounts with enough quota in each tier.

```sh
ALBION_STAGING_URL=https://staging.example.com \
ALBION_STAGING_FREE_TOKEN=... \
ALBION_STAGING_STARTER_TOKEN=... \
ALBION_STAGING_PRO_TOKEN=... \
npm run test:staging
```

The smoke test checks the legacy `/chat` request shape for Free, the `/api/generate` agent shape for Starter, and OpenAI-compatible streaming for Pro. It also checks 403 denials for Free-to-Starter, Free-to-Pro, and Starter-to-Pro requests. It does not configure production secrets or prove the production DeepInfra wallet is funded; confirm those in the provider and deployment dashboards without copying secret values into logs or tickets.