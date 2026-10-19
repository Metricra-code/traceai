import { describe, expect, it } from 'vitest';
import {
  createShowcaseResponse,
  parseShowcaseQuery,
  recordedCallSchema,
  recordedSnapshotSchema,
  ShowcaseQueryError,
  type RecordedCall,
} from './model';

// Deliberately synthetic unit fixtures; these are not the public recorded dataset.
const calls: readonly RecordedCall[] = [
  { model: 'model-a', durationMs: 400, inputTokens: 10, outputTokens: 20, status: 'success' },
  { model: 'model-b', durationMs: 100, inputTokens: 5, outputTokens: 8, status: 'error' },
  { model: 'model-a', durationMs: 200, inputTokens: 7, outputTokens: 12, status: 'success' },
];

describe('recorded showcase privacy boundary', () => {
  it('accepts only the approved operational fields, including unknown usage', () => {
    expect(
      recordedCallSchema.parse({ ...calls[0], inputTokens: null, outputTokens: null }),
    ).toEqual({
      ...calls[0],
      inputTokens: null,
      outputTokens: null,
    });
  });

  it.each([
    'prompt',
    'output',
    'projectId',
    'traceId',
    'apiKey',
    'metadata',
    'errorSummary',
    'startedAt',
    'createdAt',
  ])('rejects an extra private %s field rather than copying it', (field) => {
    expect(recordedCallSchema.safeParse({ ...calls[0], [field]: 'PRIVATE_CANARY' }).success).toBe(
      false,
    );
  });

  it.each([
    { durationMs: -1 },
    { durationMs: Infinity },
    { durationMs: 86_400_001 },
    { inputTokens: 1.5 },
    { outputTokens: -1 },
    { inputTokens: 10_000_001 },
    { model: '' },
    { status: 'pending' },
  ])('rejects invalid operational measurements %j', (change) => {
    expect(recordedCallSchema.safeParse({ ...calls[0], ...change }).success).toBe(false);
  });

  it('validates the fixed three-call snapshot without generating replacement records', () => {
    expect(recordedSnapshotSchema.parse(calls)).toEqual(calls);
    expect(recordedSnapshotSchema.safeParse(calls.slice(0, 2)).success).toBe(false);
    expect(recordedSnapshotSchema.safeParse([...calls, calls[0]]).success).toBe(false);
  });

  it('never projects extra input properties into public rows', () => {
    const contaminated = [{ ...calls[0]!, prompt: 'PRIVATE_CANARY' }, calls[1]!, calls[2]!];
    expect(() =>
      createShowcaseResponse(contaminated, parseShowcaseQuery(new URLSearchParams())),
    ).toThrow();
  });
});

describe('bounded server-side showcase filters', () => {
  it('defaults to the original public sample order', () => {
    expect(parseShowcaseQuery(new URLSearchParams())).toEqual({ sort: 'recorded' });
  });

  it.each([
    'model=model-a&model=model-b',
    'projectId=private-project',
    'traceId=private-trace',
    'cursor=private-cursor',
    'from=2026-10-11T00:00:00.000Z',
    'status=pending',
    'sort=newest',
    'model=',
    `model=${'a'.repeat(121)}`,
  ])('rejects unsupported or duplicate parameters: %s', (search) => {
    expect(() => parseShowcaseQuery(new URLSearchParams(search))).toThrow(ShowcaseQueryError);
  });

  it('filters exact model and status, preserving canonical public sample numbers', () => {
    const response = createShowcaseResponse(
      calls,
      parseShowcaseQuery(new URLSearchParams('model=model-a&status=success&sort=latency-asc')),
    );
    expect(
      response.items.map(({ sampleNumber, durationMs }) => ({ sampleNumber, durationMs })),
    ).toEqual([
      { sampleNumber: 3, durationMs: 200 },
      { sampleNumber: 1, durationMs: 400 },
    ]);
    expect(response.summary.totalRequests).toBe(2);
    expect(response.models.map(({ model }) => model)).toEqual(['model-a']);
  });

  it('sorts by measured latency without mutating the recorded input', () => {
    const response = createShowcaseResponse(
      calls,
      parseShowcaseQuery(new URLSearchParams('sort=latency-desc')),
    );
    expect(response.items.map(({ sampleNumber }) => sampleNumber)).toEqual([1, 3, 2]);
    expect(calls.map(({ durationMs }) => durationMs)).toEqual([400, 100, 200]);
  });

  it('returns a genuinely empty matching set, not a simulated fallback or zero-ms percentile', () => {
    const response = createShowcaseResponse(
      calls,
      parseShowcaseQuery(new URLSearchParams('model=not-recorded')),
    );
    expect(response).toMatchObject({
      source: 'recorded-real',
      snapshot: true,
      totalSamples: 3,
      items: [],
      models: [],
      summary: {
        totalRequests: 0,
        averageLatencyMs: null,
        p50LatencyMs: null,
        p95LatencyMs: null,
        inputTokens: 0,
        outputTokens: 0,
      },
    });
  });
});

describe('recorded sample statistics', () => {
  it('uses actual measurements and nearest-rank percentiles, including the small sample maximum', () => {
    const response = createShowcaseResponse(calls, parseShowcaseQuery(new URLSearchParams()));
    expect(response.summary).toEqual({
      totalRequests: 3,
      successfulRequests: 2,
      failedRequests: 1,
      averageLatencyMs: 700 / 3,
      p50LatencyMs: 200,
      p95LatencyMs: 400,
      inputTokens: 22,
      outputTokens: 40,
    });
    expect(response.models).toEqual([
      {
        model: 'model-a',
        totalRequests: 2,
        successfulRequests: 2,
        failedRequests: 0,
        averageLatencyMs: 300,
        p50LatencyMs: 200,
        p95LatencyMs: 400,
        inputTokens: 17,
        outputTokens: 32,
      },
      {
        model: 'model-b',
        totalRequests: 1,
        successfulRequests: 0,
        failedRequests: 1,
        averageLatencyMs: 100,
        p50LatencyMs: 100,
        p95LatencyMs: 100,
        inputTokens: 5,
        outputTokens: 8,
      },
    ]);
  });

  it('keeps missing token subtotals unknown instead of silently treating them as zero', () => {
    const unknown = [{ ...calls[0]!, inputTokens: null }, calls[1]!, calls[2]!];
    const response = createShowcaseResponse(unknown, parseShowcaseQuery(new URLSearchParams()));
    expect(response.summary.inputTokens).toBeNull();
    expect(response.summary.outputTokens).toBe(40);
    expect(response.models.find(({ model }) => model === 'model-a')?.inputTokens).toBeNull();
  });
});
