import { afterEach, describe, expect, it, vi } from 'vitest';
import { TraceAI, type CompletedTrace, type TraceAIConfig } from './index';

const options = { name: 'chat', provider: 'example', model: 'model-v1' };
const event: CompletedTrace = {
  ...options,
  traceId: 'external_span_01',
  startedAt: '2026-10-09T00:00:00.000Z',
  endedAt: '2026-10-09T00:00:00.010Z',
  durationMs: 10,
  status: 'success',
};
const clients: TraceAI[] = [];
const createClient = (config: Partial<TraceAIConfig> = {}) => {
  const fetch = vi
    .fn<typeof globalThis.fetch>()
    .mockResolvedValue(new Response('{}', { status: 202 }));
  const client = new TraceAI({
    apiKey: 'test-only',
    endpoint: 'http://localhost:8787',
    fetch,
    ...config,
  });
  clients.push(client);
  return { client, fetch };
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const firstEvent = (fetch: ReturnType<typeof vi.fn<typeof globalThis.fetch>>) =>
  (JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) as { events: CompletedTrace[] }).events[0];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.shutdown()));
  vi.restoreAllMocks();
});

describe('explicit error summary', () => {
  it('calls only the opt-in callback on failure, sanitizes it, and preserves rejection identity', async () => {
    const { client, fetch } = createClient();
    const failure = new Error('raw-secret-never-read');
    const errorSummary = vi.fn(() => 'Safe category; api_key=private-value email user@example.com');
    await client.trace({ ...options, errorSummary }, async () => 42);
    expect(errorSummary).not.toHaveBeenCalled();
    await expect(
      client.trace({ ...options, errorSummary }, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    await client.flush();
    expect(errorSummary).toHaveBeenCalledExactlyOnceWith(failure);
    const body = String(fetch.mock.calls[0]?.[1]?.body);
    expect(body).toContain('api_key=[redacted]');
    expect(body).toContain('[redacted-email]');
    expect(body).not.toContain('raw-secret');
    expect(body).not.toContain('private-value');
  });
  it.each(['throw', 'getter', 'oversized', 'non-string', 'async-reject'])(
    'keeps failure identity for hostile %s summary',
    async (mode) => {
      const { client, fetch } = createClient();
      const failure = Object.freeze({ private: 'hidden' });
      const traceOptions = { ...options, errorSummary: () => 'x'.repeat(1001) };
      if (mode === 'throw')
        traceOptions.errorSummary = () => {
          throw new Error('callback-secret');
        };
      if (mode === 'getter')
        Object.defineProperty(traceOptions, 'errorSummary', {
          get() {
            throw new Error('getter-secret');
          },
        });
      if (mode === 'non-string')
        traceOptions.errorSummary = (() => ({ secret: 'hidden' })) as unknown as () => string;
      if (mode === 'async-reject')
        traceOptions.errorSummary = (async () => {
          throw new Error('callback-secret');
        }) as unknown as () => string;
      await expect(
        client.trace(traceOptions, async () => {
          throw failure;
        }),
      ).rejects.toBe(failure);
      await client.flush();
      expect(firstEvent(fetch)).toMatchObject({ status: 'error', errorType: 'unknown' });
      expect(firstEvent(fetch)).not.toHaveProperty('errorSummary');
      expect(String(fetch.mock.calls[0]?.[1]?.body)).not.toContain('secret');
    },
  );
});

describe('completed-event delivery receipts', () => {
  it('snapshots external events, retains real timestamps, and acknowledges only after HTTP acceptance', async () => {
    const response = deferred<Response>();
    const transport = vi.fn(() => response.promise);
    const { client } = createClient({ fetch: transport });
    const input = { ...event, metadata: { deployment: 'before' } };
    const receipt = client.record(input);
    input.metadata.deployment = 'after';
    const settled = vi.fn();
    void receipt.then(settled);
    const draining = client.flush();
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    response.resolve(new Response('{}', { status: 202 }));
    await draining;
    expect(await receipt).toEqual({ status: 'delivered' });
    expect(firstEvent(transport)).toMatchObject({ ...event, metadata: { deployment: 'before' } });
  });
  it('returns permanent delivery failure instead of conflating best-effort flush with success', async () => {
    const { client } = createClient({
      fetch: vi.fn().mockResolvedValue(new Response('{}', { status: 401 })),
    });
    const receipt = client.record(event);
    await expect(client.flush()).resolves.toBeUndefined();
    expect(await receipt).toEqual({ status: 'dropped', reason: 'delivery_failed' });
  });
  it('counts in-flight receipts in the queue bound and settles every receipt', async () => {
    const response = deferred<Response>();
    const { client } = createClient({
      batchSize: 1,
      maxQueueSize: 1,
      fetch: vi.fn(() => response.promise),
    });
    const first = client.record(event);
    const draining = client.flush();
    const overflow = client.record({ ...event, traceId: 'overflow' });
    expect(await overflow).toEqual({ status: 'dropped', reason: 'queue_full' });
    response.resolve(new Response('{}', { status: 202 }));
    await draining;
    expect(await first).toEqual({ status: 'delivered' });
  });
  it.each(['invalid', 'disabled', 'closed'])(
    'settles %s external telemetry without throwing',
    async (mode) => {
      const { client } = createClient({ enabled: mode !== 'disabled' });
      if (mode === 'closed') await client.shutdown();
      const input = mode === 'invalid' ? { ...event, durationMs: -1 } : event;
      expect(await client.record(input)).toEqual({
        status: 'dropped',
        reason:
          mode === 'invalid' ? 'invalid_event' : mode === 'closed' ? 'client_closed' : 'disabled',
      });
    },
  );
  it('sanitizes explicit external summaries, rejects raw extra error messages and mismatched status', async () => {
    const { client, fetch } = createClient();
    const receipt = client.record({
      ...event,
      status: 'error',
      errorSummary: 'authorization: Bearer confidential',
    });
    await client.flush();
    expect(await receipt).toEqual({ status: 'delivered' });
    expect(firstEvent(fetch)?.errorSummary).toContain('[redacted]');
    expect(await client.record({ ...event, errorSummary: 'safe' })).toMatchObject({
      reason: 'invalid_event',
    });
    expect(await client.record({ ...event, errorMessage: 'raw' } as CompletedTrace)).toMatchObject({
      reason: 'invalid_event',
    });
  });
});

describe('active-operation barrier', () => {
  it('drains 10,000 concurrently active callbacks deterministically with bounded telemetry', async () => {
    const gate = deferred<void>();
    const { client, fetch } = createClient({ maxQueueSize: 50, batchSize: 50 });
    const operations = Array.from({ length: 10_000 }, (_, index) =>
      client.trace(options, async () => {
        await gate.promise;
        return index;
      }),
    );
    const shutdown = client.shutdown();
    expect(client.shutdown()).toBe(shutdown);
    gate.resolve();
    expect(await Promise.all(operations)).toEqual(
      Array.from({ length: 10_000 }, (_, index) => index),
    );
    await shutdown;
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      (JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) as { events: unknown[] }).events,
    ).toHaveLength(50);
  });
});
