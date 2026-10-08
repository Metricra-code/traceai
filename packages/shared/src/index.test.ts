import { describe, expect, it } from 'vitest';
import { estimateCostNanoUsd, percentile, traceEventSchema } from './index';
describe('shared contracts', () => {
  it('calculates nearest-rank percentiles deterministically', () => {
    expect(percentile([], 0.95)).toBe(0);
    expect(percentile([1, 2, 3, 4, 5], 0.95)).toBe(5);
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2);
  });
  it('calculates exact integer money', () => {
    expect(
      estimateCostNanoUsd(
        { inputTokens: 1_000_000, outputTokens: 500_000 },
        { inputNanoUsdPerMillion: '3000000000', outputNanoUsdPerMillion: '15000000000' },
      ),
    ).toBe('10500000000');
  });
  it('rejects negative token counts', () => {
    expect(
      traceEventSchema.safeParse({
        traceId: 'test',
        name: 'test',
        provider: 'mock',
        model: 'mock',
        status: 'success',
        startedAt: '2026-10-09T00:00:00Z',
        endedAt: '2026-10-09T00:00:01Z',
        durationMs: 1000,
        inputTokens: -1,
      }).success,
    ).toBe(false);
  });
});
