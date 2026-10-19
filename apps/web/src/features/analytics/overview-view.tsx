'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import type { MetricBucket, ModelComparison, Overview } from '@traceai/shared';
import { Empty, Failure, Loading } from '@/components/ui/feedback';
import { PageTitle } from '@/components/ui/page-title';
import { api, cost, integer, latency } from '@/lib/api';
import { sectionPath } from '@/lib/routes';
import { useDashboard } from '@/features/dashboard';
import { COLORS, MetricChart } from './metric-chart';
import { providerVolumes } from './provider-volumes';
export function OverviewView() {
  const { apiBase, query, demo, basePath, href } = useDashboard();
  const overview = useQuery({
    queryKey: [apiBase, 'overview', query],
    queryFn: ({ signal }) => api<Overview>(`${apiBase}/overview?${query}`, { signal }),
  });
  const metrics = useQuery({
    queryKey: [apiBase, 'metrics', query],
    queryFn: ({ signal }) =>
      api<{ items: MetricBucket[]; bucket: string }>(`${apiBase}/metrics?${query}`, { signal }),
  });
  const models = useQuery({
    queryKey: [apiBase, 'models', query],
    queryFn: ({ signal }) =>
      api<{ items: ModelComparison[] }>(`${apiBase}/models?${query}`, { signal }),
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
  const providers = providerVolumes(models.data.items);
  return (
    <>
      <PageTitle
        eyebrow="APPLICATION HEALTH"
        subtitle="The numbers behind every operation. Not the prompts inside it."
      >
        Overview
      </PageTitle>
      <div className="metric-strip">
        <div>
          <p>Total requests</p>
          <strong data-testid="total-requests">{integer(data.totalRequests)}</strong>
          <span>
            {integer(data.successfulRequests)} successful · {integer(data.failedRequests)} failed
          </span>
        </div>
        <div>
          <p>Average latency</p>
          <strong data-testid="average-latency">{latency(data.averageLatencyMs)}</strong>
          <span>Across {integer(data.totalRequests)} operations</span>
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
            <Link className="button" href={sectionPath(basePath, 'settings')}>
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
            <MetricChart
              title="Request volume"
              note="requests / bucket"
              items={metrics.data.items}
              lines={[
                { key: 'totalRequests', name: 'All requests', color: COLORS[0]! },
                { key: 'failedRequests', name: 'Errors', color: COLORS[1]! },
              ]}
            />
            <MetricChart
              title="Latency distribution over time"
              note="milliseconds"
              items={metrics.data.items}
              lines={[
                { key: 'p95LatencyMs', name: 'P95', color: COLORS[1]! },
                { key: 'averageLatencyMs', name: 'Average', color: COLORS[2]! },
              ]}
            />
            <MetricChart
              title="Token usage"
              note="explicit SDK usage only"
              items={metrics.data.items}
              lines={[
                { key: 'inputTokens', name: 'Input', color: COLORS[2]! },
                { key: 'outputTokens', name: 'Output', color: COLORS[3]! },
              ]}
            />
            <MetricChart
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
                <Link href={href(sectionPath(basePath, 'models'))}>
                  Compare models <ArrowUpRight size={13} />
                </Link>
              </div>
              <div className="model-usage">
                {models.data.items.map((item, index) => (
                  <div key={`${item.provider}/${item.model}`}>
                    <div>
                      <span>{`${item.provider} / ${item.model}`}</span>
                      <span className="mono">{integer(item.totalRequests)}</span>
                    </div>
                    <meter
                      aria-label={`${item.provider} / ${item.model} requests`}
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
