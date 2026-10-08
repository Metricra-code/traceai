import { describe, expect, it } from 'vitest';
import { estimateTraceCost } from './pricing';

const pricing = {
  id: 'verified-version',
  inputNanoUsdPerMillion: '3000000000',
  outputNanoUsdPerMillion: '15000000000',
  simulated: false,
  currency: 'USD',
};
describe('real trace pricing', () => {
  it('uses integer arithmetic and one half-up rounding operation', () => {
    expect(estimateTraceCost({ inputTokens: 1_000_000, outputTokens: 500_000 }, pricing)).toEqual({
      estimatedCostNanoUsd: 10_500_000_000,
      pricingVersion: 'verified-version',
    });
    expect(
      estimateTraceCost(
        { inputTokens: 1, outputTokens: 1 },
        { ...pricing, inputNanoUsdPerMillion: '250000', outputNanoUsdPerMillion: '250000' },
      ).estimatedCostNanoUsd,
    ).toBe(1);
  });
  it('does not infer missing usage, unknown pricing, or simulated costs', () => {
    expect(estimateTraceCost({ inputTokens: 20 }, pricing).estimatedCostNanoUsd).toBeNull();
    expect(
      estimateTraceCost({ inputTokens: 20, outputTokens: 30 }, undefined).estimatedCostNanoUsd,
    ).toBeNull();
    expect(
      estimateTraceCost({ inputTokens: 20, outputTokens: 30 }, { ...pricing, simulated: true })
        .estimatedCostNanoUsd,
    ).toBeNull();
  });
  it('rejects invalid rates and estimates outside JavaScript safe integer range', () => {
    expect(
      estimateTraceCost(
        { inputTokens: 10_000_000, outputTokens: 10_000_000 },
        { ...pricing, inputNanoUsdPerMillion: '99999999999999999999' },
      ).estimatedCostNanoUsd,
    ).toBeNull();
    expect(
      estimateTraceCost(
        { inputTokens: 1, outputTokens: 1 },
        { ...pricing, inputNanoUsdPerMillion: '-1' },
      ).estimatedCostNanoUsd,
    ).toBeNull();
  });
});
