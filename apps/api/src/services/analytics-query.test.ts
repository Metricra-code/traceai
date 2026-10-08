import { describe, expect, it } from 'vitest';
import { encodeTraceCursor, parseAggregateQuery, parseTraceQuery } from './analytics-query';

const defaults = { projectId: 'project-one', defaultTo: '2026-10-09T00:00:00.000Z' };
const dates = 'from=2026-10-08T00:00:00Z&to=2026-10-09T00:00:00Z';

describe('analytics query boundary', () => {
  it('defaults to a fixed 24 hour window and normalizes UTC strings', () => {
    expect(parseAggregateQuery(new URLSearchParams(), defaults)).toEqual({
      from: '2026-10-08T00:00:00.000Z',
      to: defaults.defaultTo,
    });
    expect(parseAggregateQuery(new URLSearchParams(dates), defaults)).toEqual({
      from: '2026-10-08T00:00:00.000Z',
      to: defaults.defaultTo,
    });
  });
  it.each([
    'from=2026-10-08T00:00:00Z',
    'to=2026-10-09T00:00:00Z',
    'from=2026-10-09T00:00:00Z&to=2026-10-08T00:00:00Z',
    'from=2026-08-01T00:00:00Z&to=2026-10-09T00:00:00Z',
    'from=2026-10-08T00:00:00%2B08:00&to=2026-10-09T00:00:00Z',
    `${dates}&status=oops`,
    `${dates}&provider=`,
    `${dates}&provider=one&provider=two`,
    `${dates}&projectId=foreign`,
    `${dates}&limit=10`,
  ])('rejects invalid/duplicate/unknown aggregate parameters %s', (query) => {
    expect(() => parseAggregateQuery(new URLSearchParams(query), defaults)).toThrow();
  });
  it.each(['limit=0', 'limit=101', 'limit=1.5', 'sort=latency', 'cursor=wrong'])(
    'rejects invalid pagination %s',
    (query) => {
      expect(() => parseTraceQuery(new URLSearchParams(`${dates}&${query}`), defaults)).toThrow();
    },
  );
  it('binds cursors to project, filter scope, ordering and UTC range while allowing page size changes', () => {
    const query = parseTraceQuery(
      new URLSearchParams(`${dates}&provider=example&limit=2`),
      defaults,
    );
    const cursor = encodeTraceCursor(query, defaults.projectId, {
      startedAt: '2026-10-08T12:00:00.000Z',
      traceId: 'last-trace',
    });
    const next = parseTraceQuery(
      new URLSearchParams(`${dates}&provider=example&limit=10&cursor=${cursor}`),
      defaults,
    );
    expect(next.position).toEqual({ startedAt: '2026-10-08T12:00:00.000Z', traceId: 'last-trace' });
    expect(() =>
      parseTraceQuery(new URLSearchParams(`${dates}&provider=other&cursor=${cursor}`), defaults),
    ).toThrow();
    expect(() =>
      parseTraceQuery(
        new URLSearchParams(`${dates}&provider=example&sort=oldest&cursor=${cursor}`),
        defaults,
      ),
    ).toThrow();
    expect(() =>
      parseTraceQuery(new URLSearchParams(`${dates}&provider=example&cursor=${cursor}`), {
        ...defaults,
        projectId: 'other',
      }),
    ).toThrow();
  });
  it('reuses the original default dates from a cursor rather than drifting on the next request', () => {
    const query = parseTraceQuery(new URLSearchParams(), defaults);
    const cursor = encodeTraceCursor(query, defaults.projectId, {
      startedAt: '2026-10-08T12:00:00.000Z',
      traceId: 'last-trace',
    });
    const next = parseTraceQuery(new URLSearchParams(`cursor=${cursor}`), {
      ...defaults,
      defaultTo: '2026-10-10T00:00:00.000Z',
    });
    expect(next.from).toBe(query.from);
    expect(next.to).toBe(query.to);
  });
});

describe('cursor encoding and exact window bounds', () => {
  it('roundtrips non-ASCII provider names in a URL-safe cursor', () => {
    const parameters = new URLSearchParams(dates);
    parameters.set('provider', '範例供應商');
    const query = parseTraceQuery(parameters, defaults);
    const cursor = encodeTraceCursor(query, defaults.projectId, {
      startedAt: '2026-10-08T12:00:00.000Z',
      traceId: 'last-trace',
    });
    parameters.set('cursor', cursor);
    expect(parseTraceQuery(parameters, defaults).provider).toBe('範例供應商');
  });
  it('accepts exactly 31 days and rejects even one extra millisecond', () => {
    expect(() =>
      parseAggregateQuery(
        new URLSearchParams('from=2026-09-08T00:00:00Z&to=2026-10-09T00:00:00Z'),
        defaults,
      ),
    ).not.toThrow();
    expect(() =>
      parseAggregateQuery(
        new URLSearchParams('from=2026-09-08T00:00:00Z&to=2026-10-09T00:00:00.001Z'),
        defaults,
      ),
    ).toThrow();
  });
});
