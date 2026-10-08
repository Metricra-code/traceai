# @traceai/sdk

A standalone TypeScript client for best-effort, privacy-first AI operation telemetry.
It preserves operation results/errors, batches events, and bounds memory and delivery attempts.

```ts
import { TraceAI } from '@traceai/sdk';

const telemetry = new TraceAI({
  apiKey: process.env.TRACEAI_API_KEY!,
  endpoint: process.env.TRACEAI_ENDPOINT!,
});

try {
  const result = await telemetry.trace(
    { name: 'summarize', provider: 'example', model: 'my-model' },
    async (span) => {
      const response = await callModel();
      span.setUsage({ inputTokens: response.inputTokens, outputTokens: response.outputTokens });
      return response;
    },
  );
} finally {
  await telemetry.shutdown();
}
```

**Server-side only:** ingestion keys must never be included in a browser bundle.
Bun 1.4+ or Node.js 22+ provides the required Fetch, Web Crypto and performance APIs; the SDK has no Bun-specific dependencies.
Only explicit scalar metadata is sent; prompts, results and raw error messages are never collected.
Treat custom metadata as potentially sensitive.

Default limits: batch 50, UTF-8 payload 256 KiB, metadata 8 KiB, 1,000 queued/in-flight events,
5-second flush/timeout, 3 delivery attempts. Constructor rejects unsafe configuration with a fixed error.
HTTPS is required except localhost/127.0.0.1/::1 development endpoints.

`trace()` never awaits upload. `flush()` shares concurrent drains and resolves after bounded attempts;
it is **not** a durable delivery acknowledgment. Observe sanitized `onDiagnostic` codes for loss.
`shutdown()` stops new telemetry, waits for previously started operations and drains their events.
Operations must have their own deadlines; never await shutdown from inside a traced operation.

Retry: only network failures, timeouts, HTTP 408/429/5xx; exponential full jitter and bounded Retry-After.
Permanent failures and retry exhaustion drop the batch. Queue overflow drops the newest event.
The queue is in memory: process crashes, abrupt termination and serverless suspension can lose it.

Full integration, tuning, testing and benchmark guidance lives in the repository's `docs/sdk.md`.
