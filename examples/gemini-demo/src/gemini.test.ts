import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GeminiDemoError,
  MAX_OUTPUT_TOKENS,
  MAX_RESPONSE_BYTES,
  REQUEST_TIMEOUT_MS,
  parseGeminiResponse,
  parseGeminiUsage,
  runGeminiDemo,
} from './gemini';

const environment = {
  GEMINI_API_KEY: 'gem-test',
  TRACEAI_API_KEY: 'trace-test',
  TRACEAI_ENDPOINT: 'https://telemetry.example',
  GEMINI_MODEL: 'gemini-test-model',
  GEMINI_FREE_TIER_CONFIRMED: '1',
};
const completeResponse = () => ({
  candidates: [{ content: { parts: [{ text: 'Unpublished model response text.' }] } }],
  modelVersion: 'gemini-test-model-001',
  usageMetadata: {
    promptTokenCount: 10,
    candidatesTokenCount: 15,
    thoughtsTokenCount: 5,
    totalTokenCount: 30,
  },
  privateProviderField: 'Unpublished provider private data.',
});
const stubDependencies = (response = completeResponse()) => {
  const batches: unknown[] = [];
  const providerFetch = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json(response));
  const telemetryFetch = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
    batches.push(JSON.parse(String(init?.body)) as unknown);
    return new Response(null, { status: 202 });
  });
  return { providerFetch, telemetryFetch, batches };
};
const realRun = async (dependencies: ReturnType<typeof stubDependencies>, count = 3) => {
  const summary = await runGeminiDemo(['--run', `--count=${count}`], environment, dependencies);
  if (summary.mode !== 'real') throw new Error('Expected an explicitly confirmed real run.');
  return summary;
};

afterEach(() => {
  vi.useRealTimers();
});

describe('Gemini usage boundary', () => {
  it('adds explicit candidate and thinking tokens without leaking other fields', () => {
    expect(
      parseGeminiUsage({ ...completeResponse().usageMetadata, private: 'not copied' }),
    ).toEqual({ inputTokens: 10, outputTokens: 20 });
  });
  it('uses documented total-minus-prompt when thinking field is absent, not an assumed zero', () => {
    expect(
      parseGeminiUsage({ promptTokenCount: 10, candidatesTokenCount: 15, totalTokenCount: 30 }),
    ).toEqual({ inputTokens: 10, outputTokens: 20 });
  });
  it('accepts complete explicit counts when total is absent', () => {
    expect(
      parseGeminiUsage({ promptTokenCount: 10, candidatesTokenCount: 15, thoughtsTokenCount: 5 }),
    ).toEqual({ inputTokens: 10, outputTokens: 20 });
  });
  it.each([
    undefined,
    {},
    { promptTokenCount: 10 },
    { candidatesTokenCount: 15 },
    { promptTokenCount: 10, candidatesTokenCount: 15 },
    { promptTokenCount: 10, totalTokenCount: 9 },
    { promptTokenCount: 10, candidatesTokenCount: 25, totalTokenCount: 30 },
    { promptTokenCount: 10, candidatesTokenCount: 15, thoughtsTokenCount: 4, totalTokenCount: 30 },
    { promptTokenCount: -1, totalTokenCount: 0 },
    { promptTokenCount: '10', totalTokenCount: 30 },
    { promptTokenCount: 0.5, totalTokenCount: 30 },
    { promptTokenCount: 10, totalTokenCount: 30, thoughtsTokenCount: null },
    { promptTokenCount: 10, totalTokenCount: 10_000_011 },
  ])('keeps incomplete or invalid usage unknown: %j', (value) => {
    expect(parseGeminiUsage(value)).toBeUndefined();
  });
  it('preserves genuine explicit zero usage', () => {
    expect(parseGeminiUsage({ promptTokenCount: 0, totalTokenCount: 0 })).toEqual({
      inputTokens: 0,
      outputTokens: 0,
    });
  });
  it('accepts unknown provider fields but returns only safe operational values', () => {
    expect(parseGeminiResponse(completeResponse())).toEqual({
      usage: { inputTokens: 10, outputTokens: 20 },
      actualModelVersion: 'gemini-test-model-001',
    });
  });
  it.each([
    'a private echo',
    'https://secret.example',
    'gemini-echo-gem-test',
    'gemini-' + 'a'.repeat(100),
  ])('does not echo invalid or credential-bearing modelVersion: %s', (modelVersion) => {
    expect(
      parseGeminiResponse({ ...completeResponse(), modelVersion }, [environment.GEMINI_API_KEY])
        .actualModelVersion,
    ).toBeUndefined();
  });
  it.each([null, [], {}, 'private provider body'])(
    'rejects malformed response envelopes: %j',
    (value) => {
      expect(() => parseGeminiResponse(value)).toThrow(GeminiDemoError);
    },
  );
});

