import { batchSchema, sanitizeErrorSummary } from '@traceai/shared';
import {
  countIngestionRequest,
  findEventPricing,
  findIngestionKey,
  insertTraceBatch,
  type IngestionPrincipal,
} from '../repositories/ingestion';
import { parseIngestionKey, verifyIngestionSecret } from './api-keys';
import { readBoundedJson } from './bounded-json';
import { RequestError } from './http-errors';
import { estimateTraceCost } from './pricing';

export async function authenticateIngestion(
  database: D1Database,
  authorization: string | undefined,
): Promise<IngestionPrincipal> {
  const parsed = authorization?.startsWith('Bearer ')
    ? parseIngestionKey(authorization.slice(7))
    : undefined;
  if (!parsed) throw unauthorized();
  const principal = await findIngestionKey(database, parsed.id);
  if (!principal || principal.revokedAt || !(await verifyIngestionSecret(parsed.secret, principal)))
    throw unauthorized();
  return principal;
}

export async function ingestBatch(
  database: D1Database,
  principal: IngestionPrincipal,
  request: Request,
): Promise<{ accepted: number; duplicates: number }> {
  const parsed = batchSchema.safeParse(await readBoundedJson(request));
  if (!parsed.success)
    throw new RequestError(
      400,
      'invalid_batch',
      'Every event must satisfy the trace schema; the batch must contain 1–50 events.',
    );
  // Indexed analytics and pricing must see the same fixed-millisecond UTC representation.
  const normalizedEvents = parsed.data.events.map((event) => ({
    ...event,
    startedAt: new Date(event.startedAt).toISOString(),
    endedAt: new Date(event.endedAt).toISOString(),
    errorSummary:
      event.errorSummary === undefined ? undefined : sanitizeErrorSummary(event.errorSummary),
  }));
  const uniqueEvents = normalizedEvents.filter(
    (event, index, all) =>
      all.findIndex((candidate) => candidate.traceId === event.traceId) === index,
  );
  const prices = await findEventPricing(database, uniqueEvents);
  const events = uniqueEvents.map((event) => ({
    ...event,
    ...estimateTraceCost(event, prices.get(event.traceId)),
  }));
  const accepted = await insertTraceBatch(database, principal, events);
  return { accepted, duplicates: parsed.data.events.length - accepted };
}

export async function enforceIngestionRate(database: D1Database, keyId: string): Promise<void> {
  const result = await countIngestionRequest(database, keyId);
  if (!result.allowed) throw new IngestionRateError(result.retryAfterSeconds);
}

export class IngestionRateError extends RequestError {
  constructor(readonly retryAfterSeconds: number) {
    super(429, 'rate_limited', 'The ingestion rate limit has been reached.');
  }
}

function unauthorized(): RequestError {
  return new RequestError(401, 'unauthorized', 'A valid ingestion API key is required.');
}
