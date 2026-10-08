import { describe, expect, it } from 'vitest';
import { calculateOverview, calculateMetrics, compareModels } from './analytics';
import type { AnalyticsRow } from '../repositories/analytics';

const row = (overrides: Partial<AnalyticsRow> = {}): AnalyticsRow => ({
  startedAt: '2026-10-09T00:15:00.000Z',
  provider: 'example',
  model: 'model-a',
  status: 'success',
  durationMs: 10,
  inputTokens: 100,
  outputTokens: 20,
  estimatedCostNanoUsd: '9007199254740991',
  ...overrides,
});

describe('bounded analytics calculations', () => {
  it('uses nearest rank percentiles, exact integer cost and preserves input order', () => {
    const rows = Object.freeze(
      Array.from({ length: 20 }, (_, index) =>
        Object.freeze(
          row({
            durationMs: 20 - index,
            status: index === 0 ? 'error' : 'success',
          }),
        ),
      ),
    );
    expect(calculateOverview(rows)).toEqual({
      totalRequests: 20,
      successfulRequests: 19,
      failedRequests: 1,
      errorRate: 0.05,
      averageLatencyMs: 10.5,
      p50LatencyMs: 10,
      p95LatencyMs: 19,
      p99LatencyMs: 20,
      inputTokens: 2000,
      outputTokens: 400,
      estimatedCostNanoUsd: '180143985094819820',
      knownEstimatedCostNanoUsd: '180143985094819820',
      pricedRequests: 20,
      unpricedRequests: 0,
    });
    expect(rows[0]?.durationMs).toBe(20);
  });
  it('never presents incomplete pricing as a total cost of zero', () => {
    expect(
      calculateOverview([row({ estimatedCostNanoUsd: '0' }), row({ estimatedCostNanoUsd: null })]),
    ).toMatchObject({ estimatedCostNanoUsd: null, pricedRequests: 1, unpricedRequests: 1 });
  });
  it('reports only the known subtotal for mixed pricing without pretending it is the grand total', () => {
    expect(
      calculateOverview([
        row({ estimatedCostNanoUsd: '9007199254740991' }),
        row({ estimatedCostNanoUsd: '2' }),
        row({ estimatedCostNanoUsd: null }),
      ]),
    ).toMatchObject({
      estimatedCostNanoUsd: null,
      knownEstimatedCostNanoUsd: '9007199254740993',
      pricedRequests: 2,
      unpricedRequests: 1,
    });
  });
  it('does not fake a known zero subtotal when every request is unpriced', () => {
    expect(calculateOverview([row({ estimatedCostNanoUsd: null })])).toMatchObject({
      estimatedCostNanoUsd: null,
      knownEstimatedCostNanoUsd: null,
      pricedRequests: 0,
      unpricedRequests: 1,
    });
    expect(calculateOverview([row({ estimatedCostNanoUsd: '0' })])).toMatchObject({
      estimatedCostNanoUsd: '0',
      knownEstimatedCostNanoUsd: '0',
      pricedRequests: 1,
    });
  });
  it('returns a defined zero overview for no events and singleton percentiles', () => {
    expect(calculateOverview([])).toMatchObject({
      totalRequests: 0,
      p95LatencyMs: 0,
      estimatedCostNanoUsd: '0',
      knownEstimatedCostNanoUsd: '0',
    });
    expect(calculateOverview([row()])).toMatchObject({
      p50LatencyMs: 10,
      p95LatencyMs: 10,
      p99LatencyMs: 10,
    });
  });
  it('zero fills UTC hourly buckets including partially covered edges', () => {
    const result = calculateMetrics([row(), row({ startedAt: '2026-10-09T02:45:00.000Z' })], {
      from: '2026-10-09T00:10:00.000Z',
      to: '2026-10-09T03:10:00.000Z',
    });
    expect(result.bucket).toBe('hour');
    expect(result.items.map((bucket) => [bucket.timestamp, bucket.totalRequests])).toEqual([
      ['2026-10-09T00:00:00.000Z', 1],
      ['2026-10-09T01:00:00.000Z', 0],
      ['2026-10-09T02:00:00.000Z', 1],
      ['2026-10-09T03:00:00.000Z', 0],
    ]);
  });
  it('uses daily buckets on a long bounded range, never thousands of hourly points', () => {
    const result = calculateMetrics([], {
      from: '2026-09-09T00:00:00.000Z',
      to: '2026-10-09T00:00:00.000Z',
    });
    expect(result.bucket).toBe('day');
    expect(result.items).toHaveLength(30);
  });
  it('compares operational model metrics independently by provider and model', () => {
    expect(
      compareModels([
        row(),
        row({ provider: 'other', durationMs: 100, estimatedCostNanoUsd: null }),
      ]),
    ).toMatchObject([
      { provider: 'example', model: 'model-a', totalRequests: 1, p95LatencyMs: 10 },
      {
        provider: 'other',
        model: 'model-a',
        totalRequests: 1,
        p95LatencyMs: 100,
        estimatedCostNanoUsd: null,
      },
    ]);
  });
});
