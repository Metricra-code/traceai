# SDK integration and reliability design

The SDK is the interview centerpiece: it demonstrates an explicit asynchronous boundary,
bounded memory, transient retry policy, testable transport and deterministic lifecycle management.
It is not a distributed tracing or durable message queue implementation.

For bounded real-model requests with your own credentials, see [Gemini integration](gemini.md).
The public demo remains simulated. [npm publication](npm.md) tracks authorization, exact-artifact
checks and registry verification; preparation is not a claim of completed publication.

## Quick start

From the repository root:

```sh
bun install
bun run --filter @traceai/sdk build
# Start the apps with `bun run dev`, create an account/project, then generate a key in Settings.
# For the deployed API, use the same workflow at the live site's /register page.
TRACEAI_API_KEY='<new-key>' TRACEAI_ENDPOINT='http://localhost:8787' bun run demo:node
```

The example emits one locally simulated success and one failure, with no paid AI calls.
Its provider/model are illustrative and have unknown pricing; they are not billed as seeded demo models.
Never paste the real key into committed source or shell scripts. Prefer your environment/secret manager.

```ts
import { TraceAI } from '@traceai/sdk';

const traceai = new TraceAI({
  apiKey: process.env.TRACEAI_API_KEY!,
  endpoint: process.env.TRACEAI_ENDPOINT!,
  onDiagnostic: (diagnostic) => logger.warn({ ...diagnostic }, 'Telemetry diagnostic'),
});

const response = await traceai.trace(
  {
    name: 'chat-completion',
    provider: 'example',
    model: 'your-provider-model-id',
    metadata: { feature: 'assistant', environment: 'production' },
  },
  async (span) => {
    const result = await yourModelClient.generate();
    // You map the provider's usage fields explicitly; no provider-specific assumptions.
    span.setUsage({ inputTokens: result.inputTokens, outputTokens: result.outputTokens });
    return result;
  },
);
```

`response` is the original object. Throws/rejections preserve the original error identity,
even when telemetry options, metadata or diagnostic callbacks are invalid.
Configuration errors are different: constructing an unsafe/misconfigured client throws a fixed
`TypeError('Invalid TraceAI configuration')` without echoing supplied credentials.

## Public options

| Option             | Default        | Boundary                                                        |
| ------------------ | -------------- | --------------------------------------------------------------- |
| `apiKey`           | Required       | Printable ASCII, 1–4,096 chars; never logged                    |
| `endpoint`         | Required       | API base or full `/v1/events/batch`; HTTPS except loopback      |
| `enabled`          | `true`         | `false` creates no timer, event or upload                       |
| `batchSize`        | `50`           | Integer 1–50                                                    |
| `flushIntervalMs`  | `5000`         | Positive integer, at most one hour                              |
| `requestTimeoutMs` | `5000`         | Positive integer, at most one hour                              |
| `maxQueueSize`     | `1000`         | Integer 1–100,000; includes queued and in-flight events         |
| `maxAttempts`      | `3`            | Integer 1–10, **including** initial delivery                    |
| `retryBaseMs`      | `250`          | Integer 0–60,000                                                |
| `retryMaxMs`       | `30000`        | Integer 0–60,000; also caps Retry-After                         |
| `onDiagnostic`     | No observer    | Sanitized code/count/attempt/status, never raw errors or labels |
| `fetch`            | Platform fetch | Optional compatible transport, useful for deterministic tests   |

URLs with credentials, query strings, fragments or non-HTTP(S) schemes are rejected.
The SDK sets `redirect: 'error'` so an ingestion key is not forwarded to an unexpected redirect target.
It never reads or logs response bodies. The browser must not import this SDK with a real ingestion key.

## Execution and privacy boundary

```text
application operation ──await──► original result / original error
          │
          └─ safe capture → validate → bounded queue → byte-sized batches
                                                       │
                                               bounded delivery/retry
```

- Capture snapshots operation name, provider, model and explicitly supplied metadata at start.
- Duration uses the monotonic performance clock; UTC end timestamps never precede start,
  including when the wall clock moves backwards.
- Metadata is a scalar record: string (max 2,000 chars), finite number, boolean or null;
  keys max 100 chars and total encoded UTF-8 JSON max **8 KiB**.
- Invalid metadata is omitted while a valid event still ships. Invalid event labels drop only that event.
- Usage requires integer counts 0–10,000,000. Invalid updates are ignored; the last valid report wins.
  Reports after an operation has completed are ignored.
- Raw prompts, return values, messages, stack traces, authentication headers and tokens are **not** captured.
- Error categories are only `timeout`, `rate_limit`, `network`, `application`, `unknown`.
  Mapping is intentionally conservative; categories do not imply provider-specific instrumentation.
