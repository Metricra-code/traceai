'use client';
import { useState, useMemo, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import type { ModelComparison, Trace, TracePage } from '@traceai/shared';
import { useAnalytics } from '@/components/shell';
import { Empty, Failure, Loading, Status, Title, CopyButton } from '@/components/ui';
import { api, cost, integer, latency, utc } from '@/lib/api';
export function TracesView() {
  const context = useAnalytics();
  return (
    <>
      <Title
        eyebrow="REQUEST EXPLORER"
        subtitle="Filter at the server. Inspect one operation at a time."
      >
        Traces
      </Title>
      <TraceExplorer key={`${context.apiBase}:${context.query}`} />
    </>
  );
}
function TraceExplorer() {
  const { apiBase, query, basePath } = useAnalytics();
  const [filters, setFilters] = useState({
    provider: '',
    model: '',
    status: '',
    traceId: '',
    sort: 'newest',
  });
  const [cursors, setCursors] = useState<string[]>([]);
  const options = useQuery({
    queryKey: [apiBase, 'models', query],
    queryFn: () => api<{ items: ModelComparison[] }>(`${apiBase}/models?${query}`),
  });
  const params = new URLSearchParams(query);
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  params.set('limit', '25');
  const cursor = cursors.at(-1);
  if (cursor) params.set('cursor', cursor);
  const search = params.toString();
  const result = useQuery({
    queryKey: [apiBase, 'traces', search],
    queryFn: () => api<TracePage>(`${apiBase}/traces?${search}`),
  });
  function update(key: keyof typeof filters, value: string) {
    setFilters((previous) => ({
      ...previous,
      [key]: value,
      ...(key === 'provider' ? { model: '' } : {}),
    }));
    setCursors([]);
  }
  function searchId(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    update('traceId', String(new FormData(event.currentTarget).get('traceId') ?? '').trim());
  }
  const columns = useMemo<ColumnDef<Trace>[]>(
    () => [
      {
        accessorKey: 'traceId',
        header: 'Trace ID',
        cell: (info) => (
          <Link
            className="trace-link mono"
            href={`${basePath}/traces/${encodeURIComponent(String(info.getValue()))}`}
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
    [basePath],
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
      <div className="filters">
        <label>
          Provider
          <select
            aria-label="Provider filter"
            value={filters.provider}
            onChange={(e) => update('provider', e.target.value)}
          >
            <option value="">All providers</option>
            {Array.from(new Set(options.data?.items.map((item) => item.provider))).map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          Model
          <select
            aria-label="Model filter"
            value={filters.model}
            onChange={(e) => update('model', e.target.value)}
          >
            <option value="">All models</option>
            {options.data?.items
              .filter((item) => !filters.provider || item.provider === filters.provider)
              .map((item) => (
                <option key={`${item.provider}/${item.model}`} value={item.model}>
                  {item.model}
                </option>
              ))}
          </select>
        </label>
        <label>
          Status
          <select
            aria-label="Status filter"
            value={filters.status}
            onChange={(e) => update('status', e.target.value)}
          >
            <option value="">All statuses</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
          </select>
        </label>
        <label>
          Sort
          <select
            aria-label="Trace sort"
            value={filters.sort}
            onChange={(e) => update('sort', e.target.value)}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
        <form onSubmit={searchId}>
          <label htmlFor="trace-search">Exact trace ID</label>
          <div className="search-field">
            <input id="trace-search" name="traceId" placeholder="trace_…" maxLength={128} />
            <button type="submit">Search</button>
          </div>
        </form>
      </div>
      <div className="section-heading">
        <span className="muted small">Server-side filtering · 25 rows per page</span>
        {filters.traceId && (
          <button onClick={() => update('traceId', '')}>Clear trace search</button>
        )}
      </div>
      {options.error && <Failure error={options.error} retry={() => void options.refetch()} />}{' '}
      {result.error ? (
        <Failure error={result.error} retry={() => void result.refetch()} />
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
          Page {cursors.length + 1} · {result.data?.items.length ?? 0} traces
        </span>
        <div>
          <button
            disabled={!cursors.length || result.isFetching}
            onClick={() => setCursors((previous) => previous.slice(0, -1))}
          >
            Previous page
          </button>
          <button
            disabled={!result.data?.nextCursor || result.isFetching}
            onClick={() => {
              if (result.data?.nextCursor)
                setCursors((previous) => [...previous, result.data.nextCursor!]);
            }}
          >
            Next page
          </button>
        </div>
      </div>
    </>
  );
}
export function TraceDetail({ traceId }: { traceId: string }) {
  const { apiBase, basePath, demo } = useAnalytics();
  const result = useQuery({
    queryKey: [apiBase, 'trace', traceId],
    queryFn: () => api<Trace>(`${apiBase}/traces/${encodeURIComponent(traceId)}`),
  });
  if (result.error) return <Failure error={result.error} retry={() => void result.refetch()} />;
  if (!result.data) return <Loading />;
  const trace = result.data;
  return (
    <>
      <Link className="back-link" href={`${basePath}/traces`}>
        ← All traces
      </Link>
      <Title eyebrow="OPERATION INSPECTOR" subtitle={trace.name}>
        Trace detail
      </Title>
      <div className="trace-title">
        <code>{trace.traceId}</code>
        <CopyButton value={trace.traceId} label="Copy ID" />
        <Status status={trace.status} />
      </div>
      <section className="timeline-section">
        <div className="section-heading">
          <h2>Execution timeline</h2>
          <span className="muted small">{latency(trace.durationMs)}</span>
        </div>
        <p className="muted small">Single operation · not a distributed span tree</p>
        <div className="timeline-bar">
          <span>{trace.name}</span>
          <span className="mono">{latency(trace.durationMs)}</span>
        </div>
        <div className="timeline-labels">
          <span>{utc(trace.startedAt)}</span>
          <span>{utc(trace.endedAt)}</span>
        </div>
      </section>
      <dl className="detail-grid">
        {[
          ['Provider', trace.provider],
          ['Model', trace.model],
          ['Duration', latency(trace.durationMs)],
          [
            'Input tokens',
            trace.inputTokens === undefined ? 'Not reported' : integer(trace.inputTokens),
          ],
          [
            'Output tokens',
            trace.outputTokens === undefined ? 'Not reported' : integer(trace.outputTokens),
          ],
          ['Estimated cost', cost(trace.estimatedCostNanoUsd)],
          ['Pricing version', trace.pricingVersion ?? 'Unavailable'],
          ['Recorded at', utc(trace.createdAt)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {trace.status === 'error' && (
        <section className="notice error">
          <div>
            <h2>Error category: {trace.errorType ?? 'unknown'}</h2>
            <p>
              Raw application errors are not collected. Use the trace ID to correlate with your own
              secure logs.
            </p>
          </div>
        </section>
      )}
      <section className="metadata-section">
        <div className="section-heading">
          <h2>Explicit metadata</h2>
          <span className="muted small">No prompts or responses captured by default</span>
        </div>
        <pre>{JSON.stringify(trace.metadata ?? {}, null, 2)}</pre>
      </section>
      {demo && (
        <p className="footnote">This operation, its token usage and pricing are simulated.</p>
      )}
    </>
  );
}
