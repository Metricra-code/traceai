import {
  metadataSchema,
  type Project,
  type QueryFilters,
  type Trace,
  type TraceMetadata,
} from '@traceai/shared';
import type { TraceQuery } from '../services/analytics-query';

export const ANALYTICS_ROW_LIMIT = 20_000;
export const DEMO_PROJECT_ID = 'demo';
export interface AnalyticsRow {
  startedAt: string;
  provider: string;
  model: string;
  status: 'success' | 'error';
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostNanoUsd: string | null;
}
interface TraceRow extends AnalyticsRow {
  projectId: string;
  traceId: string;
  name: string;
  endedAt: string;
  pricingVersion: string | null;
  errorType: Trace['errorType'] | null;
  metadataJson: string;
  createdAt: string;
}
interface DemoRow extends Project {
  anchor: string | null;
}

function indexedFilters(projectId: string, query: QueryFilters) {
  const conditions = ['project_id = ?', 'started_at >= ?', 'started_at < ?'];
  const bindings: (string | number)[] = [projectId, query.from, query.to];
  const optional = [
    ['provider', query.provider],
    ['model', query.model],
    ['status', query.status],
    ['trace_id', query.traceId],
  ] as const;
  for (const [column, value] of optional) {
    if (value !== undefined) {
      conditions.push(`${column} = ?`);
      bindings.push(value);
    }
  }
  return { sql: conditions.join(' AND '), bindings };
}

export async function readAnalyticsRows(
  database: D1Database,
  projectId: string,
  query: QueryFilters,
): Promise<AnalyticsRow[]> {
  const filter = indexedFilters(projectId, query);
  const result = await database
    .prepare(
      `
    SELECT started_at AS startedAt, provider, model, status, duration_ms AS durationMs,
      input_tokens AS inputTokens, output_tokens AS outputTokens,
      CAST(estimated_cost_nano_usd AS TEXT) AS estimatedCostNanoUsd
    FROM traces WHERE ${filter.sql} LIMIT ?
  `,
    )
    .bind(...filter.bindings, ANALYTICS_ROW_LIMIT + 1)
    .all<AnalyticsRow>();
  // Deliberately narrow projection: do not materialize 20,001 copies of 8KiB metadata.
  return result.results;
}

const traceProjection = `project_id AS projectId, trace_id AS traceId, name, provider, model, status,
  started_at AS startedAt, ended_at AS endedAt, duration_ms AS durationMs,
  input_tokens AS inputTokens, output_tokens AS outputTokens,
  CAST(estimated_cost_nano_usd AS TEXT) AS estimatedCostNanoUsd, pricing_version AS pricingVersion,
  error_type AS errorType, metadata_json AS metadataJson, created_at AS createdAt`;

function mapTrace(row: TraceRow): Trace {
  const metadata: TraceMetadata = metadataSchema.parse(JSON.parse(row.metadataJson));
  return {
    projectId: row.projectId,
    traceId: row.traceId,
    name: row.name,
    provider: row.provider,
    model: row.model,
    status: row.status,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
    durationMs: row.durationMs,
    ...(row.inputTokens === null ? {} : { inputTokens: row.inputTokens }),
    ...(row.outputTokens === null ? {} : { outputTokens: row.outputTokens }),
    estimatedCostNanoUsd: row.estimatedCostNanoUsd,
    pricingVersion: row.pricingVersion,
    ...(row.errorType === null ? {} : { errorType: row.errorType }),
    metadata,
    createdAt: row.createdAt,
  };
}

export async function readTracePage(
  database: D1Database,
  projectId: string,
  query: TraceQuery,
): Promise<Trace[]> {
  const filter = indexedFilters(projectId, query);
  const direction = query.sort === 'oldest' ? 'ASC' : 'DESC';
  const comparison = query.sort === 'oldest' ? '>' : '<';
  const cursor = query.position ? ` AND (started_at, trace_id) ${comparison} (?, ?)` : '';
  const bindings = [
    ...filter.bindings,
    ...(query.position ? [query.position.startedAt, query.position.traceId] : []),
    query.limit + 1,
  ];
  const result = await database
    .prepare(
      `SELECT ${traceProjection} FROM traces WHERE ${filter.sql}${cursor}
    ORDER BY started_at ${direction}, trace_id ${direction} LIMIT ?`,
    )
    .bind(...bindings)
    .all<TraceRow>();
  return result.results.map(mapTrace);
}

export async function readTrace(
  database: D1Database,
  projectId: string,
  traceId: string,
): Promise<Trace | undefined> {
  const row = await database
    .prepare(`SELECT ${traceProjection} FROM traces WHERE project_id = ? AND trace_id = ? LIMIT 1`)
    .bind(projectId, traceId)
    .first<TraceRow>();
  // Raw error_message is never selected or returned, including legacy database rows.
  return row === null ? undefined : mapTrace(row);
}

export async function readDemoProject(database: D1Database): Promise<DemoRow | undefined> {
  const row = await database
    .prepare(
      `SELECT id, name, description, created_at AS createdAt, updated_at AS updatedAt,
    (SELECT MAX(started_at) FROM traces WHERE project_id = projects.id) AS anchor
    FROM projects WHERE id = ? LIMIT 1`,
    )
    .bind(DEMO_PROJECT_ID)
    .first<DemoRow>();
  return row ?? undefined;
}
