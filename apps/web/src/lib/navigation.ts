import { z } from 'zod';
import { MAX_TRACE_CURSOR_CHARS, MAX_WINDOW_MS } from '@traceai/shared';

const timestamp = z.iso.datetime().transform((value) => new Date(value).toISOString());
const navigationSchema = z.object({
  from: timestamp.optional(),
  to: timestamp.optional(),
  range: z.enum(['1', '7', '30', 'custom']).optional(),
  provider: z.string().trim().max(120).default(''),
  model: z.string().trim().max(120).default(''),
  status: z.enum(['', 'success', 'error']).default(''),
  traceId: z
    .string()
    .max(128)
    .regex(/^[a-zA-Z0-9_-]*$/)
    .default(''),
  sort: z.enum(['newest', 'oldest']).default('newest'),
  cursor: z
    .string()
    .max(MAX_TRACE_CURSOR_CHARS)
    .regex(/^[a-zA-Z0-9_-]*$/)
    .default(''),
});
const navigationKeys = Object.keys(navigationSchema.shape);
export type DateRange = '1' | '7' | '30' | 'custom';
export interface NavigationState {
  from: string;
  to: string;
  range: DateRange;
  provider: string;
  model: string;
  status: '' | 'success' | 'error';
  traceId: string;
  sort: 'newest' | 'oldest';
  cursor: string;
}
export type TraceFilters = Pick<
  NavigationState,
  'provider' | 'model' | 'status' | 'traceId' | 'sort'
>;
export type NavigationWindow = Pick<NavigationState, 'from' | 'to' | 'range'>;

export function readNavigation(
  parameters: URLSearchParams,
  fallback: NavigationWindow,
): { success: true; state: NavigationState } | { success: false } {
  if (navigationKeys.some((key) => parameters.getAll(key).length > 1)) return { success: false };
  const fields = Object.fromEntries(
    navigationKeys.filter((key) => parameters.has(key)).map((key) => [key, parameters.get(key)]),
  );
  const parsed = navigationSchema.safeParse(fields);
  if (!parsed.success || (parsed.data.from === undefined) !== (parsed.data.to === undefined))
    return { success: false };
  const from = parsed.data.from ?? fallback.from;
  const to = parsed.data.to ?? fallback.to;
  const duration = Date.parse(to) - Date.parse(from);
  if (duration <= 0 || duration > MAX_WINDOW_MS) return { success: false };
  const requestedRange = parsed.data.range ?? (parsed.data.from ? 'custom' : fallback.range);
  const range =
    requestedRange !== 'custom' && duration !== Number(requestedRange) * 86_400_000
      ? 'custom'
      : requestedRange;
  return { success: true, state: { ...parsed.data, from, to, range } };
}

export function navigationParams(state: NavigationState): URLSearchParams {
  return new URLSearchParams(
    (navigationKeys as (keyof NavigationState)[])
      .map((key) => [key, state[key]] as [string, string])
      .filter(([, value]) => value !== ''),
  );
}

export function analyticsHref(path: string, state: NavigationState): string {
  return `${path}?${navigationParams(state)}`;
}

interface CursorPage {
  cursor: string;
  previous?: string;
  page?: number;
}
export type CursorHistory = readonly { scope: string; pages: readonly CursorPage[] }[];

export function paginationState(
  history: CursorHistory,
  scope: string,
  cursor: string,
): Omit<CursorPage, 'cursor'> {
  if (!cursor) return { page: 1 };
  const record = history
    .find((item) => item.scope === scope)
    ?.pages.find((item) => item.cursor === cursor);
  return record
    ? {
        ...(record.previous !== undefined ? { previous: record.previous } : {}),
        ...(record.page !== undefined ? { page: record.page } : {}),
      }
    : {};
}

export function recordNextPage(
  history: CursorHistory,
  scope: string,
  current: string,
  next: string,
): CursorHistory {
  const currentPage = paginationState(history, scope, current).page;
  const pages = history.find((item) => item.scope === scope)?.pages ?? [];
  const record = {
    cursor: next,
    previous: current,
    ...(currentPage !== undefined ? { page: currentPage + 1 } : {}),
  };
  return [
    ...history.filter((item) => item.scope !== scope),
    { scope, pages: [...pages.filter((item) => item.cursor !== next), record].slice(-40) },
  ].slice(-4);
}
