'use client';
import { useMemo, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useReactTable, getCoreRowModel, flexRender, type ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import type { ModelComparison, Trace, TracePage } from '@traceai/shared';
import { useAnalytics } from '@/components/shell';
import { Empty, Failure, Loading, Status, Title, CopyButton } from '@/components/ui';
import { ApiError, api, cost, integer, latency, utc } from '@/lib/api';
import type { TraceFilters } from '@/lib/navigation';
function pricingSource(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}
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
  } = useAnalytics();
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
  function update(key: keyof TraceFilters, value: string) {
    updateFilters({
      [key]: value,
      ...(key === 'provider' ? { model: '' } : {}),
    });
  }
  function searchId(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    update('traceId', String(new FormData(event.currentTarget).get('traceId') ?? '').trim());
  }
  function applyExactFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    updateFilters({
      provider: String(fields.get('provider') ?? '').trim(),
      model: String(fields.get('model') ?? '').trim(),
    });
  }
  const columns = useMemo<ColumnDef<Trace>[]>(
    () => [
      {
        accessorKey: 'traceId',
        header: 'Trace ID',
        cell: (info) => (
          <Link
            className="trace-link mono"
            href={href(`${basePath}/traces/${encodeURIComponent(String(info.getValue()))}`)}
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
      <div className="filters">
        {manualFilters ? (
          <form className="manual-filters" onSubmit={applyExactFilters}>
            <label>
              Provider
              <input
                name="provider"
                aria-label="Provider filter"
                defaultValue={filters.provider}
                key={filters.provider}
                maxLength={120}
                placeholder="Exact provider, or leave blank"
              />
            </label>
            <label>
              Model
              <input
                name="model"
                aria-label="Model filter"
                defaultValue={filters.model}
                key={filters.model}
                maxLength={120}
                placeholder="Exact model, or leave blank"
              />
            </label>
            <button type="submit">Apply exact filters</button>
          </form>
        ) : (
          <>
            <label>
              Provider
              <select
                aria-label="Provider filter"
                value={filters.provider}
                onChange={(e) => update('provider', e.target.value)}
              >
                <option value="">All providers</option>
                {filters.provider &&
                  !options.data?.items.some((item) => item.provider === filters.provider) && (
                    <option value={filters.provider}>{filters.provider} (exact filter)</option>
                  )}
                {Array.from(new Set(options.data?.items.map((item) => item.provider))).map(
                  (item) => (
                    <option key={item}>{item}</option>
                  ),
                )}
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
                {filters.model &&
                  !options.data?.items.some(
                    (item) =>
                      item.model === filters.model &&
                      (!filters.provider || item.provider === filters.provider),
                  ) && <option value={filters.model}>{filters.model} (exact filter)</option>}
                {options.data?.items
                  .filter((item) => !filters.provider || item.provider === filters.provider)
                  .map((item) => (
                    <option key={`${item.provider}/${item.model}`} value={item.model}>
                      {item.model}
                    </option>
                  ))}
              </select>
            </label>
          </>
        )}
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
            <input
              id="trace-search"
              name="traceId"
              placeholder="trace_…"
              maxLength={128}
              defaultValue={filters.traceId}
              key={filters.traceId}
              pattern="[a-zA-Z0-9_\-]*"
            />
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
export function TraceDetail({ traceId }: { traceId: string }) {
  const { apiBase, basePath, demo, href } = useAnalytics();
  const result = useQuery({
    queryKey: [apiBase, 'trace', traceId],
    queryFn: ({ signal }) =>
      api<Trace>(`${apiBase}/traces/${encodeURIComponent(traceId)}`, { signal }),
  });
  if (result.error) return <Failure error={result.error} retry={() => void result.refetch()} />;
  if (!result.data) return <Loading />;
  const trace = result.data;
  return (
    <>
      <Link className="back-link" href={href(`${basePath}/traces`)}>
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
      {trace.pricing && (
        <section className="pricing-provenance" aria-label="Pricing provenance">
          <div className="section-heading">
            <h2>Pricing provenance</h2>
            <span className="muted small">
              {trace.pricing.simulated ? 'Simulated pricing' : 'Versioned pricing registry'}
            </span>
          </div>
          <dl className="detail-grid">
            {[
              ['Version', trace.pricing.version],
              ['Currency', trace.pricing.currency],
              ['Input / million tokens', cost(trace.pricing.inputNanoUsdPerMillion)],
              ['Output / million tokens', cost(trace.pricing.outputNanoUsdPerMillion)],
              ['Effective from', utc(trace.pricing.effectiveFrom)],
              [
                'Effective to',
                trace.pricing.effectiveTo ? utc(trace.pricing.effectiveTo) : 'Open-ended',
              ],
              [
                'Verified at',
                trace.pricing.verifiedAt
                  ? utc(trace.pricing.verifiedAt)
                  : 'Not independently verified',
              ],
              ['Billing basis', trace.pricing.billingBasis ?? 'Token usage estimate'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <p className="footnote">
            {pricingSource(trace.pricing.sourceUrl) ? (
              <a href={pricingSource(trace.pricing.sourceUrl)} target="_blank" rel="noreferrer">
                Pricing source <span className="sr-only">(opens in a new tab)</span>
              </a>
            ) : (
              'No safe source link available.'
            )}{' '}
            Historical version used for this operation. Estimates are not provider bills.
            {trace.pricing.simulated ? ' These rates are fictional demo data.' : ''}
          </p>
        </section>
      )}
      {trace.status === 'error' && (
        <section className="notice error">
          <div>
            <h2>Error category: {trace.errorType ?? 'unknown'}</h2>
            {trace.errorSummary && (
              <p className="error-summary" data-testid="error-summary">
                {trace.errorSummary}
              </p>
            )}
            <p>
              Raw application errors are not collected. Use the trace ID to correlate with your own
              secure logs.
            </p>
            {trace.errorSummary && (
              <p className="small">
                Capture policy: explicit-summary-v1 · Application-supplied summary, with best-effort
                redaction. Sanitization cannot guarantee the absence of all personal information.
              </p>
            )}
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
