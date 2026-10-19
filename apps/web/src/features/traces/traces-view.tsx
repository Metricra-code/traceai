'use client';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { ModelComparison, Trace, TracePage } from '@traceai/shared';
import { Empty, Failure, Loading, Status } from '@/components/ui/feedback';
import { PageTitle } from '@/components/ui/page-title';
import { ApiError, api, cost, integer, latency, utc } from '@/lib/api';
import { tracePath } from '@/lib/routes';
import { useDashboard } from '@/features/dashboard';
import { TraceFilterBar } from './trace-filter-bar';
export function TracesView() {
  const context = useDashboard();
  return (
    <>
      <PageTitle
        eyebrow="REQUEST EXPLORER"
        subtitle="Filter at the server. Inspect one operation at a time."
      >
        Traces
      </PageTitle>
      <TraceExplorer key={`${context.apiBase}:${context.query}`} />
    </>
  );
}
function TraceExplorer() {
  const {
    apiBase,
    query,
    basePath,
    navigation,
    href,
    updateFilters,
    pagination,
    nextPage,
    previousPage,
    firstPage,
  } = useDashboard();
  const { provider, model, status, traceId, sort } = navigation;
  const filters = { provider, model, status, traceId, sort };
  const options = useQuery({
    queryKey: [apiBase, 'models', query],
    queryFn: ({ signal }) =>
      api<{ items: ModelComparison[] }>(`${apiBase}/models?${query}`, { signal }),
  });
  const manualFilters = options.error instanceof ApiError && options.error.status === 422;
  const params = new URLSearchParams(query);
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  params.set('limit', '25');
  const cursor = navigation.cursor;
  if (cursor) params.set('cursor', cursor);
  const search = params.toString();
  const result = useQuery({
    queryKey: [apiBase, 'traces', search],
    queryFn: ({ signal }) => api<TracePage>(`${apiBase}/traces?${search}`, { signal }),
  });
  const columns: { header: string; numeric?: true; cell: (trace: Trace) => ReactNode }[] = [
    {
      header: 'Trace ID',
      cell: (trace) => (
        <Link className="trace-link mono" href={href(tracePath(basePath, trace.traceId))}>
          {trace.traceId}
        </Link>
      ),
    },
    { header: 'Operation', cell: (trace) => trace.name },
    { header: 'Provider', cell: (trace) => trace.provider },
    { header: 'Model', cell: (trace) => trace.model },
    { header: 'Status', cell: (trace) => <Status status={trace.status} /> },
    {
      header: 'Latency',
      numeric: true,
      cell: (trace) => <span className="mono">{latency(trace.durationMs)}</span>,
    },
    {
      header: 'Tokens',
      numeric: true,
      cell: (trace) => (
        <span className="mono">
          {trace.inputTokens === undefined || trace.outputTokens === undefined
            ? 'Not reported'
            : integer(trace.inputTokens + trace.outputTokens)}
        </span>
      ),
    },
    {
      header: 'Estimated cost',
      numeric: true,
      cell: (trace) => cost(trace.estimatedCostNanoUsd),
    },
    {
      header: 'Started (UTC)',
      cell: (trace) => <span className="mono small">{utc(trace.startedAt)}</span>,
    },
  ];
  return (
    <>
      <TraceFilterBar suggestions={options.data?.items} manual={manualFilters} />
      <div className="section-heading">
        <span className="muted small">Server-side filtering · 25 rows per page</span>
        {filters.traceId && (
          <button onClick={() => updateFilters({ traceId: '' })}>Clear trace search</button>
        )}
      </div>
      {manualFilters ? (
        <p className="notice small" role="status">
          The model summary exceeds this bounded analytics window. Exact provider/model filters
          still work; narrow the time range to restore suggestions.
        </p>
      ) : (
        options.error && <Failure error={options.error} retry={() => void options.refetch()} />
      )}{' '}
      {result.error ? (
        <>
          <Failure error={result.error} retry={() => void result.refetch()} />
          {cursor && result.error instanceof ApiError && result.error.status === 400 && (
            <button onClick={firstPage}>Reset pagination</button>
          )}
        </>
      ) : result.isPending ? (
        <Loading />
      ) : !result.data.items.length ? (
        <Empty>
          <h2>No matching traces</h2>
          <p>Try another filter or date range. Trace ID search is an exact match.</p>
        </Empty>
      ) : (
        <div className="table-scroll">
          <table className="responsive-table">
            <caption className="sr-only">Project traces with server-side filters</caption>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.header}
                    scope="col"
                    className={column.numeric ? 'numeric' : undefined}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.data.items.map((trace) => (
                <tr key={trace.traceId}>
                  {columns.map((column) => (
                    <td
                      key={column.header}
                      data-label={column.header}
                      className={column.numeric ? 'numeric' : undefined}
                    >
                      {column.cell(trace)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pagination">
        <span className="muted small">
          {pagination.page === undefined ? 'Current page' : `Page ${pagination.page}`} ·{' '}
          {result.data?.items.length ?? 0} traces
        </span>
        <div>
          {cursor && pagination.previous === undefined ? (
            <button disabled={result.isFetching} onClick={firstPage}>
              First page
            </button>
          ) : (
            <button
              disabled={pagination.previous === undefined || result.isFetching}
              onClick={previousPage}
            >
              Previous page
            </button>
          )}
          <button
            disabled={!result.data?.nextCursor || result.isFetching}
            onClick={() => {
              if (result.data?.nextCursor) nextPage(result.data.nextCursor);
            }}
          >
            Next page
          </button>
        </div>
      </div>
    </>
  );
}
