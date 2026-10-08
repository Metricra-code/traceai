import { estimateCostNanoUsd, type TraceEvent } from '@traceai/shared';

export interface PricingVersion {
  id: string;
  inputNanoUsdPerMillion: string;
  outputNanoUsdPerMillion: string;
  simulated: boolean;
  currency: string;
}

export interface TraceCost {
  estimatedCostNanoUsd: number | null;
  pricingVersion: string | null;
}

const unknownCost: TraceCost = { estimatedCostNanoUsd: null, pricingVersion: null };

export function estimateTraceCost(
  usage: Pick<TraceEvent, 'inputTokens' | 'outputTokens'>,
  pricing?: PricingVersion,
): TraceCost {
  if (
    usage.inputTokens === undefined ||
    usage.outputTokens === undefined ||
    !isUsablePricing(pricing)
  )
    return { ...unknownCost };
  const estimate = BigInt(
    estimateCostNanoUsd(
      { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
      pricing,
    ),
  );
  if (estimate > BigInt(Number.MAX_SAFE_INTEGER)) return { ...unknownCost };
  return { estimatedCostNanoUsd: Number(estimate), pricingVersion: pricing.id };
}

function isUsablePricing(pricing: PricingVersion | undefined): pricing is PricingVersion {
  return (
    !!pricing &&
    !pricing.simulated &&
    pricing.currency === 'USD' &&
    /^\d{1,20}$/.test(pricing.inputNanoUsdPerMillion) &&
    /^\d{1,20}$/.test(pricing.outputNanoUsdPerMillion)
  );
}