- Custom metadata is your explicit privacy responsibility. Do not send personal information or secrets.
- `TraceOptions.errorSummary(error)` is a **failure-only opt-in**, never automatic `.message` capture.
  It must synchronously return a deliberately safe string (or `undefined`), at most 1,000 characters
  and 4 KiB UTF-8. Known token/auth/email/URL-credential patterns are redacted; arbitrary PII is
  **not** guaranteed to be detected. Prefer a controlled category summary, not `error.message`.
  Invalid/oversized values, hostile getters, throws and mistakenly async rejections are ignored.
  The API stores explicit summaries under `explicit-summary-v1`; historical/category-only errors stay summary-free.

There is synchronous capture/validation overhead and batch serialization uses the event loop;
“non-blocking” means no operation awaits telemetry **network delivery**, not zero CPU overhead.
The core SDK has no provider SDK or OpenTelemetry dependency. The optional
[`@traceai/opentelemetry`](opentelemetry.md) package adapts already-ended GenAI spans;
automatic provider instrumentation and distributed trace trees remain outside scope.

## Memory, batches and retry policy

The queue is bounded over **queued + currently in-flight** events. Overflow drops the newest event
and emits `queue_full`, preserving earlier events and avoiding a retry batch bypassing the bound.
Each request obeys both `batchSize` and the **256 KiB** encoded UTF-8 payload cap;
large-but-valid metadata therefore produces smaller batches. Size-triggered automatic drains retain
partial batches for the next interval; explicit/interval flushes upgrade an active drain to send all
pending events, avoiding tiny requests under a fast transport.

Each trace gets a stable cryptographic UUID. Retries reuse the **identical body and trace IDs**;
the server's project-scoped idempotent ingestion prevents duplicate database records after an
ambiguous response. This gives best-effort delivery with deduplication, not exactly-once delivery.

Transient failures: network/timeout and HTTP **408, 429, 500–599** only.
Permanent HTTP errors, including 400/401/403/413, are dropped without retry.
For retry number `attempt` after a failed upload:

```text
cap = min(retryMaxMs, retryBaseMs × 2^(attempt - 1))
jitter = floor(random() × cap)          // full jitter
wait = max(jitter, boundedRetryAfter)   // HTTP seconds or date; invalid/past → 0
```

Retry-After is capped to `retryMaxMs` to prevent an endpoint keeping the queue hostage.
Once attempts are exhausted the batch is dropped and `delivery_failed` is emitted.
Timeout uses AbortController **and** a promise race; a custom transport ignoring AbortSignal
cannot keep `flush()` stuck on its request indefinitely.

## Flush and shutdown semantics

- `flush()` is singleflight: concurrent callers receive the same in-progress promise.
  It drains until the queue is observed empty and resolves even if batches ultimately fail.
  Use diagnostics to observe loss; fulfillment is not a server persistence acknowledgment.
- `shutdown()` is idempotent. It stops the background interval and new telemetry immediately,
  waits for all operations already registered with the client, then drains their completed events.
  A trace started after closure still executes normally but has an inactive span and produces `client_closed`.
- Active operation tracking uses a counter and one shutdown barrier, not a cloned collection per callback.
  Shutdown handles an active operation completing while an older flush is finishing.
- Shutdown does not cancel application operations. An operation that never settles can keep shutdown waiting;
  set deadlines/AbortSignals on your own AI calls. **Do not await shutdown from inside a traced callback**.
- Background intervals are unreferenced on compatible runtimes (Node and Bun) and do not keep the process alive.
  Call `shutdown()` in a `finally` block or a controlled graceful-termination handler;
  do not call `process.exit()` before it finishes.
- Crashes, SIGKILL, short-lived serverless execution and instance suspension can lose in-memory events.
  In a Worker request use a lifecycle extension such as `ctx.waitUntil(client.shutdown())` after the operation,
  with a request-scoped client; runtime lifetime limits still apply. Do not share unbounded request lifecycle state.

Diagnostic codes: `invalid_event`, `invalid_metadata`, `invalid_usage`, `invalid_error_summary`, `queue_full`,
`delivery_retry`, `delivery_failed`, `client_closed`.
Diagnostic callbacks should be lightweight. Synchronous throws and async promise rejections are swallowed.
The SDK has no built-in console logger and never supplies an endpoint, API key, event body or original error to observers.

## Completed-event adapters and delivery receipts

`record(event: CompletedTrace): Promise<DeliveryResult>` is for **already-ended server-side operations**,
not a second wrapper around a fake no-op. Supply the original stable ID, UTC timestamps, duration,
labels and explicit usage. It validates the strict shared event contract and snapshots values.
Raw extra fields such as `errorMessage` are rejected; explicit `errorSummary` strings are sanitized.

