# HTTP API

Hono on Cloudflare Workers, with D1 persistence. Browser management calls go through Next's same-origin
`/api/*` proxy to `/v1/*`; production uses a service binding. Raw ingestion keys are server-side credentials,
not dashboard session credentials. All inputs are validated and queries are parameterized.

Production API: **https://traceai-api.traceai-api.workers.dev**.
[Live health check](https://traceai-api.traceai-api.workers.dev/health) and
[read-only demo metadata](https://traceai-api.traceai-api.workers.dev/v1/demo) require no account.

## Authentication and management

| Method/path                                    | Response / requirement                                         |
| ---------------------------------------------- | -------------------------------------------------------------- |
| `GET /health`                                  | Real `SELECT 1` D1 connection check                            |
| `POST /v1/auth/register`                       | `{ user }`, 201; validated email/password, Origin required     |
| `POST /v1/auth/login`                          | `{ user }`; new session, Origin required                       |
| `GET /v1/auth/session`                         | `{ user }`; valid session required                             |
| `POST /v1/auth/logout`                         | 204; Origin required, session invalidated                      |
| `GET /v1/projects`                             | `{ items: Project[] }`; only owned projects                    |
| `POST /v1/projects`                            | `Project`, 201; name/description schema                        |
| `GET /v1/projects/:id`                         | `Project`; ownership required                                  |
| `PATCH /v1/projects/:id`                       | `Project`; nonempty validated partial name/description         |
| `DELETE /v1/projects/:id`                      | 204; `{ confirmName: "current name" }` required                |
| `GET /v1/projects/:id/api-keys`                | `{ items: ApiKey[], historyLimit: 100 }`; newest metadata only |
| `POST /v1/projects/:id/api-keys`               | `{ apiKey, key }`, 201; raw key shown once                     |
| `DELETE /v1/projects/:id/api-keys/:keyId`      | 204; immediately revokes ingestion access                      |
| `POST /v1/projects/:id/api-keys/:keyId/rotate` | `{ apiKey, key }`, 201; old key revoked atomically             |

All project/key reads and mutations check ownership. A missing or foreign resource has the same 404;
no session returns 401. Cookie mutations require exact `Origin === WEB_ORIGIN`. Sessions expire after
seven days, use hashed-at-rest random tokens, and set HttpOnly/SameSite cookies (Secure in production).
Keys use an independent random 256-bit secret and salt; lists never return the raw value or hash.
Management is bounded to 100 owned projects and 20 active keys/project; exceeding these caps returns
409 `resource_limit`. Key history prioritizes every active key, then the newest revoked records,
up to 100 total, with `historyLimit` in the response.
Revoked older records remain in storage and can never authenticate ingestion.

Passwords are hashed/verified using native scrypt in a **private SQLite-backed Durable Object**, not
low-round edge PBKDF2. Fixed `N=32768,r=8,p=3` matches [OWASP's 32 MiB scrypt profile](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt).
The DO uses the larger default CPU allowance; only salted digests are stored in D1. Rate limiting runs
before expensive hashing. IP counters allow 20 attempts/minute; email counters allow 10/15 minutes.
See [architecture](architecture.md) and [deployment](deployment.md) for runtime limits and security scope.

## Ingestion

`POST /v1/events/batch` requires `Authorization: Bearer tai_<32-hex-id>_<64-hex-secret>` and JSON:

```json
{
  "events": [
    {
      "traceId": "stable-generated-once",
      "name": "chat-completion",
      "provider": "your-provider",
      "model": "your-model-id",
      "status": "success",
      "startedAt": "2026-10-09T00:00:00.000Z",
      "endedAt": "2026-10-09T00:00:00.123Z",
      "durationMs": 123,
      "inputTokens": 100,
      "outputTokens": 20,
      "metadata": { "feature": "assistant" }
    }
  ]
}
```

Success is HTTP 202, `{ "accepted": 1, "duplicates": 0 }`. Entire batches validate atomically:
1–50 events, 256 KiB streamed UTF-8 body, 8 KiB scalar metadata/event, valid UTC timestamps,
nonnegative bounded duration/token counts and category-only errors. Compressed bodies and extra fields,
including raw error messages or caller-supplied project IDs, are rejected.

Project scope comes only from the authenticated key. First `(project_id,trace_id)` wins, including
repeated IDs in one batch; retries cannot replace original usage/model/pricing/metadata. D1 transactional
inserts roll back all rows if a later statement fails. Five-row chunks respect bind limits; a full batch
uses bounded queries, not an N+1 pricing lookup. A fixed atomic per-key limit allows 120 requests/UTC minute;
429 returns Retry-After. Invalid authenticated requests count toward the limit.

UTC timestamps are normalized to fixed milliseconds before deduplication, pricing and storage,
so indexed time comparisons and effective-price boundaries share the same precision.

Pricing matches exact provider/model and effective versions, never simulated records. Both usage counts
must be present (including explicit zero). Missing/unknown/unsafe pricing is null. Calculation rounds
once to integer nanodollars; historical version identity is retained. No real prices are fabricated.

## Analytics and public demo

Private endpoints require session + project ownership:

```text
GET /v1/projects/:id/overview          → Overview
GET /v1/projects/:id/metrics           → { items: MetricBucket[], bucket: "hour" | "day" }
GET /v1/projects/:id/models            → { items: ModelComparison[] }
GET /v1/projects/:id/traces            → { items: Trace[], nextCursor: string | null }
GET /v1/projects/:id/traces/:traceId    → Trace
```

Public GET `/v1/demo` returns `{ project, anchor, simulated: true }` for fixed project `demo`.
The same `/overview`, `/metrics`, `/models`, `/traces`, `/traces/:traceId` suffixes expose only that
simulated project. There are no public demo mutations, key generation or arbitrary project selection.
Missing seed data returns 404 `demo_not_available`, not fabricated metrics.

### Query contract

| Parameter           | Rule                                                                               |
| ------------------- | ---------------------------------------------------------------------------------- |
| `from`, `to`        | Both UTC ISO strings ending in `Z`, or both omitted; canonicalized to milliseconds |
| Window              | `[from,to)`, strictly increasing, at most 31 days                                  |
| `provider`, `model` | Optional exact labels, max 120 chars                                               |
| `status`            | Optional `success` or `error`                                                      |
| `traceId`           | Optional exact ASCII identifier; not substring search                              |
| `limit`             | Trace list only; integer 1–100, default 50 (UI uses 25)                            |
| `sort`              | Trace list only; `newest` default or `oldest`                                      |
| `cursor`            | Trace list only; versioned URL-safe keyset cursor                                  |

Duplicate/unknown parameters, malformed cursors and invalid ranges return safe 400 errors. Detail and
demo metadata endpoints accept no query parameters. Omitted dates mean 24 hours ending at now for private
projects, or actual demo anchor +1ms. A cursor retains the original default range, avoiding page drift.

All SQL reads are project scoped/indexed. Aggregation selects at most 20,001 narrow candidates;
**more than 20,000 matches returns 422 `analytics_window_too_large`** and asks for a narrower window/filter.
No silent truncation. Trace pagination itself remains available on larger windows within the date bound.

P50/P95/P99 use nearest rank, `ceil(p × n)`. Metrics adapt to hour buckets through seven days and daily
buckets for longer windows, zero filling UTC gaps (at most 744 points). Empty overview percentiles are
zero; the UI shows missing-observation latency gaps rather than implying zero-time operations.
Model comparisons measure operational speed/reliability/usage, **not quality or accuracy**.

Costs are authoritative decimal **nanodollar strings**, not JSON floating-point money. Sums use BigInt,
including totals beyond JS safe integers. If any row is unpriced, the total remains null with
`pricedRequests`/`unpricedRequests`. `knownEstimatedCostNanoUsd` is the exact subtotal of priced
requests only, **not the grand total**; it is null when a nonempty set has no priced requests. The UI
labels the chart as priced-request cost and explicitly notes that unknown requests are excluded. An empty dataset has zero counts and
both cost fields `"0"`.

Pagination orders by `(started_at, trace_id)` in the selected direction, handling timestamp ties.
Cursors bind project/window/filters/sort; changing filters must reset pagination. They are not credentials
or snapshot-isolation guarantees when late ingestion changes a window. Trace APIs never select legacy
raw `error_message`; only sanitized categories and explicit metadata are returned.

## Errors, privacy and local integration

Errors use `{ "error": { "code": "...", "message": "..." } }`:
400 validation, 401 authentication, 403 Origin/trusted-request checks, 404 missing/nonowned resources,
409 registration conflict, 413 body bound, 415 media type, 422 analytics cardinality, 429 throttling,
500 generic internal failure. Responses include no-store, nosniff and a correlation ID. Logs contain
only safe category/request IDs, not credentials, SQL values, bodies or original exception messages.

Use dashboard registration/project/key generation for the normal local SDK path. The optional
`examples/local-project/create.ts --local-only` bootstrap is an ingestion fixture with a disabled owner,
not a login account. Its `.local` files are ignored and permission-restricted; never run its SQL remotely.
See [SDK](sdk.md) for native-Bun examples and [verification](verification.md) for actual test evidence.
