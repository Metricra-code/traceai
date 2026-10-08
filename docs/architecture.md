# Architecture

The paths below are implemented and deployed: [web demo](https://traceai-web.traceai-api.workers.dev/demo),
[API health](https://traceai-api.traceai-api.workers.dev/health). Built-workerd E2E and real deployed
SDK/account/key-revocation checks passed; final browser/CI evidence is tracked separately
in [verification](verification.md).

```mermaid
flowchart LR
    A[Developer application / mock provider] --> S[Standalone TypeScript SDK]
    S -->|safe non-blocking capture| Q[Bounded in-memory queue]
    Q -->|byte-bounded batch / jitter / timeout| H[Hono API Worker]
    H --> K[Project key authentication / atomic rate limit]
    H --> V[Zod whole-batch validation]
    K --> R[Trace repository / idempotent inserts]
    V --> R
    P[Versioned real pricing] --> R
    R --> D[(Cloudflare D1 / SQLite)]
    B[Browser / React dashboard] --> N[Next.js OpenNext Worker]
    N -->|same-origin proxy / service binding| H
    H --> C[Session / Origin / project ownership]
    C --> AN[Bounded analytics / cursor filtering]
    AN --> D
    H -->|private password RPC| PW[SQLite-backed PasswordHasher Durable Object]
    PW -->|salted scrypt digest only| H
    U[Public read-only simulated demo] --> N
    H --> DE[Fixed demo project reads]
    DE --> D
```

## Responsibilities and trust boundaries

- SDK knows neither React nor application return shapes. It captures only labels, time, categories,
  optional usage and explicit scalar metadata. Telemetry errors cannot replace an operation's result/error.
- HTTP routes validate input and enforce authentication. Services own lifecycle, authorization, costs and
  analytics semantics. Repositories own parameterized D1 access. Shared contracts have no persistence dependency.
- The browser uses `/api/*` on its own origin. The Next proxy forwards approved routes and necessary cookies/Origin
  to the API; production uses a Cloudflare service binding. No ingestion key is stored in frontend code.
- Management reads/writes require the authenticated project owner. Missing/non-owned resources both return 404;
  cookie mutations require the configured web Origin. Public demo reads always use project `demo`, never a query-supplied ID.
- Sessions use random tokens, hashed-at-rest IDs, seven-day expiration, HttpOnly/SameSite cookies and production Secure.
  API keys are independently salted, random 256-bit credentials; only a hash/prefix is stored and raw values are shown once.
- Prompts, responses, authentication headers and original error messages are not ingested. Legacy `error_message`
  columns are deliberately not selected by trace APIs. Opt-in metadata must not contain PII/secrets.

## Password runtime decision

The edge Worker calls a **private SQLite-backed Durable Object** to execute native `scryptSync`.
Parameters are fixed at `N=32768`, `r=8`, `p=3`, with a random 16-byte salt and constant-time verification.
This is the 32 MiB profile listed in [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt).
Only the versioned salted digest is persisted in D1; the Durable Object does not persist passwords.

SQLite-backed Durable Objects are eligible on Free and have a default 30-second CPU allowance,
unlike the constrained edge request budget. This boundary avoids lowering a secure work factor to fit
edge PBKDF2 limits. Rate limits precede hashing, and stable shards bound per-object contention.
[Cloudflare Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/).
This is a runtime/resource trade-off, not proof of unlimited throughput or zero-cost operation at any traffic level.

## Persistence and analytics

- Unique `(project_id, trace_id)` makes replayed ingestion idempotent. D1 batch transactions roll back every
  insert if a later statement fails. Five-row insert chunks stay within statement bind limits.
- Composite project/time, project/status/time and project/provider/model/time indexes support scoped queries.
- Analytics use UTC `[from,to)` windows of at most 31 days. Narrow projections read at most 20,001 candidates:
  more than 20,000 matches returns 422 rather than reporting truncated P95.
- P50/P95/P99 use deterministic nearest rank, `ceil(p × n)`. Metrics use zero-filled UTC hour/day buckets;
  the UI shows latency gaps when a bucket has no observations.
- Trace lists use stable `(started_at, trace_id)` keyset pagination. Cursors are versioned and bound to project,
  window, filters and sort; they are not authorization credentials or snapshot-isolation guarantees.
- Pricing uses effective, versioned real registry entries. Calculation/aggregate sums use BigInt nanodollars;
  D1 individual values are safe integers, and API amounts are decimal strings. Any unpriced row makes the
  aggregate total null, with explicit priced/unpriced counts. The separately labeled known subtotal sums
  priced requests only (null if a nonempty set is entirely unpriced); it never stands in for a grand total.
  Demo prices cannot price normal ingestion.

## Deliberate trade-offs

SDK delivery is best-effort, not durable: abrupt termination can lose queued events. Retried attempts reuse
trace IDs/body; database deduplication does not imply exactly-once delivery. Overflow drops newest telemetry
instead of backpressuring application work. Explicit flush/shutdown and safe diagnostics make loss observable.

There are no collectors, Redis/Kafka, paid AI calls, nested spans or WebSocket updates. No model-quality
claims are inferred from operational latency. Email verification/password recovery/MFA, retention automation
and OpenTelemetry remain future work. See [deployment](deployment.md) for quotas, lifecycle and live checks.
