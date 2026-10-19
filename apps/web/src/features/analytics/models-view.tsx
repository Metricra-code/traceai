'use client';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import type { ModelComparison } from '@traceai/shared';
import { Empty, Failure, Loading } from '@/components/ui/feedback';
import { PageTitle } from '@/components/ui/page-title';
import { api, cost, integer, latency } from '@/lib/api';
import { useDashboard } from '@/features/dashboard';
import { COLORS } from './metric-chart';
const COLUMNS: { header: string; numeric?: true; cell: (item: ModelComparison) => ReactNode }[] = [
  {
    header: 'Model / provider',
    cell: (item) => (
      <>
        <strong>{item.model}</strong>
        <div className="muted small">{item.provider}</div>
      </>
    ),
  },
  {
    header: 'Requests',
    numeric: true,
    cell: (item) => <span className="mono">{integer(item.totalRequests)}</span>,
  },
  {
    header: 'Avg latency',
    numeric: true,
    cell: (item) => <span className="mono">{latency(item.averageLatencyMs)}</span>,
  },
  {
    header: 'P95 latency',
    numeric: true,
    cell: (item) => <span className="mono">{latency(item.p95LatencyMs)}</span>,
  },
  {
    header: 'Success rate',
    numeric: true,
    cell: (item) => <span className="mono">{((1 - item.errorRate) * 100).toFixed(1)}%</span>,
  },
  {
    header: 'Tokens',
    numeric: true,
    cell: (item) => <span className="mono">{integer(item.inputTokens + item.outputTokens)}</span>,
  },
  {
    header: 'Estimated cost',
    numeric: true,
    cell: (item) => (
      <>
        {cost(item.estimatedCostNanoUsd)}
        <div className="muted small">
          {item.pricedRequests}/{item.totalRequests} priced
        </div>
      </>
    ),
  },
];
export function ModelsView() {
  const { apiBase, query, demo } = useDashboard();
  const result = useQuery({
    queryKey: [apiBase, 'models', query],
    queryFn: ({ signal }) =>
      api<{ items: ModelComparison[] }>(`${apiBase}/models?${query}`, { signal }),
  });
  if (result.error) return <Failure error={result.error} retry={() => void result.refetch()} />;
  if (!result.data) return <Loading />;
  const items = result.data.items;
  return (
    <>
      <PageTitle
        eyebrow="OPERATIONAL PERFORMANCE"
        subtitle="Compare speed, reliability and usage — not model quality or accuracy."
      >
        Model comparison
      </PageTitle>
      {!items.length ? (
        <Empty>
          <h2>No models in this window</h2>
          <p>Try a wider date range or instrument your first operation.</p>
        </Empty>
      ) : (
        <>
          <section className="chart-panel model-comparison-chart">
            <div className="section-heading">
              <h2>P95 latency by model</h2>
              <span className="muted small">Lower is faster · milliseconds</span>
            </div>
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart
                  data={items}
                  layout="vertical"
                  margin={{ right: 24, left: 0 }}
                  accessibilityLayer
                >
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: 'var(--muted)', fontSize: 10 }}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey={(item: ModelComparison) => `${item.provider} / ${item.model}`}
                    width={160}
                    tick={{ fill: 'var(--muted)', fontSize: 10 }}
                    interval={0}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{ background: 'var(--panel)', border: '1px solid var(--border)' }}
                  />
                  <Bar
                    dataKey="p95LatencyMs"
                    name="P95 (ms)"
                    fill={COLORS[1]}
                    barSize={36}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <div className="table-scroll">
            <table className="responsive-table">
              <caption>
                Model performance in selected UTC window{demo ? ' · simulated' : ''}
              </caption>
              <thead>
                <tr>
                  {COLUMNS.map((column) => (
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
                {items.map((item) => (
                  <tr key={`${item.provider}/${item.model}`}>
                    {COLUMNS.map((column) => (
                      <td
                        key={column.header}
                        data-label={column.header}
                        className={column.numeric ? 'numeric' : undefined}
                      >
                        {column.cell(item)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="footnote">
        Nearest-rank P95. Workloads and token sizes differ between models; this is not a controlled
        benchmark.{demo ? ' All traces and prices are simulated.' : ''}
      </p>
    </>
  );
}
