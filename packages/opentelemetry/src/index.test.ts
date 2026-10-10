import { SpanKind, SpanStatusCode, trace, ROOT_CONTEXT } from '@opentelemetry/api';
import { ExportResultCode, type ExportResult } from '@opentelemetry/core';
import {
  BasicTracerProvider,
  BatchSpanProcessor,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from '@opentelemetry/sdk-trace-base';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TraceAIExporter, type TraceAIExporterOptions } from './index';

const providers: BasicTracerProvider[] = [];
const exporters: TraceAIExporter[] = [];
const attributes = {
  'gen_ai.operation.name': 'chat',
  'gen_ai.provider.name': 'openai',
  'gen_ai.request.model': 'gpt-4o-mini',
  'gen_ai.usage.input_tokens': 120,
  'gen_ai.usage.output_tokens': 40,
};
const createExporter = (options: Partial<TraceAIExporterOptions> = {}) => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => new Response('{}', { status: 202 }));
  const exporter = new TraceAIExporter({
    apiKey: 'test-only',
    endpoint: 'http://localhost:8787',
    fetch,
    ...options,
  });
  exporters.push(exporter);
  return { exporter, fetch };
};
const recordedSpan = (extraAttributes = {}, error = false) => {
  const memory = new InMemorySpanExporter();
  const provider = new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(memory)] });
  providers.push(provider);
  const span = provider.getTracer('real-otel-test').startSpan('PRIVATE raw span name', {
    kind: SpanKind.CLIENT,
    startTime: [1_791_504_000, 123_456_789],
    attributes: { ...attributes, ...extraAttributes },
  });
  if (error) {
    span.setStatus({ code: SpanStatusCode.ERROR, message: 'PRIVATE status detail' });
    span.recordException(new Error('PRIVATE exception detail'));
  }
  span.end([1_791_504_000, 128_456_789]);
  const ended = memory.getFinishedSpans()[0];
  if (!ended) throw new Error('Real in-memory OTel provider did not record the span');
  return ended;
};
const overrideSpan = (
  span: ReadableSpan,
  overrides: Partial<ReadableSpan>,
  forbidden: string[] = [],
): ReadableSpan =>
  new Proxy(span, {
    get(target, property) {
      if (forbidden.includes(String(property))) throw new Error('PRIVATE getter');
      if (Object.hasOwn(overrides, property)) return Reflect.get(overrides, property);
      const value = Reflect.get(target, property, target);
      return property === 'spanContext' ? span.spanContext.bind(span) : value;
    },
  });
const exportSpans = (exporter: TraceAIExporter, spans: ReadableSpan[]) =>
  new Promise<ExportResult>((resolve) => exporter.export(spans, resolve));
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const events = (fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>) =>
  fetch.mock.calls.flatMap(
    (call) => (JSON.parse(String(call[1]?.body)) as { events: Record<string, unknown>[] }).events,
  );
afterEach(async () => {
  await Promise.all(
    providers.splice(0).map((provider) => provider.shutdown().catch(() => undefined)),
  );
  await Promise.all(
    exporters.splice(0).map((exporter) => exporter.shutdown().catch(() => undefined)),
  );
  vi.restoreAllMocks();
});

