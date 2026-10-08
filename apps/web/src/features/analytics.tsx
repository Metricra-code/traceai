'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { MetricBucket, ModelComparison, Overview } from '@traceai/shared';
import { useAnalytics } from '@/components/shell';
import { Empty, Failure, Loading, Title } from '@/components/ui';
import { api, cost, integer, latency } from '@/lib/api';
const COLORS = ['#c6dc9a', '#e7b273', '#92b0d1', '#b49dcb', '#d5b7ab'];
function Chart({
  title,
  note,
  items,
  lines,
}: {
  title: string;
  note: string;
  items: MetricBucket[];
  lines: { key: keyof MetricBucket; name: string; color: string }[];
}) {
  const points = items.map((item) => ({
    ...item,
    p95LatencyMs: item.totalRequests ? item.p95LatencyMs : null,
    averageLatencyMs: item.totalRequests ? item.averageLatencyMs : null,
    label: item.timestamp.slice(5, 16).replace('T', ' '),
    knownEstimatedCostNanoUsd:
      item.knownEstimatedCostNanoUsd === null ? null : Number(item.knownEstimatedCostNanoUsd) / 1e9,
  }));
  return (
    <section className="chart-panel" aria-label={title}>
      <div className="section-heading">
        <h2>{title}</h2>
        <span className="muted small">{note}</span>
      </div>
      <div className="chart-legend">
        {lines.map((line) => (
          <span key={line.key}>
            <i style={{ background: line.color }} />
            {line.name}
          </span>
        ))}
      </div>
      <div className="chart">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart
            data={points}
            margin={{ top: 8, right: 12, bottom: 8, left: 0 }}
            accessibilityLayer
          >
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: 'var(--muted)', fontSize: 10 }}
              minTickGap={60}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              width={48}
              tick={{ fill: 'var(--muted)', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--panel)',
                border: '1px solid var(--border)',
                fontSize: 12,
              }}
            />
            {lines.map((line) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                name={line.name}
                stroke={line.color}
                strokeWidth={1.8}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
export function OverviewView() {
  const { apiBase, query, demo, basePath } = useAnalytics();
  const overview = useQuery({
    queryKey: [apiBase, 'overview', query],
    queryFn: () => api<Overview>(`${apiBase}/overview?${query}`),
  });
  const metrics = useQuery({
    queryKey: [apiBase, 'metrics', query],
    queryFn: () => api<{ items: MetricBucket[]; bucket: string }>(`${apiBase}/metrics?${query}`),
  });
  const models = useQuery({
    queryKey: [apiBase, 'models', query],
    queryFn: () => api<{ items: ModelComparison[] }>(`${apiBase}/models?${query}`),
  });
  if (overview.error || metrics.error || models.error)
    return (
      <Failure
        error={(overview.error ?? metrics.error ?? models.error)!}
        retry={() => {
          void overview.refetch();
          void metrics.refetch();
          void models.refetch();
        }}
      />
    );
  if (!overview.data || !metrics.data || !models.data) return <Loading />;
  const data = overview.data;
  const providers = Array.from(new Set(models.data.items.map((item) => item.provider))).map(
    (provider) => ({
      provider,
      requests: models.data.items
        .filter((item) => item.provider === provider)
        .reduce((sum, item) => sum + item.totalRequests, 0),
    }),
  );
  return (
    <>
      <Title
        eyebrow="APPLICATION HEALTH"
        subtitle="The numbers behind every operation. Not the prompts inside it."
      >
        Overview
      </Title>
      <div className="metric-strip">
        <div>
          <p>Total requests</p>
          <strong data-testid="total-requests">{integer(data.totalRequests)}</strong>
          <span>
            {integer(data.successfulRequests)} successful · {integer(data.failedRequests)} failed
          </span>
        </div>
        <div>
          <p>P95 latency</p>
          <strong data-testid="p95-latency">{latency(data.p95LatencyMs)}</strong>
          <span>
            Average {latency(data.averageLatencyMs)} · P50 {latency(data.p50LatencyMs)}
          </span>
        </div>
        <div>
          <p>Error rate</p>
          <strong>
            {(data.errorRate * 100).toFixed(2)}
            <small>%</small>
          </strong>
          <span>{integer(data.failedRequests)} requests to investigate</span>
        </div>
        <div>
          <p>{demo ? 'Simulated estimated cost' : 'Estimated cost'}</p>
          <strong className={data.estimatedCostNanoUsd === null ? 'metric-text' : ''}>
            {cost(data.estimatedCostNanoUsd)}
          </strong>
          <span>
            {integer(data.pricedRequests)} priced / {integer(data.totalRequests)} requests
          </span>
          {data.unpricedRequests > 0 && (
            <span>Known subtotal: {cost(data.knownEstimatedCostNanoUsd)}</span>
          )}
        </div>
      </div>
      {!data.totalRequests ? (
        <Empty>
          <h2>{demo ? 'No demo traces in this window' : 'Ready for your first trace'}</h2>
          <p>
            {demo
              ? 'Choose another date range within the simulated dataset.'
              : 'Generate an ingestion key and wrap an operation with the SDK. No AI provider credentials are needed to try the mock example.'}
          </p>
          {!demo && (
            <Link className="button" href={`${basePath}/settings`}>
              Set up the SDK <ArrowUpRight size={15} />
            </Link>
          )}
        </Empty>
      ) : (
        <>
          <div className="analysis-note">
            <span className="mono">P99 {latency(data.p99LatencyMs)}</span>
            <span>{integer(data.inputTokens + data.outputTokens)} tokens</span>
            <span>Nearest-rank percentiles · {metrics.data.bucket} buckets</span>
          </div>
          <div className="charts-grid">
            <Chart
              title="Request volume"
              note="requests / bucket"
              items={metrics.data.items}
              lines={[
                { key: 'totalRequests', name: 'All requests', color: COLORS[0]! },
                { key: 'failedRequests', name: 'Errors', color: COLORS[1]! },
              ]}
            />
            <Chart
              title="Latency distribution over time"
              note="milliseconds"
              items={metrics.data.items}
              lines={[
                { key: 'p95LatencyMs', name: 'P95', color: COLORS[1]! },
                { key: 'averageLatencyMs', name: 'Average', color: COLORS[2]! },
              ]}
            />
            <Chart
              title="Token usage"
              note="explicit SDK usage only"
              items={metrics.data.items}
              lines={[
                { key: 'inputTokens', name: 'Input', color: COLORS[2]! },
                { key: 'outputTokens', name: 'Output', color: COLORS[3]! },
              ]}
            />
            <Chart
              title={demo ? 'Simulated priced-request cost' : 'Priced-request cost'}
              note="USD · unknown requests excluded"
              items={metrics.data.items}
              lines={[
                {
                  key: 'knownEstimatedCostNanoUsd',
                  name: 'Known subtotal (not a complete total)',
                  color: COLORS[0]!,
                },
              ]}
            />
          </div>
          <div className="distribution-grid">
            <section className="chart-panel">
              <div className="section-heading">
                <h2>Requests by provider</h2>
                <span className="muted small">Operational volume</span>
              </div>
              <div className="chart short-chart">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart
                    data={providers}
                    layout="vertical"
                    margin={{ right: 24, left: 0 }}
                    accessibilityLayer
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="provider"
                      width={84}
                      tick={{ fill: 'var(--muted)', fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--panel)',
                        border: '1px solid var(--border)',
                      }}
                    />
                    <Bar
                      dataKey="requests"
                      fill={COLORS[2]}
                      barSize={12}
                      isAnimationActive={false}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>
            <section className="chart-panel">
              <div className="section-heading">
                <h2>Model usage</h2>
                <Link href={`${basePath}/models`}>
                  Compare models <ArrowUpRight size={13} />
                </Link>
              </div>
              <div className="model-usage">
                {models.data.items.map((item, index) => (
                  <div key={`${item.provider}/${item.model}`}>
                    <div>
                      <span>{item.model}</span>
                      <span className="mono">{integer(item.totalRequests)}</span>
                    </div>
                    <meter
                      aria-label={`${item.model} requests`}
                      min={0}
                      max={data.totalRequests}
                      value={item.totalRequests}
                      style={{ accentColor: COLORS[index % COLORS.length] }}
                    />
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
      {data.unpricedRequests > 0 && (
        <p className="footnote">
          {integer(data.unpricedRequests)} requests have no price or no complete token usage. The
          total is unavailable rather than understated. Estimates are not provider bills.
          {demo ? ' Demo prices are fictional.' : ''}
        </p>
      )}
    </>
  );
}
export function ModelsView() {
  const { apiBase, query, demo } = useAnalytics();
  const result = useQuery({
    queryKey: [apiBase, 'models', query],
    queryFn: () => api<{ items: ModelComparison[] }>(`${apiBase}/models?${query}`),
  });
  if (result.error) return <Failure error={result.error} retry={() => void result.refetch()} />;
  if (!result.data) return <Loading />;
  const items = result.data.items;
  return (
    <>
      <Title
        eyebrow="OPERATIONAL PERFORMANCE"
        subtitle="Compare speed, reliability and usage — not model quality or accuracy."
      >
        Model comparison
      </Title>
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
                <BarChart data={items} margin={{ bottom: 40, right: 24 }} accessibilityLayer>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="model"
                    tick={{ fill: 'var(--muted)', fontSize: 10 }}
                    angle={-12}
                    textAnchor="end"
                    interval={0}
                    tickLine={false}
                  />
                  <YAxis tick={{ fill: 'var(--muted)', fontSize: 10 }} />
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
            <table>
              <caption>
                Model performance in selected UTC window{demo ? ' · simulated' : ''}
              </caption>
              <thead>
                <tr>
                  {[
                    'Model / provider',
                    'Requests',
                    'Avg latency',
                    'P95 latency',
                    'Success rate',
                    'Tokens',
                    'Estimated cost',
                  ].map((item) => (
                    <th key={item} scope="col">
                      {item}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={`${item.provider}/${item.model}`}>
                    <td>
                      <strong>{item.model}</strong>
                      <div className="muted small">{item.provider}</div>
                    </td>
                    <td className="mono">{integer(item.totalRequests)}</td>
                    <td className="mono">{latency(item.averageLatencyMs)}</td>
                    <td className="mono">{latency(item.p95LatencyMs)}</td>
                    <td className="mono">{((1 - item.errorRate) * 100).toFixed(1)}%</td>
                    <td className="mono">{integer(item.inputTokens + item.outputTokens)}</td>
                    <td>
                      {cost(item.estimatedCostNanoUsd)}
                      <div className="muted small">
                        {item.pricedRequests}/{item.totalRequests} priced
                      </div>
                    </td>
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
