import { apiKeys, traces } from '@traceai/database';
import { type TraceEvent } from '@traceai/shared';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { PricingVersion, TraceCost } from '../services/pricing';

export const INGESTION_REQUESTS_PER_MINUTE = 120;
const TRACE_INSERT_CHUNK_SIZE = 5;

export interface IngestionPrincipal {
  id: string;
  projectId: string;
  keyHash: string;
  keySalt: string;
  revokedAt: string | null;
}

interface EventPricing extends PricingVersion {
  traceId: string;
}
export type PricedEvent = TraceEvent & TraceCost;

export async function findIngestionKey(
  database: D1Database,
  id: string,
): Promise<IngestionPrincipal | undefined> {
  const rows = await drizzle(database)
    .select({
      id: apiKeys.id,
      projectId: apiKeys.projectId,
      keyHash: apiKeys.keyHash,
      keySalt: apiKeys.keySalt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.id, id))
    .limit(1);
  return rows[0];
}

export async function countIngestionRequest(
  database: D1Database,
  keyId: string,
  now = Date.now(),
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const expiresAt = (Math.floor(now / 60_000) + 1) * 60_000;
  const counter = await database
    .prepare(
      `
    INSERT INTO rate_limits (key, count, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN rate_limits.expires_at <= ? THEN 1 ELSE rate_limits.count + 1 END,
      expires_at = CASE WHEN rate_limits.expires_at <= ? THEN excluded.expires_at ELSE rate_limits.expires_at END
    RETURNING count, expires_at AS expiresAt
  `,
    )
    .bind(`ingestion:${keyId}`, expiresAt, now, now)
    .first<{ count: number; expiresAt: number }>();
  if (!counter) throw new Error('Rate-limit storage did not return a counter');
  return {
    allowed: counter.count <= INGESTION_REQUESTS_PER_MINUTE,
    retryAfterSeconds: Math.max(1, Math.ceil((counter.expiresAt - now) / 1000)),
  };
}

export async function findEventPricing(
  database: D1Database,
  events: readonly TraceEvent[],
): Promise<ReadonlyMap<string, PricingVersion>> {
  // One JSON bind avoids a per-event query and the D1 100-bind statement limit.
  const requested = JSON.stringify(
    events.map(({ traceId, provider, model, startedAt }) => ({
      traceId,
      provider,
      model,
      startedAt,
    })),
  );
  const result = await database
    .prepare(
      `
    WITH requested AS (
      SELECT json_extract(value, '$.traceId') AS trace_id, json_extract(value, '$.provider') AS provider,
             json_extract(value, '$.model') AS model, json_extract(value, '$.startedAt') AS started_at
      FROM json_each(?)
    )
    SELECT requested.trace_id AS traceId, pricing.id,
           pricing.input_nano_usd_per_million AS inputNanoUsdPerMillion,
           pricing.output_nano_usd_per_million AS outputNanoUsdPerMillion,
           pricing.currency, pricing.simulated
    FROM requested JOIN model_pricing AS pricing ON pricing.id = (
      SELECT id FROM model_pricing
      WHERE provider = requested.provider AND model = requested.model AND simulated = 0 AND currency = 'USD'
        AND julianday(effective_from) <= julianday(requested.started_at)
        AND (effective_to IS NULL OR julianday(effective_to) > julianday(requested.started_at))
      ORDER BY julianday(effective_from) DESC, id DESC LIMIT 1
    )
  `,
    )
    .bind(requested)
    .all<EventPricing>();
  return new Map(
    result.results.map((row) => [row.traceId, { ...row, simulated: Boolean(row.simulated) }]),
  );
}

export async function insertTraceBatch(
  database: D1Database,
  principal: Pick<IngestionPrincipal, 'id' | 'projectId'>,
  events: readonly PricedEvent[],
): Promise<number> {
  const createdAt = new Date().toISOString();
  const rows = events.map((event) => traceRow(event, principal.projectId, createdAt));
  const statements = Array.from(
    { length: Math.ceil(rows.length / TRACE_INSERT_CHUNK_SIZE) },
    (_, index) => {
      const chunk = rows.slice(
        index * TRACE_INSERT_CHUNK_SIZE,
        (index + 1) * TRACE_INSERT_CHUNK_SIZE,
      );
      const query = drizzle(database)
        .insert(traces)
        .values(chunk)
        .onConflictDoNothing({ target: [traces.projectId, traces.traceId] })
        .toSQL();
      return database.prepare(query.sql).bind(...query.params);
    },
  );
  statements.push(
    database
      .prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?')
      .bind(createdAt, principal.id),
  );
  // D1 batch is one transaction: any statement failure rolls all inserted traces back.
  const result = await database.batch(statements);
  return result.slice(0, -1).reduce((total, statement) => total + statement.meta.changes, 0);
}

function traceRow(
  event: PricedEvent,
  projectId: string,
  createdAt: string,
): typeof traces.$inferInsert {
  return {
    id: crypto.randomUUID(),
    projectId,
    traceId: event.traceId,
    name: event.name,
    provider: event.provider,
    model: event.model,
    status: event.status,
    startedAt: new Date(event.startedAt).toISOString(),
    endedAt: new Date(event.endedAt).toISOString(),
    durationMs: event.durationMs,
    inputTokens: event.inputTokens ?? null,
    outputTokens: event.outputTokens ?? null,
    estimatedCostNanoUsd: event.estimatedCostNanoUsd,
    pricingVersion: event.pricingVersion,
    errorType: event.errorType ?? null,
    metadataJson: JSON.stringify(event.metadata ?? {}),
    createdAt,
  };
}
