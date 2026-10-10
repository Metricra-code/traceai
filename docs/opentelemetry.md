# Optional OpenTelemetry GenAI integration

`@traceai/opentelemetry` is a genuine server-side `SpanExporter`, separate from the
framework/runtime-independent core SDK. It exports **already-ended** GenAI spans with
real IDs, high-resolution UTC timestamps and duration through the SDK's bounded transport.
It does not wrap a fake no-op, capture browser keys or require paid provider calls.

Tested: OpenTelemetry API **1.9.1**, tracing SDK/core **2.12.0**, Bun **1.4.0** and Node **22**.
The JavaScript tracing APIs are documented by [OpenTelemetry JS](https://opentelemetry.io/docs/languages/js/)
and its [exporter guide](https://opentelemetry.io/docs/languages/js/exporters/).
GenAI conventions remain in development and have moved to the official
[GenAI conventions repository](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-spans.md).
The adapter deliberately supports a small documented attribute allowlist rather than claiming
all versions/providers/signals are compatible.

## Free runnable example

```sh
bun install
bun run --filter @akai_80percent/traceai-sdk build
bun run --filter @traceai/opentelemetry build
# Real OTel provider + in-memory HTTP acceptance, no credentials or network required:
bun examples/opentelemetry-demo/src/index.ts
# To send the same two simulated operations to your own project:
TRACEAI_API_KEY='<new-key>' TRACEAI_ENDPOINT='http://localhost:8787' \
  bun examples/opentelemetry-demo/src/index.ts
```

Generate the ingestion key in your project's Settings; keep it server-side and out of committed
files, terminal history and screenshots. The example emits JSON with two actual composite trace IDs,
not credentials, prompts or exception text. One span has explicit 1,200/350 token usage and one
simulated failure has unknown usage. Pricing remains unknown unless the real registry contains that
provider/model. HTTP acknowledgment alone is not a persistence assertion: inspect those IDs through
your authenticated project API/Dashboard to prove Worker → D1 ingestion.

The core `@akai_80percent/traceai-sdk@0.1.0` is published to npm; the optional
`@traceai/opentelemetry` adapter is not. Use workspace builds or paired Bun tarballs for the adapter.
`bun run test:packages` overrides the SDK with its local tarball to verify the current workspace
artifacts together, checks strict public declaration types/MIT files, then exercises both packages
on Bun and Node 22. It does not publish either package. See [SDK publication evidence](npm.md).

## Provider setup

```ts
import { BasicTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { TraceAIExporter } from '@traceai/opentelemetry';

const exporter = new TraceAIExporter({
  apiKey: process.env.TRACEAI_API_KEY!,
  endpoint: process.env.TRACEAI_ENDPOINT!,
  metadata: () => ({ service: 'my-ai-service', environment: 'production' }),
  // Optional failure-only safe category. Do not return span.status.message or exception text.
  errorSummary: () => 'AI operation failed after application deadline.',
});
const provider = new BasicTracerProvider({
  forceFlushTimeoutMillis: 90_000,
  spanProcessors: [
    new BatchSpanProcessor(exporter, {
      maxExportBatchSize: 50,
      maxQueueSize: 1000,
      scheduledDelayMillis: 5000,
      exportTimeoutMillis: 90_000,
    }),
  ],
});
const tracer = provider.getTracer('my-ai-service');
```

Configure both provider `forceFlushTimeoutMillis` and processor `exportTimeoutMillis` above your
SDK retry/timeout budget; each defaults to 30s. Increasing only the processor deadline still lets
`provider.forceFlush()` time out after 30s while delivery continues. OTel processor limits
are **separate** from TraceAI limits; processor timeouts/drop policies can lose spans before/while
exporting. One default HTTP batch can take up to approximately 75s with three 5s requests and two
30s capped Retry-After waits; queued or byte-split batches can take longer. The 90s example is not
a universal drain deadline. The runnable two-event demo uses both 90s deadlines for its single tiny
HTTP batch. Apply deadlines to the application AI operation itself. End spans in a `finally` block;
at controlled process termination, `await provider.forceFlush()` then `await provider.shutdown()`.
Do not await exporter lifecycle methods from a metadata/error mapper or result callback.

## Exact mapping and privacy

| Source                                               | TraceAI result                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `gen_ai.operation.name`                              | Operation `name`; required, bounded nonempty label                                         |
| `gen_ai.provider.name`                               | `provider`; required, bounded nonempty label                                               |
| `gen_ai.response.model`, else `gen_ai.request.model` | `model`; required by TraceAI, no invented fallback                                         |
| OTel trace ID + span ID                              | `otel_<traceId>_<spanId>`; stable across retries, siblings remain distinct                 |
| Span start/end/duration `HrTime`                     | Original nanosecond UTC timestamps and fractional milliseconds                             |
| `SpanStatusCode.ERROR`                               | `error`; otherwise `success`                                                               |
| `error.type`                                         | Conservative fixed category (`timeout`, `rate_limit`, `network`, `application`, `unknown`) |
| `gen_ai.usage.input_tokens` / `output_tokens`        | Only integer 0..10,000,000; missing/invalid count omitted, never fabricated as zero        |
| Explicit `metadata(span)`                            | Detached plain scalar record, <=8 KiB including reserved OTel IDs                          |
| Explicit failure-only `errorSummary(span)`           | Bounded known-pattern-redacted summary, optional                                           |

Spans without `gen_ai.operation.name` are intentionally filtered with a successful empty export.
An ended GenAI span missing mandatory labels/valid IDs/timing is rejected as invalid telemetry.
The exporter preserves the original timing precision **on the wire** and rejects reversed
sub-millisecond timestamps. The [TraceAI API](api.md) validates exact fractional ordering first,
then canonicalizes start/end timestamps to fixed UTC milliseconds for indexed storage and pricing.
Fractional `durationMs` remains available; this is not nanosecond-ordered database/chart storage.
`otelTraceId`/`otelSpanId` metadata always identify the actual span and cannot be overridden by a mapper.
Invalid, oversized, array/string or mistakenly async metadata is omitted; invalid summaries and
mapper exceptions are ignored. These safeguards do not alter the application operation's result/error.

**Never copied automatically:** raw span name, resource attributes, events, links, exception messages,
status description, prompts/outputs, HTTP headers, arbitrary attributes or arbitrary GenAI messages.
Explicit metadata/summaries remain your privacy responsibility. Known token/auth/email/URL credential
redaction is best effort, not a guarantee that all PII or secrets are detected.
TraceAI stores flat operation records, **not** a distributed parent/child span tree.

## Export callback, flush and shutdown

- Incoming OTel calls are capped by `maxExportBatchSize` (default512, integer1..1000).
  Pending spans, including in-flight HTTP requests, are bounded by `maxQueueSize` (default1000).
  Empty exports complete synchronously without allocating pending work.
- Underlying HTTP requests still obey SDK batch <=50 and UTF-8 body <=256 KiB. Retries reuse
  identical composite IDs/body; transient-only retry, full jitter, bounded Retry-After and ignored
  AbortSignal timeout protection are unchanged.
- `export()` invokes its callback **once after acknowledgment or explicit failure/drop**, not enqueueing.
  A successful callback means **HTTP 2xx batch accepted**, not proof that an arbitrary server committed
  it durably. The actual TraceAI API returns202 after its validated ingestion path; prove storage separately.
- Missing usage stays unknown; no fictitious usage/cost is inferred. Partial batch success is possible
  if some spans are invalid: the whole export callback reports failure, while valid spans may have been
  acknowledged. Stable IDs let the TraceAI API deduplicate a repeated attempt.
- `forceFlush()` is singleflight and waits for accepted pending exports. It rejects once with the fixed
  `Error('TraceAI export failed')` for unreported failed exports since the previous flush, then clears
  that failure marker. It does not silently present SDK best-effort flush fulfillment as delivery success.
- `shutdown()` is idempotent, stops new admission immediately, waits for accepted work and closes its
  private SDK. Failures are reported honestly; post-closure callbacks fail without destabilizing a drain.
  Result callback throws/rejections are swallowed and no labels/keys/raw exception details are exposed.

Tests use **real** BasicTracerProvider, SimpleSpanProcessor, BatchSpanProcessor and InMemorySpanExporter:

```sh
bun run test packages/opentelemetry/src/index.test.ts
bun run --filter @traceai/opentelemetry typecheck
bun run --filter @traceai/opentelemetry-demo typecheck
bun run test:packages # Build SDK and adapter first.
```

Coverage includes preserved IDs/timing, siblings, privacy getters, mapper shape/size bounds, explicit
summary redaction, invalid spans/usage, actual callback acknowledgment, permanent/retry/timeout failures,
in-flight overflow, empty-export allocation bound, forceFlush/shutdown/reentrancy and byte-sized batches.

## Deliberate non-goals

No OTLP receiver/collector, automatic provider patching, metrics/log exporter or full distributed tracing
backend. OpenTelemetry's other signals can be evaluated later as separate product scope; this adapter
is strictly a GenAI **traces** integration and does not imply metrics/log compatibility.
