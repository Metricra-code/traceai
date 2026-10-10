import { z } from 'zod';
import { errorSummarySchema } from './error-summary';
export {
  ERROR_CAPTURE_POLICY,
  MAX_ERROR_SUMMARY_CHARS,
  MAX_ERROR_SUMMARY_BYTES,
  errorSummarySchema,
  sanitizeErrorSummary,
} from './error-summary';
export const MAX_BATCH_SIZE = 50;
export const MAX_PAYLOAD_BYTES = 256 * 1024;
export const MAX_METADATA_BYTES = 8 * 1024;
export const MAX_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;
// Canonical v1 JSON: 157 structural bytes + 6*(128+2*120) escaped project/provider/model
// + 3*24 UTC timestamps + 2*128 ASCII trace IDs + 7 status + 6 sort = 2,706 bytes.
// Unpadded base64url needs ceil(4*bytes/3) characters; this also bounds decoding work.
export const MAX_TRACE_CURSOR_CHARS = Math.ceil((2_706 * 4) / 3);
const label = z.string().trim().min(1).max(120);
const timestamp = z.iso.datetime();
const utcTimestampParts = (value: string) => {
  const [whole, fraction = ''] = value.slice(0, -1).split('.');
  return { second: Date.parse(`${whole}Z`), fraction };
};
const timestampsOrdered = (startedAt: string, endedAt: string): boolean => {
  const start = utcTimestampParts(startedAt);
  const end = utcTimestampParts(endedAt);
  if (start.second !== end.second) return start.second < end.second;
  // Date.parse truncates sub-millisecond digits; compare exact decimal fractions before normalization.
  const precision = Math.max(start.fraction.length, end.fraction.length);
  return start.fraction.padEnd(precision, '0') <= end.fraction.padEnd(precision, '0');
};
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
    errorSummary: errorSummarySchema.optional(),
    metadata: metadataSchema.optional(),
  })
  .strict()
  .refine((event) => timestampsOrdered(event.startedAt, event.endedAt), {
    message: 'End timestamp must not precede start',
  })
  .refine((event) => event.errorSummary === undefined || event.status === 'error', {
    message: 'An explicit error summary is only permitted on failed operations',
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
  pricing?: PricingProvenance;
}
export interface PricingProvenance {
  version: string;
  provider: string;
  model: string;
  currency: string;
  inputNanoUsdPerMillion: string;
  outputNanoUsdPerMillion: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceUrl: string;
  simulated: boolean;
  verifiedAt: string | null;
  billingBasis: string | null;
}
export const pricingProvenanceSchema = z
  .object({
    version: z.string().min(1).max(120),
    provider: label,
    model: label,
    currency: z.string().min(1).max(10),
    inputNanoUsdPerMillion: z.string().regex(/^\d{1,20}$/),
    outputNanoUsdPerMillion: z.string().regex(/^\d{1,20}$/),
    effectiveFrom: timestamp,
    effectiveTo: timestamp.nullable(),
    sourceUrl: z
      .url()
      .max(2048)
      .refine((value) => {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password;
      }),
    simulated: z.boolean(),
    verifiedAt: timestamp.nullable(),
    billingBasis: z.string().max(100).nullable(),
  })
  .strict();
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
  /** Sum of priced requests only, never a complete total if unpricedRequests > 0. */
  knownEstimatedCostNanoUsd: string | null;
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
