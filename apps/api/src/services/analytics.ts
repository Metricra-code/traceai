import {
  percentile,
  type Overview,
  type MetricBucket,
  type ModelComparison,
  type QueryFilters,
  type TracePage,
} from '@traceai/shared';
import {
  ANALYTICS_ROW_LIMIT,
  DEMO_PROJECT_ID,
  readAnalyticsRows,
  readDemoProject,
  readTrace,
  readTracePage,
  type AnalyticsRow,
} from '../repositories/analytics';
import { encodeTraceCursor, type TraceQuery } from './analytics-query';
import { RequestError } from './http-errors';

export function calculateOverview(rows: readonly AnalyticsRow[]): Overview {
  const failedRequests = rows.filter((row) => row.status === 'error').length;
  const priced = rows.filter((row) => row.estimatedCostNanoUsd !== null);
  const knownCost = priced
    .reduce((total, row) => total + BigInt(row.estimatedCostNanoUsd!), 0n)
    .toString();
  const latencies = rows.map((row) => row.durationMs).sort((first, second) => first - second);
  return {
    totalRequests: rows.length,
    successfulRequests: rows.length - failedRequests,
    failedRequests,
    errorRate: rows.length ? failedRequests / rows.length : 0,
    averageLatencyMs: rows.length
      ? latencies.reduce((total, latency) => total + latency, 0) / rows.length
      : 0,
    p50LatencyMs: percentile(latencies, 0.5),
    p95LatencyMs: percentile(latencies, 0.95),
    p99LatencyMs: percentile(latencies, 0.99),
    inputTokens: rows.reduce((total, row) => total + (row.inputTokens ?? 0), 0),
    outputTokens: rows.reduce((total, row) => total + (row.outputTokens ?? 0), 0),
    // A sum of the known portion is not the total cost when any request is unpriced.
    estimatedCostNanoUsd: priced.length === rows.length ? knownCost : null,
    knownEstimatedCostNanoUsd: priced.length > 0 || rows.length === 0 ? knownCost : null,
    pricedRequests: priced.length,
    unpricedRequests: rows.length - priced.length,
  };
}

function groupRows<Key>(
  rows: readonly AnalyticsRow[],
  keyFor: (row: AnalyticsRow) => Key,
): Map<Key, AnalyticsRow[]> {
  const groups = new Map<Key, AnalyticsRow[]>();
  for (const row of rows) {
    const key = keyFor(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  return groups;
}

export function calculateMetrics(
  rows: readonly AnalyticsRow[],
  query: Pick<QueryFilters, 'from' | 'to'>,
): { items: MetricBucket[]; bucket: 'hour' | 'day' } {
  const duration = Date.parse(query.to) - Date.parse(query.from);
  const bucket = duration <= 7 * 86_400_000 ? 'hour' : 'day';
  const interval = bucket === 'hour' ? 3_600_000 : 86_400_000;
  const from = Math.floor(Date.parse(query.from) / interval) * interval;
  const count = Math.ceil((Date.parse(query.to) - from) / interval);
  const groups = groupRows(
    rows,
    (row) => Math.floor(Date.parse(row.startedAt) / interval) * interval,
  );
  const items = Array.from({ length: count }, (_, index) => {
    const timestamp = from + index * interval;
    return {
      timestamp: new Date(timestamp).toISOString(),
      ...calculateOverview(groups.get(timestamp) ?? []),
    };
  });
  return { items, bucket };
}

export function compareModels(rows: readonly AnalyticsRow[]): ModelComparison[] {
  const grouped = groupRows(rows, (row) => JSON.stringify([row.provider, row.model]));
  return [...grouped.values()]
    .map((group) => ({
      provider: group[0]!.provider,
      model: group[0]!.model,
      ...calculateOverview(group),
    }))
    .sort(
      (first, second) =>
        second.totalRequests - first.totalRequests ||
        first.provider.localeCompare(second.provider) ||
        first.model.localeCompare(second.model),
    );
}

async function boundedRows(
  database: D1Database,
  projectId: string,
  query: QueryFilters,
): Promise<AnalyticsRow[]> {
  const rows = await readAnalyticsRows(database, projectId, query);
  if (rows.length > ANALYTICS_ROW_LIMIT)
    throw new RequestError(
      422,
      'analytics_window_too_large',
      'This window contains more than 20,000 requests. Narrow the date range or add filters.',
    );
  return rows;
}

export async function getOverview(
  database: D1Database,
  projectId: string,
  query: QueryFilters,
): Promise<Overview> {
  return calculateOverview(await boundedRows(database, projectId, query));
}
export async function getMetrics(database: D1Database, projectId: string, query: QueryFilters) {
  return calculateMetrics(await boundedRows(database, projectId, query), query);
}
export async function getModels(database: D1Database, projectId: string, query: QueryFilters) {
  return { items: compareModels(await boundedRows(database, projectId, query)) };
}
export async function getTraces(
  database: D1Database,
  projectId: string,
  query: TraceQuery,
): Promise<TracePage> {
  const rows = await readTracePage(database, projectId, query);
  const items = rows.slice(0, query.limit);
  const last = items.at(-1);
  const nextCursor =
    rows.length > query.limit && last
      ? encodeTraceCursor(query, projectId, { startedAt: last.startedAt, traceId: last.traceId })
      : null;
  return { items, nextCursor };
}
export async function getTrace(database: D1Database, projectId: string, traceId: string) {
  const trace = await readTrace(database, projectId, traceId);
  if (!trace) throw new RequestError(404, 'trace_not_found', 'The requested trace was not found.');
  return trace;
}
export async function getDemo(database: D1Database) {
  const demo = await readDemoProject(database);
  if (!demo) throw new RequestError(404, 'demo_not_available', 'Demo data is not available.');
  const { anchor, ...project } = demo;
  return { project, anchor: anchor ?? project.updatedAt, simulated: true as const };
}
export const publicDemoProjectId = DEMO_PROJECT_ID;
