# @akai_80percent/traceai-sdk

A standalone TypeScript client for best-effort, privacy-first AI operation telemetry.
It preserves operation results/errors, batches events, and bounds memory and delivery attempts.

## Installation

Use the public SDK package in your server-side application:

```sh
bun add @akai_80percent/traceai-sdk
# Or: npm install @akai_80percent/traceai-sdk
```

For the current registry release status and verified version, see the
[publication guide](https://github.com/Metricra-code/traceai/blob/main/docs/npm.md).
An install command requires an available registry release; packing alone is not publication.
For local development, build the repository workspace or install a locally packed tarball.
From the repository root:

```sh
bun install --frozen-lockfile
bun run --filter @akai_80percent/traceai-sdk build
mkdir -p .local
(cd packages/sdk && bun pm pack --filename ../../.local/traceai-sdk.tgz --ignore-scripts)
```

In a separate consumer project, use `bun add /absolute/path/to/traceai/.local/traceai-sdk.tgz`
(or `npm install` with the same file path). Packing is not publishing; generated artifacts stay in
ignored `.local/`. Repository examples already resolve the workspace package after it is built.

## Usage

```ts
import { TraceAI } from '@akai_80percent/traceai-sdk';

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
Only explicit scalar metadata is sent; prompts, results and raw error messages are never collected by default.
Failure-only `TraceOptions.errorSummary(error)` is a deliberate opt-in for a safe summary, not automatic
`.message` capture. Known-secret redaction is best effort, not an all-PII guarantee; invalid/oversized
summaries and callback failures are omitted while the original application error is rethrown.
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

`record(completedEvent)` validates/snapshots an already-ended operation and returns an actual
HTTP-acknowledged `delivered` or explicit `dropped` receipt. Do not mistake fulfillment of
best-effort `flush()` for acceptance. Call `flush()` before awaiting a short-lived process's receipt.
The optional `@traceai/opentelemetry` package uses this path; the core SDK has no OTel dependency.

The repository's workspace builds and Bun-packed tarballs are independently checked. Its
`bun run test:packages` verifies isolated public types, MIT license files, and Bun + Node 22 runtime
consumers. It does not publish anything.

Full integration, tuning, testing and benchmark guidance:
[SDK guide](https://github.com/Metricra-code/traceai/blob/main/docs/sdk.md).
For optional real-provider usage, see the
[Gemini integration guide](https://github.com/Metricra-code/traceai/blob/main/docs/gemini.md).
Gemini requires your own server-side provider credentials; free-tier/model availability and quotas
depend on your account and may change. The mock examples do not call or bill an AI provider.
