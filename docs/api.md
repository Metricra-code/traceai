# Ingestion API — implemented slice

`apps/api` is a Hono Worker with a D1 binding. This slice implements health and real ingestion; management authentication, analytics endpoints and the dashboard are not yet implemented. The public demo data and its simulated prices are separate from real ingestion.

## Endpoints

- `GET /health`: executes `SELECT 1` against D1, then returns the service status. A failed database operation returns a generic error, not a false healthy response.
- `POST /v1/events/batch`: `Authorization: Bearer tai_<32-hex-key-id>_<64-hex-secret>` and `Content-Type: application/json`.

```json
{
  "events": [
    {
      "traceId": "stable-id-generated-once",
      "name": "chat.completion",
      "provider": "your-provider",
      "model": "exact-model-id",
      "status": "success",
      "startedAt": "2026-10-09T00:00:00.000Z",
      "endedAt": "2026-10-09T00:00:00.123Z",
      "durationMs": 123,
      "inputTokens": 100,
      "outputTokens": 20,
      "metadata": { "environment": "local" }
    }
  ]
}
```

Successful requests return HTTP `202` and `{ "accepted": 1, "duplicates": 0 }`. `accepted` counts new persisted rows; `duplicates` includes retries and repeated IDs within the batch. The **first** event for `(project_id, trace_id)` wins; later duplicates cannot replace its model, usage, pricing or metadata. A replay returns `accepted: 0`, `duplicates: 1`.

The shared strict Zod schema validates the entire batch before any trace is written. A batch contains **1–50** events. Bodies are streamed into a bounded buffer, capped at **256 KiB**, even without `Content-Length`. Compressed bodies are rejected rather than bypassing the decompressed size limit. Metadata is capped at **8 KiB/event**. Arbitrary raw error messages and prompts are not accepted; applications should keep sensitive data out of metadata.

Project scope derives only from the validated key's database record. Client-supplied project IDs are rejected. Revoked keys and malformed credentials receive the same generic `401`. Keys contain a cryptographically random 256-bit secret, a separate random ID and salt; only a domain-separated salted SHA-256 hash is persisted. Hash comparisons use `node:crypto`'s constant-time primitive. This fast hash is safe for random high-entropy keys, **not passwords**.

## Cost semantics

Pricing uses an exact `(provider, model)` match effective at `startedAt`, with version identity saved on the trace. Only real, non-simulated USD pricing versions are eligible. Both usage values must be explicitly present, including zero. Unknown models, missing usage, invalid pricing or unsafe-integer estimates produce `null`, never zero. Monetary calculation uses `BigInt`, rounds half-up once to integer nanodollars, and persists only integers within `Number.MAX_SAFE_INTEGER`. Analytics will serialize these values as decimal strings.

No real model prices are fabricated by this slice. The bootstrap does not create pricing records. The simulated demo price registry is explicitly excluded from real ingestion.

## Atomicity and free-tier query bounds

D1 `batch()` inserts in one transaction; any statement failure rolls back every trace and the last-used timestamp. Trace inserts contain five rows per statement, keeping even fully populated events below D1's 100 bind-parameter ceiling. A 50-event request uses ten insert statements, one timestamp update, one pricing query, one authentication query and one rate-limit update: **14 queries**, below the Workers Free per-invocation limit of 50. Pricing lookup uses one parameterized JSON input rather than a query per event.

An atomic D1 upsert limits authenticated keys to **120 requests per UTC minute**. Counters use one stable row per key, with an expiry that resets the counter; no per-minute rows accumulate. Invalid authenticated requests count toward the limit. `429` includes `Retry-After` in seconds. A fixed-minute window allows a boundary burst and is not a distributed token bucket. Rate-limiter/database writes consume D1 quota; deployment still needs capacity monitoring.

## Local-only bootstrap

From the repository root:

```bash
bun run db:migrate
bun run examples/local-project/create.ts --local-only
bun run --filter @traceai/api db:bootstrap
```

The bootstrap creates a **real local project** with a disabled, local-only owner identity, not a public demo key or a usable password. It writes `.local/bootstrap.sql` containing only the salted key hash and `.local/ingestion.env` containing the one-time raw key. The ignored files use `0600` permissions; the directory uses `0700`. The secret is never printed. Exclusive file creation prevents silently overwriting existing secrets. Do not copy either bootstrap file to a public artifact or production database.

To use the key privately in your current terminal:

```bash
set -a
source .local/ingestion.env
set +a
bun run --filter @traceai/api dev
```

Use a separate terminal for the SDK example. The `--local-only` bootstrap does not enable production signup, account management, session authentication or API-key lifecycle management. Never run its SQL without `--local`.

## Error contract

Errors have `{ "error": { "code": "...", "message": "..." } }`. Statuses: `400` invalid JSON/schema, `401` invalid key, `413` oversized body, `415` unsupported content type/encoding, `429` rate limit, `500` generic internal failure. All responses use `Cache-Control: no-store`, `X-Content-Type-Options: nosniff` and a generated `X-Request-Id`. Internal logs record only a category and correlation ID, never raw exceptions, SQL values, bodies or authorization headers.

## Verification

`bun run test` covers portable cryptography and integer pricing. `bun run test:integration` runs inside actual workerd using `@cloudflare/vitest-plugin`, with real local D1 migrations reapplied for every test and no remote bindings. It covers authentication/revocation, project isolation, idempotency, full-batch validation, streaming limits, effective real-only pricing, 50-event inserts, transaction rollback and rate-limit atomicity. Passing local tests does not prove deployed Workers Free CPU suitability; live deployment checks remain required.
