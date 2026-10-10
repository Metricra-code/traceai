import { describe, expect, it } from 'vitest';
import { MAX_TRACE_CURSOR_CHARS } from '@traceai/shared';
import {
  analyticsHref,
  readNavigation,
  navigationParams,
  recordNextPage,
  paginationState,
  type CursorHistory,
} from './navigation';

const window = {
  from: '2026-01-01T00:00:00.000Z',
  to: '2026-01-08T00:00:00.000Z',
  range: '7' as const,
};

describe('bounded analytics URL state', () => {
  it('roundtrips exact window and filters without arbitrary URL fields', () => {
    const result = readNavigation(
      new URLSearchParams(
        'provider=%20openai%20&status=error&sort=oldest&cursor=opaque&returnTo=https%3A%2F%2Fevil.test',
      ),
      window,
    );
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('Expected valid navigation');
    const params = navigationParams(result.state);
    expect(params.get('provider')).toBe('openai');
    expect(params.get('from')).toBe(window.from);
    expect(params.has('returnTo')).toBe(false);
    expect(analyticsHref('/demo/traces', result.state)).toBe(`/demo/traces?${params}`);
    expect(readNavigation(params, window)).toEqual(result);
  });

  it.each([
    'from=invalid&to=2026-01-08T00:00:00Z',
    'from=2026-01-01T00:00:00Z',
    'from=2026-01-01T00:00:00Z&to=2026-02-02T00:00:00Z',
    'status=other',
    'sort=other',
    'provider=a&provider=b',
    'cursor=%2F%2Fevil',
    'traceId=bad%2Fid',
  ])('rejects invalid or ambiguous boundary values: %s', (search) => {
    expect(readNavigation(new URLSearchParams(search), window).success).toBe(false);
  });

  it('accepts the shared API cursor maximum but no larger value', () => {
    expect(
      readNavigation(new URLSearchParams({ cursor: 'a'.repeat(MAX_TRACE_CURSOR_CHARS) }), window)
        .success,
    ).toBe(true);
    expect(
      readNavigation(
        new URLSearchParams({ cursor: 'a'.repeat(MAX_TRACE_CURSOR_CHARS + 1) }),
        window,
      ).success,
    ).toBe(false);
  });

  it('normalizes UTC dates and treats inconsistent preset hints as custom', () => {
    const result = readNavigation(
      new URLSearchParams('from=2026-01-01T00:00:00Z&to=2026-01-02T00:00:00Z&range=7'),
      window,
    );
    expect(result.success && result.state).toMatchObject({
      from: window.from,
      to: '2026-01-02T00:00:00.000Z',
      range: 'custom',
    });
  });
});

describe('bounded in-memory pagination history', () => {
  it('preserves a known predecessor and truthful page label across scoped navigation', () => {
    const history = recordNextPage([], 'project-a:window', '', 'second');
    expect(paginationState(history, 'project-a:window', 'second')).toEqual({
      page: 2,
      previous: '',
    });
    expect(paginationState(history, 'project-b:window', 'second')).toEqual({});
    expect(paginationState([], 'project-a:window', 'second')).toEqual({});
    expect(paginationState([], 'project-a:window', '')).toEqual({ page: 1 });
  });

  it('keeps memory bounded without imposing a navigation limit', () => {
    let history: CursorHistory = [];
    for (let index = 0; index < 100; index++)
      history = recordNextPage(
        history,
        'scope',
        index ? `cursor-${index}` : '',
        `cursor-${index + 1}`,
      );
    expect(history[0]?.pages.length).toBeLessThanOrEqual(40);
    expect(paginationState(history, 'scope', 'cursor-100')).toEqual({
      page: 101,
      previous: 'cursor-99',
    });
    for (let index = 0; index < 10; index++)
      history = recordNextPage(history, `other-${index}`, '', 'second');
    expect(history).toHaveLength(4);
  });

  it('does not invent an absolute page number for an unknown shared cursor', () => {
    const history = recordNextPage([], 'scope', 'shared', 'next');
    expect(paginationState(history, 'scope', 'next')).toEqual({ previous: 'shared' });
  });
});