```ts
const receipt = traceai.record(completedEvent);
await traceai.flush(); // Initiate a drain before waiting for a short-lived process's receipt.
const delivery = await receipt;
// { status: 'delivered' } OR { status: 'dropped', reason: ... }
```

`delivered` means the batch received an **HTTP 2xx acknowledgment**, not merely queued.
The TraceAI API acknowledges with HTTP 202 after ingestion; an arbitrary custom transport can return
2xx without persisting anything. Verify API storage separately when proving an end-to-end deployment.
Drop reasons: `disabled`, `client_closed`, `invalid_event`, `queue_full`, `delivery_failed`.
Receipts consume the same bounded queued/in-flight capacity, settle on permanent/exhausted failure,
and never turn best-effort `flush()` into a falsely successful acknowledgment.
Normal `trace()` intentionally does not await a receipt.

Public adapter helpers: `snapshotTraceMetadata(unknown)` accepts only valid plain scalar records and
returns a detached snapshot (or `undefined`); `sanitizeErrorSummary(string)` returns a bounded,
known-pattern-redacted summary (or `undefined`). Neither guarantees all-PII detection.

## Packaging and verification

The public package exports only `dist/index.js` and `dist/index.d.ts`.
`tsup` bundles the private shared schema implementation, leaving **Zod as the only runtime dependency**.
No React, Next.js, provider SDK or private workspace package is needed by a consumer.
The public SDK and optional adapter include the MIT license. **Neither has been published to npm**;
use workspace source/builds or locally packed tarballs until publication is explicitly authorized.
The Node example resolves source through TypeScript paths for pre-build checks and uses built output at runtime.

```sh
bun run --filter @traceai/sdk typecheck
bun run --filter @traceai/node-demo typecheck
bun run test packages/sdk/src/index.test.ts packages/sdk/src/extensions.test.ts
bun run test packages/sdk/src/index.test.ts packages/sdk/src/extensions.test.ts --coverage --coverage.include='packages/sdk/src/**/*.ts'
bun run --filter @traceai/sdk build
bun run --filter @traceai/opentelemetry build
bun run test:packages
```

The tests use controlled promises/fake clocks/transports, not real AI/network services. Coverage includes
result/error identity, explicit usage, disabled client, metadata bounds, hostile getters/observers,
monotonic duration, bounded queue including in-flight events, byte budgets, flush concurrency,
shutdown races, retry jitter, Retry-After, permanent errors, ignored AbortSignals, explicit summary
redaction, delivery receipts, and 10,000 simultaneously active callbacks with a bounded 50-event queue.
`test:packages` packs with Bun into ignored `.local/packages/`, installs an external temporary consumer,
checks strict public types and MIT files, then runs actual SDK + real OTel provider imports on Bun and
Node 22. The adapter's public SDK dependency is overridden to the local SDK tarball because no registry
release exists. No private workspace runtime dependency is installed; no package is published.

## Repeatable overhead benchmark

```sh
bun run --filter @traceai/sdk build
bun examples/node-demo/src/benchmark.ts
```

Both paths get 1,000 warm-up operations. Each measured path runs 10,000 operations, five repeats,
at concurrency 1 / 50 / 1,000. A stub transport acknowledges batches; between concurrent waves the
bounded queue is drained (that explicit drain time is excluded). Output includes runtime, hardware,
sample count, batch/delivery/loss counters, elapsed mean and sample P95. Concurrent sample P95
includes wave scheduling delay, **not** only one call's CPU time. This is not a network/provider
latency, sustained ingestion capacity or production SLA benchmark.

Observed 2026-10-08T19:57:02Z (Taipei Oct 9), Bun 1.4.0, Apple M2 arm64/macOS,
8 logical CPUs, 16 GiB RAM; median across five repeats:

| Concurrency | Added mean per operation | Wrapped sample P95 | Each repeat                                    |
| ----------- | ------------------------ | ------------------ | ---------------------------------------------- |
| 1           | 0.02153 ms               | 0.01496 ms         | 10,000 acknowledgments / 200 batches / 0 drops |
| 50          | 0.02047 ms               | 0.63483 ms         | 10,000 acknowledgments / 200 batches / 0 drops |
| 1,000       | 0.01085 ms               | 13.65900 ms        | 10,000 acknowledgments / 200 batches / 0 drops |

Mean includes chunk setup, bookkeeping and serialization while sample P95 measures each callback's
awaited span; they are different measurements and should not be compared as one distribution.
This run overlapped other local browser validation; machine load/JIT/GC affect results.
At concurrency1,000 the sample P95 is wave scheduling latency, not a per-call CPU-overhead/SLA pass.
Rerun rather than treating these numbers as guarantees or cherry-picking a quieter result.
