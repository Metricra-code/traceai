import { MAX_TRACE_CURSOR_CHARS, MAX_WINDOW_MS, type QueryFilters } from '@traceai/shared';
import { z } from 'zod';
import { RequestError } from './http-errors';

const utcTimestamp = z.iso.datetime().transform((value) => new Date(value).toISOString());
const traceId = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);
const filterFields = {
  from: utcTimestamp.optional(),
  to: utcTimestamp.optional(),
  provider: z.string().trim().min(1).max(120).optional(),
  model: z.string().trim().min(1).max(120).optional(),
  status: z.enum(['success', 'error']).optional(),
  traceId: traceId.optional(),
};
const aggregateSchema = z.object(filterFields).strict();
const listSchema = aggregateSchema
  .extend({
    limit: z
      .string()
      .regex(/^\d{1,3}$/)
      .transform(Number)
      .pipe(z.number().int().min(1).max(100))
      .optional(),
    sort: z.enum(['newest', 'oldest']).optional(),
    cursor: z
      .string()
      .min(1)
      .max(MAX_TRACE_CURSOR_CHARS)
      .regex(/^[a-zA-Z0-9_-]+$/)
      .optional(),
  })
  .strict();
const scopeSchema = z
  .object({
    projectId: z.string().min(1).max(128),
    ...filterFields,
    from: utcTimestamp,
    to: utcTimestamp,
    sort: z.enum(['newest', 'oldest']),
  })
  .strict();
const cursorSchema = z
  .object({
    version: z.literal(1),
    scope: scopeSchema,
    position: z.object({ startedAt: utcTimestamp, traceId }).strict(),
  })
  .strict();

interface QueryDefaults {
  projectId: string;
  defaultTo: string;
}
export interface CursorPosition {
  startedAt: string;
  traceId: string;
}
export interface TraceQuery extends QueryFilters {
  limit: number;
  sort: 'newest' | 'oldest';
  position?: CursorPosition;
}

const invalidQuery = () =>
  new RequestError(
    400,
    'invalid_query',
    'Use valid UTC dates, filters, and pagination parameters. The date window must be at most 31 days.',
  );
const invalidCursor = () =>
  new RequestError(
    400,
    'invalid_cursor',
    'The pagination cursor does not match these filters. Reset pagination and try again.',
  );

function uniqueParameters(parameters: URLSearchParams): Record<string, string> {
  const entries = [...parameters.entries()];
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw invalidQuery();
  return Object.fromEntries(entries);
}

function resolveRange(filters: z.infer<typeof aggregateSchema>, defaultTo: string): QueryFilters {
  if ((filters.from === undefined) !== (filters.to === undefined)) throw invalidQuery();
  const to = filters.to ?? new Date(defaultTo).toISOString();
  const from = filters.from ?? new Date(Date.parse(to) - 86_400_000).toISOString();
  const duration = Date.parse(to) - Date.parse(from);
  if (duration <= 0 || duration > MAX_WINDOW_MS) throw invalidQuery();
  return { ...filters, from, to };
}

export function parseAggregateQuery(
  parameters: URLSearchParams,
  defaults: QueryDefaults,
): QueryFilters {
  const parsed = aggregateSchema.safeParse(uniqueParameters(parameters));
  if (!parsed.success) throw invalidQuery();
  return resolveRange(parsed.data, defaults.defaultTo);
}

function decodeCursor(encoded: string): z.infer<typeof cursorSchema> {
  try {
    const binary = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    );
    return cursorSchema.parse(JSON.parse(decoded));
  } catch {
    throw invalidCursor();
  }
}

function cursorScope(query: QueryFilters, projectId: string) {
  return scopeSchema.parse({
    projectId,
    from: query.from,
    to: query.to,
    provider: query.provider,
    model: query.model,
    status: query.status,
    traceId: query.traceId,
    sort: query.sort ?? 'newest',
  });
}

export function parseTraceQuery(parameters: URLSearchParams, defaults: QueryDefaults): TraceQuery {
  const parsed = listSchema.safeParse(uniqueParameters(parameters));
  if (!parsed.success) throw invalidQuery();
  const { limit, sort, cursor, ...filters } = parsed.data;
  const decoded = cursor === undefined ? undefined : decodeCursor(cursor);
  const implicitRange =
    filters.from === undefined && filters.to === undefined && decoded !== undefined
      ? { ...filters, from: decoded.scope.from, to: decoded.scope.to }
      : filters;
  const query = {
    ...resolveRange(implicitRange, defaults.defaultTo),
    limit: limit ?? 50,
    sort: sort ?? 'newest',
  };
  if (!decoded) return query;
  if (JSON.stringify(decoded.scope) !== JSON.stringify(cursorScope(query, defaults.projectId)))
    throw invalidCursor();
  if (decoded.position.startedAt < query.from || decoded.position.startedAt >= query.to)
    throw invalidCursor();
  return { ...query, position: decoded.position };
}

export function encodeTraceCursor(
  query: QueryFilters,
  projectId: string,
  position: CursorPosition,
): string {
  const serialized = JSON.stringify({ version: 1, scope: cursorScope(query, projectId), position });
  const binary = Array.from(new TextEncoder().encode(serialized), (byte) =>
    String.fromCharCode(byte),
  ).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function parseTraceId(value: string): string {
  const parsed = traceId.safeParse(value);
  if (!parsed.success) throw invalidQuery();
  return parsed.data;
}
