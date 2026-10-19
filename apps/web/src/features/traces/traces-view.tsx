'use client';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table';
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
  const columns = useMemo<ColumnDef<Trace>[]>(
    () => [
      {
        accessorKey: 'traceId',
        header: 'Trace ID',
        cell: (info) => (
          <Link
            className="trace-link mono"
            href={href(tracePath(basePath, String(info.getValue())))}
          >
            {String(info.getValue())}
          </Link>
        ),
      },
      { accessorKey: 'name', header: 'Operation' },
      { accessorKey: 'provider', header: 'Provider' },
      { accessorKey: 'model', header: 'Model' },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: (info) => <Status status={String(info.getValue())} />,
      },
      {
        accessorKey: 'durationMs',
        header: 'Latency',
        cell: (info) => <span className="mono">{latency(Number(info.getValue()))}</span>,
      },
      {
        id: 'tokens',
        header: 'Tokens',
        cell: (info) => (
          <span className="mono">
            {info.row.original.inputTokens === undefined ||
            info.row.original.outputTokens === undefined
              ? 'Not reported'
              : integer(info.row.original.inputTokens + info.row.original.outputTokens)}
          </span>
        ),
      },
      {
        accessorKey: 'estimatedCostNanoUsd',
        header: 'Estimated cost',
        cell: (info) => cost(info.getValue() as string | null),
      },
      {
        accessorKey: 'startedAt',
        header: 'Started (UTC)',
        cell: (info) => <span className="mono small">{utc(String(info.getValue()))}</span>,
      },
    ],
    [basePath, href],
  );
  const table = useReactTable({
    data: result.data?.items ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    manualSorting: true,
  });
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
          <table>
            <caption className="sr-only">Project traces with server-side filters</caption>
            <thead>
              {table.getHeaderGroups().map((group) => (
                <tr key={group.id}>
                  {group.headers.map((header) => (
                    <th key={header.id} scope="col">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr key={row.original.traceId}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
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
