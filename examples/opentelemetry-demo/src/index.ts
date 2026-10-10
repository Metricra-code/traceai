import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { BasicTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { TraceAIExporter } from '@traceai/opentelemetry';

const apiKey = process.env.TRACEAI_API_KEY;
const inMemory = !apiKey;
let acknowledgedEvents = 0;
const exporter = new TraceAIExporter({
  apiKey: apiKey ?? 'in-memory',
  endpoint: process.env.TRACEAI_ENDPOINT ?? 'http://localhost:8787',
  metadata: () => ({ example: 'opentelemetry-demo', simulated: true }),
  errorSummary: () => 'Simulated provider failure for adapter verification.',
  ...(inMemory
    ? {
        fetch: async (_url: string | URL | Request, init?: RequestInit) => {
          acknowledgedEvents += (JSON.parse(String(init?.body)) as { events: unknown[] }).events
            .length;
          return new Response('{}', { status: 202 });
        },
      }
    : {}),
});
const provider = new BasicTracerProvider({
  forceFlushTimeoutMillis: 90_000,
  spanProcessors: [
    new BatchSpanProcessor(exporter, {
      maxExportBatchSize: 50,
      maxQueueSize: 200,
      scheduledDelayMillis: 60_000,
      // This two-event demo fits one HTTP batch; allow its bounded default retry budget.
      exportTimeoutMillis: 90_000,
    }),
  ],
});
const tracer = provider.getTracer('traceai-opentelemetry-demo', '0.1.0');
const traceIds: string[] = [];
try {
  for (const failed of [false, true]) {
    const span = tracer.startSpan('simulated-provider-operation', {
      kind: SpanKind.CLIENT,
      attributes: {
        'gen_ai.operation.name': 'chat',
        'gen_ai.provider.name': 'example',
        'gen_ai.request.model': 'simulated-summary',
      },
    });
    const context = span.spanContext();
    traceIds.push(`otel_${context.traceId}_${context.spanId}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
    if (failed) {
      span.setAttribute('error.type', 'application');
      span.setStatus({ code: SpanStatusCode.ERROR });
    } else {
      span.setAttributes({ 'gen_ai.usage.input_tokens': 1200, 'gen_ai.usage.output_tokens': 350 });
      span.setStatus({ code: SpanStatusCode.OK });
    }
    span.end();
  }
  await provider.forceFlush();
  if (inMemory && acknowledgedEvents !== 2) throw new Error('In-memory export count did not match');
  console.log(
    JSON.stringify({
      mode: inMemory ? 'in-memory' : 'api',
      events: 2,
      traceIds,
      acknowledgment: 'HTTP batch accepted; API persistence must be verified separately',
      provider: 'simulated; no paid AI calls',
    }),
  );
} finally {
  await provider.shutdown();
}