describe('GenAI span mapping', () => {
  it('maps real spans with original high-resolution timestamps, usage and composite IDs', async () => {
    const { exporter, fetch } = createExporter();
    const span = recordedSpan();
    expect(await exportSpans(exporter, [span])).toEqual({ code: ExportResultCode.SUCCESS });
    expect(events(fetch)[0]).toMatchObject({
      traceId: `otel_${span.spanContext().traceId}_${span.spanContext().spanId}`,
      name: 'chat',
      provider: 'openai',
      model: 'gpt-4o-mini',
      durationMs: 5,
      inputTokens: 120,
      outputTokens: 40,
      startedAt: new Date(1_791_504_000_000).toISOString().replace('.000Z', '.123456789Z'),
      endedAt: new Date(1_791_504_000_000).toISOString().replace('.000Z', '.128456789Z'),
      metadata: { otelTraceId: span.spanContext().traceId, otelSpanId: span.spanContext().spanId },
    });
  });
  it('does not read span names, events, status messages, arbitrary attributes or resources', async () => {
    const { exporter, fetch } = createExporter();
    const span = recordedSpan(
      { 'gen_ai.input.messages': 'PRIVATE prompt', authorization: 'PRIVATE key' },
      true,
    );
    const hostile = overrideSpan(span, {}, ['name', 'events', 'resource', 'links']);
    expect((await exportSpans(exporter, [hostile])).code).toBe(ExportResultCode.SUCCESS);
    expect(events(fetch)[0]).toMatchObject({ status: 'error', errorType: 'unknown' });
    expect(JSON.stringify(events(fetch))).not.toContain('PRIVATE');
    expect(events(fetch)[0]).not.toHaveProperty('errorSummary');
  });
  it('distinguishes sibling spans in one OTel trace without pretending a distributed trace tree', async () => {
    const { exporter, fetch } = createExporter();
    const first = recordedSpan();
    const second = recordedSpan();
    const sibling = overrideSpan(second, {
      spanContext: () => ({ ...second.spanContext(), traceId: first.spanContext().traceId }),
    });
    expect((await exportSpans(exporter, [first, sibling])).code).toBe(ExportResultCode.SUCCESS);
    expect(new Set(events(fetch).map((event) => event.traceId)).size).toBe(2);
  });
  it('filters non-GenAI spans and fails missing required TraceAI labels without inventing them', async () => {
    const { exporter, fetch } = createExporter();
    const span = recordedSpan();
    const nonGenAI = overrideSpan(span, { attributes: {} });
    expect((await exportSpans(exporter, [nonGenAI])).code).toBe(ExportResultCode.SUCCESS);
    expect(fetch).not.toHaveBeenCalled();
    const invalid = overrideSpan(span, { attributes: { 'gen_ai.operation.name': 'chat' } });
    expect((await exportSpans(exporter, [invalid])).code).toBe(ExportResultCode.FAILED);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('keeps missing usage unknown, ignores invalid numeric counts, and prefers the actual response model', async () => {
    const { exporter, fetch } = createExporter();
    const span = recordedSpan({
      'gen_ai.response.model': 'actual-model',
      'gen_ai.usage.input_tokens': -1,
      'gen_ai.usage.output_tokens': 1.2,
    });
    expect((await exportSpans(exporter, [span])).code).toBe(ExportResultCode.SUCCESS);
    expect(events(fetch)[0]).toMatchObject({ model: 'actual-model' });
    expect(events(fetch)[0]).not.toHaveProperty('inputTokens');
    expect(events(fetch)[0]).not.toHaveProperty('outputTokens');
  });
  it('captures only explicitly mapped scalar metadata and opt-in sanitized error summaries', async () => {
    const { exporter, fetch } = createExporter({
      metadata: () => ({ deployment: 'test', sample: 1 }),
      errorSummary: () => 'Safe failure user@example.com api_key=private',
    });
    expect(
      (await exportSpans(exporter, [recordedSpan({ 'error.type': 'timeout' }, true)])).code,
    ).toBe(ExportResultCode.SUCCESS);
    expect(events(fetch)[0]).toMatchObject({
      errorType: 'timeout',
      metadata: { deployment: 'test', sample: 1 },
      errorSummary: 'Safe failure [redacted-email] api_key=[redacted]',
    });
  });
  it('rejects unended spans, invalid IDs and reversed sub-millisecond timestamps without leaking fields', async () => {
    const { exporter, fetch } = createExporter();
    const span = recordedSpan();
    const invalid = [
      overrideSpan(span, { ended: false }),
      overrideSpan(span, {
        spanContext: () => ({ ...span.spanContext(), spanId: '0000000000000000' }),
      }),
      overrideSpan(span, { endTime: [span.startTime[0], span.startTime[1] - 1] }),
    ];
    for (const item of invalid)
      expect((await exportSpans(exporter, [item])).code).toBe(ExportResultCode.FAILED);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('does not call the error-summary mapper on successful spans or accept asynchronous summaries', async () => {
    const errorSummary = vi.fn(async () => {
      throw new Error('PRIVATE mapper');
    });
    const { exporter, fetch } = createExporter({
      errorSummary: errorSummary as unknown as NonNullable<TraceAIExporterOptions['errorSummary']>,
    });
    expect((await exportSpans(exporter, [recordedSpan()])).code).toBe(ExportResultCode.SUCCESS);
    expect(errorSummary).not.toHaveBeenCalled();
    expect((await exportSpans(exporter, [recordedSpan({}, true)])).code).toBe(
      ExportResultCode.SUCCESS,
    );
    expect(errorSummary).toHaveBeenCalledOnce();
    expect(JSON.stringify(events(fetch))).not.toContain('PRIVATE');
  });
  it('keeps mapper exceptions fail-open and rejects oversized explicit metadata without leaking it', async () => {
    const { exporter, fetch } = createExporter({
      metadata: () => {
        throw new Error('PRIVATE mapper');
      },
      errorSummary: () => {
        throw new Error('PRIVATE mapper');
      },
    });
    expect((await exportSpans(exporter, [recordedSpan({}, true)])).code).toBe(
      ExportResultCode.SUCCESS,
    );
    expect(JSON.stringify(events(fetch))).not.toContain('PRIVATE');
    const oversized = createExporter({ metadata: () => ({ giant: 'PRIVATE'.repeat(2000) }) });
    const result = await exportSpans(oversized.exporter, [recordedSpan()]);
    expect(result.code).toBe(ExportResultCode.SUCCESS);
    expect(events(oversized.fetch)[0]?.metadata).not.toHaveProperty('giant');
    expect(JSON.stringify(events(oversized.fetch))).not.toContain('PRIVATE');
  });
});

describe('export acknowledgment and lifecycle', () => {
  it('rejects invalid exporter configuration without leaking hostile getter details', () => {
    for (const maxExportBatchSize of [0, 1.5, 1001])
      expect(() => createExporter({ maxExportBatchSize })).toThrow(
        'Invalid TraceAI exporter configuration',
      );
    const options = { apiKey: 'test-only', endpoint: 'http://localhost:8787' };
    Object.defineProperty(options, 'metadata', {
      enumerable: true,
      get() {
        throw new Error('PRIVATE getter detail');
      },
    });
    expect(() => new TraceAIExporter(options)).toThrow('Invalid TraceAI exporter configuration');
  });
  it('completes empty exports synchronously without creating pending work', () => {
    const { exporter } = createExporter({ maxQueueSize: 1 });
    const callback = vi.fn();
    for (let i = 0; i < 10_000; i++) exporter.export([], callback);
    expect(callback).toHaveBeenCalledTimes(10_000);
    expect(callback).toHaveBeenLastCalledWith({ code: ExportResultCode.SUCCESS });
  });
  it('rejects accidental string/array/async metadata instead of spreading private contents', async () => {
    for (const mapper of [
      () => 'PRIVATE',
      () => ['PRIVATE'],
      async () => {
        throw new Error('PRIVATE');
      },
    ]) {
      const { exporter, fetch } = createExporter({
        metadata: mapper as unknown as NonNullable<TraceAIExporterOptions['metadata']>,
      });
      expect((await exportSpans(exporter, [recordedSpan()])).code).toBe(ExportResultCode.SUCCESS);
      expect(JSON.stringify(events(fetch))).not.toContain('PRIVATE');
    }
  });
  it('holds the result callback until transport acknowledgment and makes flush singleflight', async () => {
    const response = deferred<Response>();
    const { exporter } = createExporter({ fetch: vi.fn(() => response.promise) });
    const resultCallback = vi.fn();
    exporter.export([recordedSpan()], resultCallback);
    const flushing = exporter.forceFlush();
    expect(exporter.forceFlush()).toBe(flushing);
    await Promise.resolve();
    expect(resultCallback).not.toHaveBeenCalled();
    response.resolve(new Response('{}', { status: 202 }));
    await flushing;
    expect(resultCallback).toHaveBeenCalledExactlyOnceWith({ code: ExportResultCode.SUCCESS });
  });
  it.each([401, 503])(
    'reports HTTP %i failures honestly through callback and forceFlush',
    async (status) => {
      const { exporter } = createExporter({
        maxAttempts: 2,
        retryBaseMs: 0,
        fetch: vi.fn().mockImplementation(async () => new Response('{}', { status })),
      });
      const result = await exportSpans(exporter, [recordedSpan()]);
      expect(result.code).toBe(ExportResultCode.FAILED);
      expect(result.error?.message).toBe('TraceAI export failed');
      await expect(exporter.forceFlush()).rejects.toThrow('TraceAI export failed');
      await expect(exporter.forceFlush()).resolves.toBeUndefined();
    },
  );
  it('bounds pending work including in-flight requests and rejects excessive export batches', async () => {
    const response = deferred<Response>();
    const { exporter } = createExporter({
      maxQueueSize: 1,
      maxExportBatchSize: 1,
      fetch: vi.fn(() => response.promise),
    });
    const pending = exportSpans(exporter, [recordedSpan()]);
    expect((await exportSpans(exporter, [recordedSpan()])).code).toBe(ExportResultCode.FAILED);
    expect((await exportSpans(exporter, [recordedSpan(), recordedSpan()])).code).toBe(
      ExportResultCode.FAILED,
    );
    response.resolve(new Response('{}', { status: 202 }));
    expect((await pending).code).toBe(ExportResultCode.SUCCESS);
  });
  it('drains accepted exports on idempotent shutdown and rejects new exports', async () => {
    const response = deferred<Response>();
    const { exporter } = createExporter({ fetch: vi.fn(() => response.promise) });
    const pending = exportSpans(exporter, [recordedSpan()]);
    const shutdown = exporter.shutdown();
    expect(exporter.shutdown()).toBe(shutdown);
    expect((await exportSpans(exporter, [recordedSpan()])).code).toBe(ExportResultCode.FAILED);
    response.resolve(new Response('{}', { status: 202 }));
    expect((await pending).code).toBe(ExportResultCode.SUCCESS);
    await shutdown;
  });
  it('does not let throwing export callbacks or reentrant shutdown break the processor boundary', async () => {
    let shuttingDown: Promise<void> | undefined;
    const { exporter } = createExporter({
      metadata: () => {
        shuttingDown = exporter.shutdown();
        return { safe: true };
      },
    });
    const resultCallback = vi.fn((_result: ExportResult) => {
      throw new Error('PRIVATE callback');
    });
    expect(() => exporter.export([recordedSpan()], resultCallback)).not.toThrow();
    await shuttingDown;
    expect(resultCallback).toHaveBeenCalledOnce();
    expect(resultCallback.mock.calls[0]?.[0].code).toBe(ExportResultCode.SUCCESS);
  });
  it('bounds payload bytes with large valid metadata and still acknowledges every span', async () => {
    const { exporter, fetch } = createExporter({
      metadata: () =>
        Object.fromEntries(['a', 'b', 'c', 'd'].map((key) => [key, 'x'.repeat(1900)])),
    });
    expect(
      (
        await exportSpans(
          exporter,
          Array.from({ length: 50 }, () => recordedSpan()),
        )
      ).code,
    ).toBe(ExportResultCode.SUCCESS);
    expect(events(fetch)).toHaveLength(50);
    expect(fetch.mock.calls.length).toBeGreaterThan(1);
    for (const call of fetch.mock.calls)
      expect(new TextEncoder().encode(String(call[1]?.body)).length).toBeLessThanOrEqual(
        256 * 1024,
      );
  });
  it('reports ignored AbortSignals and disabled delivery as failures, not accepted exports', async () => {
    const stalled = createExporter({
      maxAttempts: 2,
      requestTimeoutMs: 5,
      retryBaseMs: 0,
      fetch: () => new Promise<Response>(() => undefined),
    });
    expect((await exportSpans(stalled.exporter, [recordedSpan()])).code).toBe(
      ExportResultCode.FAILED,
    );
    const disabled = createExporter({ enabled: false });
    expect((await exportSpans(disabled.exporter, [recordedSpan()])).code).toBe(
      ExportResultCode.FAILED,
    );
    expect(disabled.fetch).not.toHaveBeenCalled();
  });
  it('integrates with the real BatchSpanProcessor, flushes 101 spans in bounded HTTP batches', async () => {
    const { exporter, fetch } = createExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [
        new BatchSpanProcessor(exporter, {
          maxExportBatchSize: 50,
          maxQueueSize: 200,
          scheduledDelayMillis: 60_000,
        }),
      ],
    });
    providers.push(provider);
    const tracer = provider.getTracer('real-batch-provider');
    for (let i = 0; i < 101; i++)
      tracer.startSpan('private-name', { attributes }, ROOT_CONTEXT).end();
    await provider.forceFlush();
    expect(events(fetch)).toHaveLength(101);
    expect(new Set(events(fetch).map((event) => event.traceId)).size).toBe(101);
    for (const call of fetch.mock.calls)
      expect(
        (JSON.parse(String(call[1]?.body)) as { events: unknown[] }).events.length,
      ).toBeLessThanOrEqual(50);
  });
  it('integrates with real SimpleSpanProcessor without changing the application operation', async () => {
    const { exporter, fetch } = createExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    providers.push(provider);
    const result = Object.freeze({ original: true });
    const span = provider.getTracer('simple-provider').startSpan('ignored', { attributes });
    span.end();
    expect(result).toEqual({ original: true });
    await provider.forceFlush();
    expect(events(fetch)).toHaveLength(1);
    expect(trace.setSpan(ROOT_CONTEXT, span)).toBeDefined();
  });
  it('lets the runnable demo finish a retry beyond the default OTel deadlines', async () => {
    vi.useFakeTimers();
    vi.stubEnv('TRACEAI_API_KEY', 'test-only');
    vi.stubEnv('TRACEAI_ENDPOINT', 'http://localhost:8787');
    vi.doMock('@traceai/opentelemetry', () => ({ TraceAIExporter }));
    const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => {
      if (fetch.mock.calls.length === 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return new Response(null, { status: 429, headers: { 'Retry-After': '30' } });
      }
      return new Response(null, { status: 202 });
    });
    vi.stubGlobal('fetch', fetch);
    try {
      const demo = import('../../../examples/opentelemetry-demo/src/index').then(
        () => ({ status: 'completed' as const }),
        (error: unknown) => ({
          status: 'failed' as const,
          reason: String(error),
        }),
      );
      await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
      await vi.advanceTimersByTimeAsync(35_000);
      expect(await demo).toEqual({ status: 'completed' });
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(
        (JSON.parse(String(fetch.mock.calls[1]?.[1]?.body)) as { events: unknown[] }).events,
      ).toHaveLength(2);
      expect(output).toHaveBeenCalledOnce();
      expect(JSON.parse(String(output.mock.calls[0]?.[0]))).toMatchObject({
        mode: 'api',
        events: 2,
        acknowledgment: 'HTTP batch accepted; API persistence must be verified separately',
      });
    } finally {
      vi.doUnmock('@traceai/opentelemetry');
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      vi.useRealTimers();
    }
  });
});