describe('explicitly gated real-model example', () => {
  it('previews configuration with no network or client construction, even without keys', async () => {
    const dependencies = stubDependencies();
    const summary = await runGeminiDemo([], {}, dependencies);
    expect(summary).toMatchObject({ mode: 'preview', networkRequests: 0, limits: { calls: 3 } });
    expect(dependencies.providerFetch).not.toHaveBeenCalled();
    expect(dependencies.telemetryFetch).not.toHaveBeenCalled();
  });
  it('never prints even supplied keys in preview', async () => {
    const summary = await runGeminiDemo([], environment);
    expect(JSON.stringify(summary)).not.toContain(environment.GEMINI_API_KEY);
    expect(JSON.stringify(summary)).not.toContain(environment.TRACEAI_API_KEY);
  });
  it.each([
    { GEMINI_API_KEY: undefined },
    { TRACEAI_API_KEY: undefined },
    { GEMINI_MODEL: undefined },
    { GEMINI_MODEL: '../unsafe' },
    { GEMINI_FREE_TIER_CONFIRMED: undefined },
    { TRACEAI_ENDPOINT: 'http://telemetry.example' },
    { TRACEAI_ENDPOINT: 'https://user:password@telemetry.example' },
    { TRACEAI_ENDPOINT: 'https://telemetry.example?key=private' },
    { TRACEAI_ENDPOINT: 'https://telemetry.example/unexpected' },
    { GEMINI_API_KEY: 'private\nheader' },
  ])('fails safely before network for invalid config: %j', async (override) => {
    const dependencies = stubDependencies();
    await expect(
      runGeminiDemo(['--run'], { ...environment, ...override }, dependencies),
    ).rejects.toThrow(GeminiDemoError);
    expect(dependencies.providerFetch).not.toHaveBeenCalled();
    expect(dependencies.telemetryFetch).not.toHaveBeenCalled();
  });
  it.each([
    { args: ['--count=0'] },
    { args: ['--count=6'] },
    { args: ['--count=1.5'] },
    { args: ['--run', '--run'] },
    { args: ['--count=2', '--count=3'] },
    { args: ['--unknown'] },
  ])('rejects invalid flags without network: %j', async ({ args }) => {
    const dependencies = stubDependencies();
    await expect(runGeminiDemo(args, environment, dependencies)).rejects.toThrow(GeminiDemoError);
    expect(dependencies.providerFetch).not.toHaveBeenCalled();
  });
  it('makes 3 sequential real operations, SDK traces actual usage, and stores no content', async () => {
    const dependencies = stubDependencies();
    let active = 0;
    let peak = 0;
    dependencies.providerFetch.mockImplementation(async () => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return Response.json(completeResponse());
    });
    const summary = await realRun(dependencies);
    expect(peak).toBe(1);
    expect(summary).toMatchObject({
      attempted: 3,
      responses: 3,
      failures: 0,
      usageReported: 3,
      inputTokens: 30,
      outputTokensIncludingThinking: 60,
      persistence: 'not-read-back',
    });
    expect(summary.actualModelVersions).toEqual(['gemini-test-model-001']);
    expect(dependencies.batches).toHaveLength(1);
    const batch = dependencies.batches[0] as { events: Record<string, unknown>[] };
    expect(batch.events).toHaveLength(3);
    for (const event of batch.events)
      expect(event).toMatchObject({
        provider: 'google',
        model: environment.GEMINI_MODEL,
        status: 'success',
        inputTokens: 10,
        outputTokens: 20,
        metadata: { source: 'gemini-real-api', simulated: false },
      });
    const report = JSON.stringify([dependencies.batches, summary]);
    expect(report).not.toContain('Unpublished');
    expect(report).not.toContain('Explain');
    expect(report).not.toContain(environment.GEMINI_API_KEY);
    expect(report).not.toContain(environment.TRACEAI_API_KEY);
    for (const [url, init] of dependencies.providerFetch.mock.calls) {
      expect(url).toBe(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent',
      );
      expect(String(url)).not.toContain('?');
      expect(init?.headers).toMatchObject({ 'x-goog-api-key': environment.GEMINI_API_KEY });
      expect(init?.redirect).toBe('error');
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body.generationConfig).toEqual({
        candidateCount: 1,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      });
      expect(String(init?.body).length).toBeLessThan(512);
      expect(Object.keys(body)).toEqual(['contents', 'generationConfig']);
    }
  });
  it('caps total calls at 5 without retries or fabricated failures', async () => {
    const dependencies = stubDependencies();
    expect((await realRun(dependencies, 5)).responses).toBe(5);
    expect(dependencies.providerFetch).toHaveBeenCalledTimes(5);
  });
  it('keeps missing usage unknown in the real SDK events, not synthetic zero', async () => {
    const dependencies = stubDependencies({
      ...completeResponse(),
      usageMetadata: {},
    } as ReturnType<typeof completeResponse>);
    const summary = await realRun(dependencies, 1);
    expect(summary).toMatchObject({
      responses: 1,
      usageUnknown: 1,
      usageReported: 0,
      inputTokens: null,
      outputTokensIncludingThinking: null,
    });
    const batch = dependencies.batches[0] as { events: Record<string, unknown>[] };
    expect(batch.events[0]).not.toHaveProperty('inputTokens');
    expect(batch.events[0]).not.toHaveProperty('outputTokens');
  });
  it.each([400, 401, 402, 403, 404, 429, 500])(
    'stops on the first HTTP %i and never reads provider error bodies',
    async (status) => {
      const dependencies = stubDependencies();
      const response = new Response('private key and billing error body', { status });
      const readBody = vi.spyOn(response, 'text');
      dependencies.providerFetch.mockResolvedValue(response);
      const summary = await realRun(dependencies);
      expect(summary).toMatchObject({
        attempted: 1,
        responses: 0,
        failures: 1,
        stoppedBecause: { code: 'provider_http', status },
      });
      expect(dependencies.providerFetch).toHaveBeenCalledTimes(1);
      expect(readBody).not.toHaveBeenCalled();
      expect(JSON.stringify([summary, dependencies.batches])).not.toContain('private');
      const batch = dependencies.batches[0] as { events: Record<string, unknown>[] };
      expect(batch.events[0]).toMatchObject({
        status: 'error',
        errorType: status === 429 ? 'rate_limit' : 'application',
      });
      expect(batch.events[0]).not.toHaveProperty('errorSummary');
    },
  );
  it('contains thrown network errors instead of exposing their messages or keys', async () => {
    const dependencies = stubDependencies();
    dependencies.providerFetch.mockRejectedValue(new Error('private provider key exception'));
    const summary = await realRun(dependencies);
    expect(summary.stoppedBecause).toEqual({ code: 'provider_network' });
    expect(dependencies.providerFetch).toHaveBeenCalledTimes(1);
    expect(JSON.stringify([summary, dependencies.batches])).not.toContain('private');
  });
  it('enforces a 30-second deadline even when a provider fetch ignores abort', async () => {
    vi.useFakeTimers();
    const dependencies = stubDependencies();
    dependencies.providerFetch.mockImplementation(() => new Promise(() => undefined));
    const running = realRun(dependencies);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    const summary = await running;
    expect(summary.stoppedBecause).toEqual({ code: 'provider_timeout' });
    expect(dependencies.providerFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(dependencies.providerFetch).toHaveBeenCalledTimes(1);
  });
  it('enforces the same deadline while reading a stalled provider response body', async () => {
    vi.useFakeTimers();
    const dependencies = stubDependencies();
    const cancelBody = vi.fn();
    dependencies.providerFetch.mockResolvedValue(
      new Response(new ReadableStream({ cancel: cancelBody })),
    );
    const running = realRun(dependencies);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect((await running).stoppedBecause).toEqual({ code: 'provider_timeout' });
    expect(cancelBody).toHaveBeenCalledOnce();
  });
  it('cancels a response arriving after the deadline without reading or exporting it', async () => {
    vi.useFakeTimers();
    const dependencies = stubDependencies();
    let finishFetch!: (response: Response) => void;
    dependencies.providerFetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishFetch = resolve;
        }),
    );
    const running = realRun(dependencies);
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS);
    expect((await running).stoppedBecause).toEqual({ code: 'provider_timeout' });
    const response = Response.json(completeResponse());
    const cancelBody = vi.spyOn(response.body!, 'cancel');
    finishFetch(response);
    await Promise.resolve();
    expect(cancelBody).toHaveBeenCalledOnce();
  });
  it('treats invalid JSON as an invalid response, without exposing the body', async () => {
    const dependencies = stubDependencies();
    dependencies.providerFetch.mockResolvedValue(new Response('private malformed JSON'));
    const summary = await realRun(dependencies);
    expect(summary.stoppedBecause).toEqual({ code: 'invalid_response' });
    expect(JSON.stringify([summary, dependencies.batches])).not.toContain('private');
  });
  it('bounds response bytes and never forwards an oversized provider payload', async () => {
    const dependencies = stubDependencies();
    dependencies.providerFetch.mockResolvedValue(new Response('a'.repeat(MAX_RESPONSE_BYTES + 1)));
    const summary = await realRun(dependencies);
    expect(summary.stoppedBecause).toEqual({ code: 'invalid_response' });
    expect(dependencies.providerFetch).toHaveBeenCalledTimes(1);
  });
  it('separates model success from failed SDK transport without claiming persistence', async () => {
    const dependencies = stubDependencies();
    dependencies.telemetryFetch.mockResolvedValue(new Response(null, { status: 401 }));
    const summary = await realRun(dependencies);
    expect(summary).toMatchObject({
      responses: 3,
      failures: 0,
      telemetry: { failedEvents: 3 },
      persistence: 'not-read-back',
    });
    expect(dependencies.providerFetch).toHaveBeenCalledTimes(3);
    expect(dependencies.telemetryFetch).toHaveBeenCalledTimes(1);
  });
  it('does not execute the CLI merely by importing it', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await import('./index');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
