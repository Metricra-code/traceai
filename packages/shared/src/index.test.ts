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
  it.each([
    ['2026-10-09T00:00:00.123456789Z', '2026-10-09T00:00:00.123456788Z', false],
    ['2026-10-09T00:00:00.123456788Z', '2026-10-09T00:00:00.123456789Z', true],
    ['2026-10-09T00:00:00.9Z', '2026-10-09T00:00:00.10Z', false],
    ['2026-10-09T00:00:00.1Z', '2026-10-09T00:00:00.100000000Z', true],
    ['2026-10-09T00:00:00.999999999Z', '2026-10-09T00:00:01Z', true],
    ['2026-10-09T00:00:00Z', '2026-10-09T00:00:00.000000001Z', true],
  ])('validates exact UTC fractional ordering from %s to %s', (startedAt, endedAt, valid) => {
    expect(
      traceEventSchema.safeParse({
        traceId: 'fractional-test',
        name: 'fractional-test',
        provider: 'mock',
        model: 'mock',
        status: 'success',
        startedAt,
        endedAt,
        durationMs: 0,
      }).success,
    ).toBe(valid);
  });
});
