import { percentile } from '@traceai/shared';
import { z } from 'zod';

const tokenCount = z.number().int().min(0).max(10_000_000).nullable();
export const recordedCallSchema = z
  .object({
    model: z.string().min(1).max(120),
    durationMs: z.number().finite().min(0).max(86_400_000),
    inputTokens: tokenCount,
    outputTokens: tokenCount,
    status: z.enum(['success', 'error']),
  })
  .strict();
export const recordedSnapshotSchema = z.array(recordedCallSchema).length(3);
export type RecordedCall = z.infer<typeof recordedCallSchema>;
export type RecordedSample = RecordedCall & { sampleNumber: number };

const querySchema = z
  .object({
    model: z.string().trim().min(1).max(120).optional(),
    status: z.enum(['success', 'error']).optional(),
    sort: z.enum(['recorded', 'latency-asc', 'latency-desc']).default('recorded'),
  })
  .strict();
export type ShowcaseQuery = z.infer<typeof querySchema>;
export type ShowcaseSort = ShowcaseQuery['sort'];

export interface ShowcaseSummary {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatencyMs: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
}
export interface ShowcaseResponse {
  source: 'recorded-real';
  snapshot: true;
  totalSamples: 3;
  items: RecordedSample[];
  summary: ShowcaseSummary;
  models: (ShowcaseSummary & { model: string })[];
}

export class ShowcaseQueryError extends Error {
  constructor() {
    super('Use an exact model, success/error status and a supported latency sort.');
  }
}

export function parseShowcaseQuery(parameters: URLSearchParams): ShowcaseQuery {
  const entries = [...parameters.entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw new ShowcaseQueryError();
  const parsed = querySchema.safeParse(Object.fromEntries(entries));
  if (!parsed.success) throw new ShowcaseQueryError();
  return parsed.data;
}

function tokenSubtotal(rows: readonly RecordedCall[], field: 'inputTokens' | 'outputTokens') {
  if (rows.some((row) => row[field] === null)) return null;
  return rows.reduce((total, row) => total + (row[field] ?? 0), 0);
}

function summarize(rows: readonly RecordedCall[]): ShowcaseSummary {
  const latencies = rows
    .map(({ durationMs }) => durationMs)
    .sort((first, second) => first - second);
  const failedRequests = rows.filter(({ status }) => status === 'error').length;
  return {
    totalRequests: rows.length,
    successfulRequests: rows.length - failedRequests,
    failedRequests,
    averageLatencyMs: rows.length
      ? latencies.reduce((total, latency) => total + latency, 0) / rows.length
      : null,
    p50LatencyMs: rows.length ? percentile(latencies, 0.5) : null,
    p95LatencyMs: rows.length ? percentile(latencies, 0.95) : null,
    inputTokens: tokenSubtotal(rows, 'inputTokens'),
    outputTokens: tokenSubtotal(rows, 'outputTokens'),
  };
}

function compareModels(rows: readonly RecordedCall[]): ShowcaseResponse['models'] {
  const models = new Map<string, RecordedCall[]>();
  for (const row of rows) models.set(row.model, [...(models.get(row.model) ?? []), row]);
  return [...models.entries()]
    .map(([model, samples]) => ({ model, ...summarize(samples) }))
    .sort((first, second) => first.model.localeCompare(second.model));
}

export function createShowcaseResponse(
  calls: readonly RecordedCall[],
  query: ShowcaseQuery,
): ShowcaseResponse {
  const samples = recordedSnapshotSchema.parse(calls).map((call, index) => ({
    ...call,
    // A public ordinal is derived from this curated snapshot, never a private trace identifier.
    sampleNumber: index + 1,
  }));
  const matching = samples.filter(
    ({ model, status }) =>
      (query.model === undefined || model === query.model) &&
      (query.status === undefined || status === query.status),
  );
  const direction = query.sort === 'latency-desc' ? -1 : 1;
  const items =
    query.sort === 'recorded'
      ? matching
      : [...matching].sort(
          (first, second) =>
            direction * (first.durationMs - second.durationMs) ||
            first.sampleNumber - second.sampleNumber,
        );
  return {
    source: 'recorded-real',
    snapshot: true,
    totalSamples: 3,
    items,
    summary: summarize(matching),
    models: compareModels(matching),
  };
}
