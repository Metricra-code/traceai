import type { QueryFilters } from '@traceai/shared';

export interface CursorPosition {
  startedAt: string;
  traceId: string;
}

export interface TraceQuery extends QueryFilters {
  limit: number;
  sort: 'newest' | 'oldest';
  position?: CursorPosition;
}
