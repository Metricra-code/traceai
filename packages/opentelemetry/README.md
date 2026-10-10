# @traceai/opentelemetry

Optional, server-side OpenTelemetry `SpanExporter` for GenAI operations. The core
`@akai_80percent/traceai-sdk` does not depend on OpenTelemetry. Bun 1.4+ / Node.js 22+; tested with
OpenTelemetry API 1.9.1 and tracing SDK 2.12.0.
**This adapter is not published to npm:** use workspace builds or the paired Bun-packed SDK/adapter
tarballs. The core `@akai_80percent/traceai-sdk@0.1.0` is published independently.
The repository's `bun run test:packages` exercises independent consumers without publishing.

```ts
import { TraceAIExporter } from '@traceai/opentelemetry';
import { BasicTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';

const exporter = new TraceAIExporter({
  apiKey: process.env.TRACEAI_API_KEY!,
  endpoint: process.env.TRACEAI_ENDPOINT!,
});
const provider = new BasicTracerProvider({
  forceFlushTimeoutMillis: 90_000,
  spanProcessors: [new BatchSpanProcessor(exporter, { exportTimeoutMillis: 90_000 })],
});
const tracer = provider.getTracer('my-ai-service');
const span = tracer.startSpan('chat', {
  attributes: {
    'gen_ai.operation.name': 'chat',
    'gen_ai.provider.name': 'example',
    'gen_ai.request.model': 'your-model',
  },
});
try {
  // Execute your application operation and explicitly set numeric usage attributes.
} finally {
  span.end();
}
await provider.forceFlush();
await provider.shutdown();
```

Align both the provider force-flush and processor export deadlines with the SDK's retry budget.
One default HTTP batch can take approximately 75s (three 5s requests plus two capped 30s Retry-After
waits); both OTel deadlines default to 30s and can fail while delivery continues. Queued or byte-split
batches can take longer, so 90s is not a universal drain deadline. Apply application-operation
deadlines separately.

Required mapping: operation/provider/model attributes, valid OTel IDs, ended span
and original high-resolution timestamps. Actual response model takes precedence.
Only numeric token counts 0..10,000,000 are retained; missing usage is unknown.
Composite `otel_<traceId>_<spanId>` IDs distinguish siblings. TraceAI stores flat
operation records, **not** a distributed span tree.

Privacy: no raw span name, resource, events, links, prompts, outputs, arbitrary
attributes, exception messages or status descriptions are copied. Optional
`metadata(span)` and failure-only `errorSummary(span)` are explicit opt-ins.
Metadata must be a plain scalar record <=8 KiB; invalid metadata is omitted.
Summary known-pattern redaction is best effort, not an all-PII guarantee.

`export()` callbacks run once after HTTP acceptance or explicit drop/failure,
not just enqueueing. HTTP acceptance is not proof of arbitrary-server durable
storage. `forceFlush()` rejects once for failed exports since the last flush;
`shutdown()` stops admission, drains and closes its private SDK. Both are
singleflight/idempotent. Never await either from a metadata/error mapper or
result callback. The incoming batch is capped at 512 spans by default (1..1000);
queued/in-flight pending spans share `maxQueueSize` (default1000).

Supports the TraceAI SDK's retry, timeout and byte/queue bounds. No OTLP server,
metrics exporter, logs exporter or automatic provider instrumentation is included.
Full mapping, lifecycle and no-paid-call example: repository `docs/opentelemetry.md`.
