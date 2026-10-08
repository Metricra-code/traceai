import { z } from 'zod';
export const MAX_BATCH_SIZE = 50;
export const MAX_PAYLOAD_BYTES = 256 * 1024;
export const MAX_METADATA_BYTES = 8 * 1024;
export const MAX_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;
const label = z.string().trim().min(1).max(120);
const timestamp = z.iso.datetime();
const tokenCount = z.number().int().min(0).max(10_000_000);
export const usageSchema = z.object({ inputTokens: tokenCount, outputTokens: tokenCount }).strict();
export const metadataSchema = z
  .record(
    z.string().max(100),
    z.union([z.string().max(2000), z.number().finite(), z.boolean(), z.null()]),
  )
  .refine(
    (value) => new TextEncoder().encode(JSON.stringify(value)).length <= MAX_METADATA_BYTES,
    'Metadata exceeds 8 KiB',
  );
export const traceEventSchema = z
  .object({
    traceId: z
      .string()
      .min(1)
      .max(128)
      .regex(/^[a-zA-Z0-9_-]+$/),
    name: label,
    provider: label,
    model: label,
    status: z.enum(['success', 'error']),
    startedAt: timestamp,
    endedAt: timestamp,
    durationMs: z.number().finite().min(0).max(86_400_000),
    inputTokens: tokenCount.optional(),
    outputTokens: tokenCount.optional(),
    errorType: z.enum(['timeout', 'rate_limit', 'network', 'application', 'unknown']).optional(),
    metadata: metadataSchema.optional(),
  })
  .strict()
  .refine((event) => Date.parse(event.endedAt) >= Date.parse(event.startedAt), {
    message: 'End timestamp must not precede start',
  });
export const batchSchema = z
  .object({ events: z.array(traceEventSchema).min(1).max(MAX_BATCH_SIZE) })
  .strict();
export type TraceEvent = z.infer<typeof traceEventSchema>;
export type Usage = z.infer<typeof usageSchema>;
export type TraceMetadata = z.infer<typeof metadataSchema>;
export const projectSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).default(''),
  })
  .strict();
export const credentialsSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((value) => value.toLowerCase()),
    password: z.string().min(12).max(128),
  })
  .strict();

export interface Trace extends TraceEvent {
  projectId: string;
  estimatedCostNanoUsd: string | null;
  pricingVersion: string | null;
  createdAt: string;
}
export interface Overview {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;
  averageLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostNanoUsd: string | null;
  pricedRequests: number;
  unpricedRequests: number;
}
export interface MetricBucket extends Overview {
  timestamp: string;
}
export interface ModelComparison extends Overview {
  provider: string;
  model: string;
}
export interface TracePage {
  items: Trace[];
  nextCursor: string | null;
}
export interface Project {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}
export interface ApiKey {
  id: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}
export interface QueryFilters {
  from: string;
  to: string;
  provider?: string;
  model?: string;
  status?: 'success' | 'error';
  traceId?: string;
  limit?: number;
  cursor?: string;
  sort?: 'newest' | 'oldest';
}
export const percentile = (sortedValues: readonly number[], percentileValue: number): number => {
  if (!sortedValues.length) return 0;
  // Nearest-rank: rank = ceil(p * n), one-based; stable for ties and singleton sets.
  return sortedValues[Math.max(0, Math.ceil(percentileValue * sortedValues.length) - 1)] ?? 0;
};
export const estimateCostNanoUsd = (
  usage: Usage,
  pricing: { inputNanoUsdPerMillion: string; outputNanoUsdPerMillion: string },
): string => {
  const numerator =
    BigInt(usage.inputTokens) * BigInt(pricing.inputNanoUsdPerMillion) +
    BigInt(usage.outputTokens) * BigInt(pricing.outputNanoUsdPerMillion);
  // Round half up ONCE after adding input and output costs. Never use floats for money.
  return ((numerator + 500_000n) / 1_000_000n).toString();
};
