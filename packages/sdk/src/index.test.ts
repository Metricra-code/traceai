import { afterEach, describe, expect, it, vi } from 'vitest';
import { TraceAI, type TraceAIConfig, type TraceMetadata } from './index';

const options = { name: 'summarize', provider: 'example', model: 'model-v1' };
const clients: TraceAI[] = [];
const accepted = () => new Response('{}', { status: 202 });
const createClient = (overrides: Partial<TraceAIConfig> = {}) => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => accepted());
  const client = new TraceAI({
    apiKey: 'test-secret',
    endpoint: 'http://localhost:8787',
    fetch,
    ...overrides,
  });
  clients.push(client);
  return { client, fetch };
};
const deliveredEvents = (fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>, call = 0) =>
  JSON.parse(String(fetch.mock.calls[call]?.[1]?.body)).events as Record<string, unknown>[];
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
afterEach(async () => {
  const closing = clients.splice(0).map((client) => client.shutdown());
  if (vi.isFakeTimers()) await vi.runAllTimersAsync();
  await Promise.all(closing);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('TraceAI operation boundary', () => {
  it('returns the original result without waiting for delivery', async () => {
    const { client, fetch } = createClient();
    const result = { answer: 42 };
    expect(await client.trace(options, async () => result)).toBe(result);
    expect(fetch).not.toHaveBeenCalled();
    await client.flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]?.[0]).toBe('http://localhost:8787/v1/events/batch');
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({
      redirect: 'error',
      headers: { Authorization: 'Bearer test-secret' },
    });
  });
  it('rethrows the original error, never its secret message in telemetry', async () => {
    const { client, fetch } = createClient();
    const error = new Error('secret-prompt');
    await expect(
      client.trace(options, async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    await client.flush();
    expect(deliveredEvents(fetch)[0]).toMatchObject({ status: 'error', errorType: 'application' });
    expect(String(fetch.mock.calls[0]?.[1]?.body)).not.toContain('secret-prompt');
  });
  it('supports synchronous throws and rejection values that are not Errors', async () => {
    const { client, fetch } = createClient();
    const failure = { secret: 'hidden' };
    await expect(
      client.trace(options, () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    await client.flush();
    expect(deliveredEvents(fetch)[0]?.errorType).toBe('unknown');
  });
  it('does not await a pending upload even when the batch threshold is reached', async () => {
    const upload = deferred<Response>();
    const transport = vi.fn<typeof globalThis.fetch>().mockReturnValue(upload.promise);
    const { client } = createClient({ batchSize: 1, fetch: transport });
    expect(await client.trace(options, async () => 7)).toBe(7);
    expect(transport).toHaveBeenCalledTimes(1);
    upload.resolve(accepted());
    await client.flush();
  });
  it('records explicit validated usage but never captures result contents', async () => {
    const { client, fetch } = createClient();
    await client.trace(options, async (span) => {
      span.setUsage({ inputTokens: 120, outputTokens: 35 });
      return { prompt: 'secret' };
    });
    await client.flush();
    expect(deliveredEvents(fetch)[0]).toMatchObject({ inputTokens: 120, outputTokens: 35 });
    expect(String(fetch.mock.calls[0]?.[1]?.body)).not.toContain('secret');
  });
  it('ignores invalid usage without breaking the operation or replacing prior usage', async () => {
    const onDiagnostic = vi.fn();
    const { client, fetch } = createClient({ onDiagnostic });
    expect(
      await client.trace(options, async (span) => {
        span.setUsage({ inputTokens: 4, outputTokens: 2 });
        span.setUsage({ inputTokens: -1, outputTokens: 1 });
        return 'done';
      }),
    ).toBe('done');
    await client.flush();
    expect(deliveredEvents(fetch)[0]).toMatchObject({ inputTokens: 4, outputTokens: 2 });
    expect(onDiagnostic).toHaveBeenCalledWith({ code: 'invalid_usage', count: 1 });
  });
  it('measures monotonic duration while guarding against a backwards wall clock', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-10-09T00:00:00Z');
    const { client, fetch } = createClient();
    const started = deferred<void>();
    const operation = client.trace(options, () => started.promise);
    await vi.advanceTimersByTimeAsync(125);
    vi.setSystemTime('2026-10-08T00:00:00Z');
    started.resolve();
    await operation;
    await client.flush();
    const event = deliveredEvents(fetch)[0]!;
    expect(event.durationMs).toBe(125);
    expect(Date.parse(String(event.endedAt))).toBeGreaterThanOrEqual(
      Date.parse(String(event.startedAt)),
    );
  });
  it('classifies timeout, rate limit and network without recording details', async () => {
    const { client, fetch } = createClient();
    const errors = [
      new DOMException('sensitive', 'AbortError'),
      { status: 429 },
      { code: 'ECONNRESET' },
    ];
    for (const error of errors)
      await expect(
        client.trace(options, async () => {
          throw error;
        }),
      ).rejects.toBe(error);
    await client.flush();
    expect(deliveredEvents(fetch).map((event) => event.errorType)).toEqual([
      'timeout',
      'rate_limit',
      'network',
    ]);
  });
});

describe('privacy and hostile telemetry', () => {
  it('snapshots metadata before the operation and does not mutate user objects', async () => {
    const { client, fetch } = createClient();
    const metadata = { feature: 'before' };
    await client.trace({ ...options, metadata }, async () => {
      metadata.feature = 'after';
    });
    await client.flush();
    expect(deliveredEvents(fetch)[0]?.metadata).toEqual({ feature: 'before' });
    expect(metadata).toEqual({ feature: 'after' });
  });
  it.each([
    { nested: { secret: true } },
    { invalid: Number.POSITIVE_INFINITY },
    {
      a: 'x'.repeat(2000),
      b: 'x'.repeat(2000),
      c: 'x'.repeat(2000),
      d: 'x'.repeat(2000),
      e: 'x'.repeat(1000),
    },
  ])('drops invalid metadata only; still returns the operation result', async (metadata) => {
    const onDiagnostic = vi.fn();
    const { client, fetch } = createClient({ onDiagnostic });
    expect(
      await client.trace(
        { ...options, metadata: metadata as unknown as TraceMetadata },
        async () => 3,
      ),
    ).toBe(3);
    await client.flush();
    expect(deliveredEvents(fetch)[0]).not.toHaveProperty('metadata');
    expect(onDiagnostic).toHaveBeenCalledWith({ code: 'invalid_metadata', count: 1 });
  });
  it('never lets a metadata getter or diagnostic callback mask application behavior', async () => {
    const metadata = Object.defineProperty({}, 'secret', {
      enumerable: true,
      get: () => {
        throw new Error('sensitive');
      },
    });
    const { client, fetch } = createClient({
      onDiagnostic: () => {
        throw new Error('callback');
      },
    });
    expect(await client.trace({ ...options, metadata }, async () => 1)).toBe(1);
    const original = new Error('original');
    await expect(
      client.trace({ ...options, metadata }, async () => {
        throw original;
      }),
    ).rejects.toBe(original);
    await client.flush();
    expect(deliveredEvents(fetch)).toHaveLength(2);
  });
  it('handles async diagnostic callback rejections without unhandled rejections', async () => {
    const { client } = createClient({
      onDiagnostic: async () => {
        throw new Error('callback');
      },
    });
    expect(await client.trace({ ...options, model: '' }, async () => 5)).toBe(5);
    await client.flush();
    await Promise.resolve();
  });
  it('drops an invalid event without changing the result', async () => {
    const onDiagnostic = vi.fn();
    const { client, fetch } = createClient({ onDiagnostic });
    expect(await client.trace({ ...options, name: 'x'.repeat(121) }, async () => 9)).toBe(9);
    await client.flush();
    expect(fetch).not.toHaveBeenCalled();
    expect(onDiagnostic).toHaveBeenCalledWith({ code: 'invalid_event', count: 1 });
  });
});

describe('bounded batching and lifecycle', () => {
  it('splits into configured batch sizes with stable unique trace IDs', async () => {
    const { client, fetch } = createClient({ batchSize: 2 });
    for (let index = 0; index < 5; index++) await client.trace(options, async () => index);
    await client.flush();
    expect(fetch.mock.calls.map((_, index) => deliveredEvents(fetch, index).length)).toEqual([
      2, 2, 1,
    ]);
    expect(
      new Set(
        fetch.mock.calls.flatMap((_, index) =>
          deliveredEvents(fetch, index).map((event) => event.traceId),
        ),
      ).size,
    ).toBe(5);
  });
  it('enforces the total queue bound including in-flight batches and drops newest', async () => {
    const upload = deferred<Response>();
    const transport = vi.fn<typeof globalThis.fetch>().mockReturnValue(upload.promise);
    const onDiagnostic = vi.fn();
    const { client } = createClient({
      batchSize: 1,
      maxQueueSize: 2,
      fetch: transport,
      onDiagnostic,
    });
    await client.trace({ ...options, name: 'first' }, async () => 1);
    await client.trace({ ...options, name: 'second' }, async () => 2);
    await client.trace({ ...options, name: 'dropped' }, async () => 3);
    expect(onDiagnostic).toHaveBeenCalledWith({ code: 'queue_full', count: 1 });
    upload.resolve(accepted());
    await client.flush();
    expect(
      transport.mock.calls.flatMap((_, index) =>
        deliveredEvents(transport, index).map((event) => event.name),
      ),
    ).toEqual(['first', 'second']);
  });
  it('flushes on interval and supports concurrent flush singleflight', async () => {
    vi.useFakeTimers();
    const upload = deferred<Response>();
    const transport = vi.fn<typeof globalThis.fetch>().mockReturnValue(upload.promise);
    const { client } = createClient({ flushIntervalMs: 100, fetch: transport });
    await client.trace(options, async () => 1);
    await vi.advanceTimersByTimeAsync(100);
    const first = client.flush();
    expect(client.flush()).toBe(first);
    expect(transport).toHaveBeenCalledTimes(1);
    upload.resolve(accepted());
    await first;
  });
  it('keeps every encoded request within the 256 KiB body budget', async () => {
    const { client, fetch } = createClient();
    const metadata = {
      a: '😀'.repeat(450),
      b: '😀'.repeat(450),
      c: '😀'.repeat(450),
      d: '😀'.repeat(450),
    };
    for (let index = 0; index < 50; index++)
      await client.trace({ ...options, metadata }, async () => index);
    await client.flush();
    expect(fetch.mock.calls.length).toBeGreaterThan(1);
    expect(
      fetch.mock.calls.every(
        (call) => new TextEncoder().encode(String(call[1]?.body)).length <= 256 * 1024,
      ),
    ).toBe(true);
    expect(fetch.mock.calls.flatMap((_, index) => deliveredEvents(fetch, index))).toHaveLength(50);
  });
  it('shutdown is idempotent and waits only for traces started before closure', async () => {
    const { client, fetch } = createClient();
    const active = deferred<number>();
    const result = client.trace(options, () => active.promise);
    const shutdown = client.shutdown();
    expect(client.shutdown()).toBe(shutdown);
    expect(await client.trace({ ...options, name: 'after-close' }, async () => 6)).toBe(6);
    expect(fetch).not.toHaveBeenCalled();
    active.resolve(7);
    expect(await result).toBe(7);
    await shutdown;
    expect(deliveredEvents(fetch).map((event) => event.name)).toEqual(['summarize']);
    await client.flush();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('disabled SDK executes operations but sends nothing and creates no timers', async () => {
    vi.useFakeTimers();
    const { client, fetch } = createClient({ enabled: false });
    await client.trace(options, async (span) => {
      span.setUsage({ inputTokens: 2, outputTokens: 1 });
    });
    await client.flush();
    expect(fetch).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('transport reliability', () => {
  it.each([408, 429, 500, 503])(
    'retries transient HTTP %i with bounded attempts and identical body',
    async (status) => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const transport = vi
        .fn<typeof globalThis.fetch>()
        .mockImplementation(async () => new Response(null, { status }));
      const onDiagnostic = vi.fn();
      const { client } = createClient({
        fetch: transport,
        maxAttempts: 3,
        retryBaseMs: 10,
        retryMaxMs: 100,
        flushIntervalMs: 60_000,
        onDiagnostic,
      });
      await client.trace(options, async () => 1);
      const flushing = client.flush();
      await vi.advanceTimersByTimeAsync(4);
      expect(transport).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(transport).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(10);
      await flushing;
      expect(transport).toHaveBeenCalledTimes(3);
      expect(new Set(transport.mock.calls.map((call) => call[1]?.body)).size).toBe(1);
      expect(onDiagnostic).toHaveBeenLastCalledWith({
        code: 'delivery_failed',
        count: 1,
        attempt: 3,
        httpStatus: status,
      });
    },
  );
  it.each([400, 401, 403, 413])('does not retry permanent HTTP %i', async (status) => {
    const transport = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(async () => new Response(null, { status }));
    const { client } = createClient({ fetch: transport });
    await client.trace(options, async () => 1);
    await client.flush();
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('retries a network failure then succeeds without leaking its details', async () => {
    const transport = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new Error('test-secret'))
      .mockResolvedValueOnce(accepted());
    const onDiagnostic = vi.fn();
    const { client } = createClient({ fetch: transport, retryBaseMs: 0, onDiagnostic });
    await client.trace(options, async () => 1);
    await client.flush();
    expect(transport).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(onDiagnostic.mock.calls)).not.toContain('test-secret');
  });
  it('honors Retry-After but caps it to the configured maximum', async () => {
    vi.useFakeTimers();
    const transport = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(null, { status: 429, headers: { 'Retry-After': '3600' } }),
      )
      .mockResolvedValueOnce(accepted());
    const { client } = createClient({ fetch: transport, retryBaseMs: 0, retryMaxMs: 100 });
    await client.trace(options, async () => 1);
    const flushing = client.flush();
    await vi.advanceTimersByTimeAsync(99);
    expect(transport).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await flushing;
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it('times out even a transport that ignores AbortSignal and retries only up to the limit', async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const transport = vi.fn<typeof globalThis.fetch>().mockImplementation((_url, init) => {
      signals.push(init!.signal!);
      return new Promise(() => {});
    });
    const { client } = createClient({
      fetch: transport,
      requestTimeoutMs: 10,
      retryBaseMs: 0,
      maxAttempts: 2,
    });
    await client.trace(options, async () => 1);
    const flushing = client.flush();
    await vi.advanceTimersByTimeAsync(20);
    await flushing;
    expect(transport).toHaveBeenCalledTimes(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});

describe('configuration boundary', () => {
  it.each([
    { endpoint: 'http://evil.example' },
    { endpoint: 'https://user:password@example.com' },
    { endpoint: 'https://example.com?token=secret' },
    { endpoint: 'file:///tmp/key' },
    { apiKey: `${crypto.randomUUID()}\n` },
    { apiKey: '' },
    { batchSize: 51 },
    { maxAttempts: 0 },
    { maxQueueSize: 0 },
    { requestTimeoutMs: 0 },
    { flushIntervalMs: -1 },
  ])('rejects unsafe configuration with a fixed safe error', (overrides) => {
    expect(() => createClient(overrides)).toThrow('Invalid TraceAI configuration');
  });
  it.each(['https://example.com', 'http://127.0.0.1:8787', 'http://[::1]:8787'])(
    'allows secure endpoint or loopback %s',
    (endpoint) => {
      expect(() => createClient({ endpoint })).not.toThrow();
    },
  );
  it('does not append the ingestion path twice', async () => {
    const { client, fetch } = createClient({ endpoint: 'https://example.com/v1/events/batch' });
    await client.trace(options, async () => 1);
    await client.flush();
    expect(fetch.mock.calls[0]?.[0]).toBe('https://example.com/v1/events/batch');
  });
});

describe('lifecycle race regressions', () => {
  it('drains an active completion racing an older in-flight flush during shutdown', async () => {
    const upload = deferred<Response>();
    const active = deferred<number>();
    const transport = vi
      .fn<typeof globalThis.fetch>()
      .mockReturnValueOnce(upload.promise)
      .mockImplementation(async () => accepted());
    const { client } = createClient({ fetch: transport });
    await client.trace({ ...options, name: 'first' }, async () => 1);
    const originalFlush = client.flush();
    const operation = client.trace({ ...options, name: 'last-active' }, () => active.promise);
    const shutdown = client.shutdown();
    upload.resolve(accepted());
    await originalFlush;
    active.resolve(2);
    await operation;
    await shutdown;
    expect(
      transport.mock.calls.flatMap((_, index) =>
        deliveredEvents(transport, index).map((event) => event.name),
      ),
    ).toEqual(['first', 'last-active']);
  });
  it('ignores usage reports made after the span is closed', async () => {
    const { client, fetch } = createClient();
    let retainedSpan: import('./index').TraceSpan | undefined;
    await client.trace(options, async (span) => {
      retainedSpan = span;
      span.setUsage({ inputTokens: 1, outputTokens: 2 });
    });
    retainedSpan!.setUsage({ inputTokens: 999, outputTokens: 999 });
    await client.flush();
    expect(deliveredEvents(fetch)[0]).toMatchObject({ inputTokens: 1, outputTokens: 2 });
  });
  it('preserves operation results when the options object itself is hostile', async () => {
    const { client, fetch } = createClient();
    const hostile = Object.defineProperty({ ...options }, 'name', {
      get: () => {
        throw new Error('secret');
      },
    });
    expect(await client.trace(hostile, async () => 3)).toBe(3);
    await client.flush();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('preserves errors even when their classification properties throw', async () => {
    const { client, fetch } = createClient();
    const error = Object.defineProperty(new Error('secret'), 'status', {
      get: () => {
        throw new Error('getter');
      },
    });
    await expect(
      client.trace(options, async () => {
        throw error;
      }),
    ).rejects.toBe(error);
    await client.flush();
    expect(deliveredEvents(fetch)[0]?.errorType).toBe('unknown');
  });
  it('includes an operation in shutdown before diagnostics can invoke shutdown', async () => {
    const active = deferred<number>();
    let closure: Promise<void> | undefined;
    const { client } = createClient({
      onDiagnostic: () => {
        closure ??= client.shutdown();
      },
    });
    const running = client.trace(
      { ...options, metadata: { nested: {} } as unknown as TraceMetadata },
      () => active.promise,
    );
    active.resolve(5);
    expect(await running).toBe(5);
    await closure;
  });
});

describe('Retry-After parsing', () => {
  it('supports HTTP dates in addition to delta seconds', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-10-09T00:00:00Z');
    const transport = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 503,
          headers: { 'Retry-After': 'Fri, 09 Oct 2026 00:00:01 GMT' },
        }),
      )
      .mockResolvedValueOnce(accepted());
    const { client } = createClient({ fetch: transport, retryBaseMs: 0, retryMaxMs: 2000 });
    await client.trace(options, async () => 1);
    const flushing = client.flush();
    await vi.advanceTimersByTimeAsync(999);
    expect(transport).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await flushing;
    expect(transport).toHaveBeenCalledTimes(2);
  });
  it.each(['garbage', '-30', 'Infinity'])(
    'ignores invalid or past Retry-After %s',
    async (header) => {
      const transport = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValueOnce(
          new Response(null, { status: 429, headers: { 'Retry-After': header } }),
        )
        .mockResolvedValueOnce(accepted());
      const { client } = createClient({ fetch: transport, retryBaseMs: 0 });
      await client.trace(options, async () => 1);
      await client.flush();
      expect(transport).toHaveBeenCalledTimes(2);
    },
  );
});

describe('automatic batching regressions', () => {
  it('does not send partial automatic batches before the interval or an explicit flush', async () => {
    const { client, fetch } = createClient({ batchSize: 3 });
    for (let index = 0; index < 5; index++) await client.trace(options, async () => index);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(deliveredEvents(fetch)).toHaveLength(3);
    await client.flush();
    expect(fetch.mock.calls.map((_, index) => deliveredEvents(fetch, index).length)).toEqual([
      3, 2,
    ]);
  });
  it('an explicit flush upgrades an active automatic drain and remains singleflight through shutdown', async () => {
    const upload = deferred<Response>();
    const transport = vi
      .fn<typeof globalThis.fetch>()
      .mockReturnValueOnce(upload.promise)
      .mockImplementation(async () => accepted());
    const { client } = createClient({ batchSize: 2, fetch: transport });
    for (let index = 0; index < 3; index++) await client.trace(options, async () => index);
    expect(transport).toHaveBeenCalledTimes(1);
    const flushing = client.flush();
    expect(client.flush()).toBe(flushing);
    const shutdown = client.shutdown();
    expect(client.shutdown()).toBe(shutdown);
    upload.resolve(accepted());
    await Promise.all([flushing, shutdown]);
    expect(
      transport.mock.calls.map((_, index) => deliveredEvents(transport, index).length),
    ).toEqual([2, 1]);
  });
});
