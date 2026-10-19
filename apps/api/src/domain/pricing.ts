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
