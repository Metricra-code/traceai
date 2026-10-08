import { estimateCostNanoUsd, type TraceEvent } from '@traceai/shared';
export const DEMO_PROJECT_ID = 'demo';
export const DEMO_ANCHOR = '2026-10-09T00:00:00.000Z';
export interface DemoModel {
  provider: string;
  model: string;
  baseLatencyMs: number;
  inputNanoUsdPerMillion: string;
  outputNanoUsdPerMillion: string;
}
// Fictional models and prices. NEVER use this registry for real ingestion pricing.
export const DEMO_MODELS: readonly DemoModel[] = [
  {
    provider: 'openai',
    model: 'demo-reasoning',
    baseLatencyMs: 1600,
    inputNanoUsdPerMillion: '2500000000',
    outputNanoUsdPerMillion: '10000000000',
  },
  {
    provider: 'anthropic',
    model: 'demo-balanced',
    baseLatencyMs: 1100,
    inputNanoUsdPerMillion: '3000000000',
    outputNanoUsdPerMillion: '15000000000',
  },
  {
    provider: 'gemini',
    model: 'demo-fast',
    baseLatencyMs: 320,
    inputNanoUsdPerMillion: '150000000',
    outputNanoUsdPerMillion: '600000000',
  },
  {
    provider: 'local',
    model: 'demo-local',
    baseLatencyMs: 750,
    inputNanoUsdPerMillion: '0',
    outputNanoUsdPerMillion: '0',
  },
  {
    provider: 'unknown',
    model: 'demo-unpriced',
    baseLatencyMs: 940,
    inputNanoUsdPerMillion: '0',
    outputNanoUsdPerMillion: '0',
  },
];
const random = (index: number, salt: number): number => {
  const seed = Math.imul(index + 1, 0x45d9f3b) ^ Math.imul(salt, 0x27d4eb2d);
  return (Math.imul(seed ^ (seed >>> 16), 0x45d9f3b) >>> 0) / 0x100000000;
};
export interface DemoTrace {
  event: TraceEvent;
  estimatedCostNanoUsd: string | null;
  pricingVersion: string | null;
}
export const createDemoTrace = (index: number, anchor: string = DEMO_ANCHOR): DemoTrace => {
  const model = DEMO_MODELS[index % DEMO_MODELS.length]!;
  const failed = random(index, 1) < 0.065;
  const durationMs = Math.round(
    model.baseLatencyMs * (0.35 + Math.pow(random(index, 2), 2) * 4) +
      (random(index, 3) > 0.98 ? 7000 : 0),
  );
  const startedMs =
    Date.parse(anchor) - 30 * 86_400_000 + Math.floor((index / 10_000) * 30 * 86_400_000);
  const inputTokens = 120 + Math.floor(Math.pow(random(index, 4), 2) * 6000);
  const outputTokens = failed ? 0 : 30 + Math.floor(random(index, 5) * 1800);
  const categories = ['timeout', 'rate_limit', 'network', 'application'] as const;
  const operations = [
    'chat-completion',
    'document-summary',
    'classify-ticket',
    'extract-entities',
  ] as const;
  const event: TraceEvent = {
    traceId: `demo_${index.toString().padStart(5, '0')}`,
    name: operations[index % operations.length]!,
    provider: model.provider,
    model: model.model,
    status: failed ? 'error' : 'success',
    startedAt: new Date(startedMs).toISOString(),
    endedAt: new Date(startedMs + durationMs).toISOString(),
    durationMs,
    inputTokens,
    outputTokens,
    ...(failed ? { errorType: categories[index % categories.length]! } : {}),
    metadata: {
      simulated: true,
      feature: operations[index % operations.length]!,
      region: index % 2 ? 'us-east' : 'eu-west',
    },
  };
  return {
    event,
    estimatedCostNanoUsd:
      model.provider === 'unknown'
        ? null
        : estimateCostNanoUsd({ inputTokens, outputTokens }, model),
    pricingVersion: model.provider === 'unknown' ? null : `demo-pricing-${model.provider}`,
  };
};
export const createDemoTraces = (anchor: string = DEMO_ANCHOR): DemoTrace[] =>
  Array.from({ length: 10_000 }, (_, index) => createDemoTrace(index, anchor));
