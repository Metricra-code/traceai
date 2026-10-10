'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { CopyButton, Empty, Failure, Loading, Status, Title } from '@/components/ui';
import { api, integer, latency } from '@/lib/api';
import type { RecordedSample, ShowcaseResponse, ShowcaseSummary } from '@/lib/showcase';

const INSTALL_COMMAND = 'bun add @akai_80percent/traceai-sdk';
const formatLatency = (value: number | null) => (value === null ? 'Unavailable' : latency(value));
const formatTokens = (value: number | null) => (value === null ? 'Unavailable' : integer(value));

function Summary({ summary }: { summary: ShowcaseSummary }) {
  const totalTokens =
    summary.inputTokens === null || summary.outputTokens === null
      ? null
      : summary.inputTokens + summary.outputTokens;
  return (
    <>
      <dl className="showcase-metrics" aria-label="Filtered recorded call summary">
        <div>
          <dt>Recorded calls</dt>
          <dd data-testid="showcase-total-requests">{integer(summary.totalRequests)}</dd>
          <dd className="showcase-metric-note">
            {summary.successfulRequests} successful · {summary.failedRequests} failed
          </dd>
        </div>
        <div>
          <dt>Average latency</dt>
          <dd>{formatLatency(summary.averageLatencyMs)}</dd>
          <dd className="showcase-metric-note">Measured SDK operation duration</dd>
        </div>
        <div>
          <dt>P95 latency</dt>
          <dd data-testid="showcase-p95">{formatLatency(summary.p95LatencyMs)}</dd>
          <dd className="showcase-metric-note">Nearest-rank percentile</dd>
        </div>
        <div>
          <dt>Total tokens</dt>
          <dd data-testid="showcase-total-tokens">{formatTokens(totalTokens)}</dd>
          <dd className="showcase-metric-note">
            {formatTokens(summary.inputTokens)} input · {formatTokens(summary.outputTokens)} output
          </dd>
        </div>
      </dl>
      <p className="showcase-method-note">
        This snapshot contains only three calls. P95 is the largest observed latency, not a
        production reliability estimate. All summaries follow the selected filters.
      </p>
    </>
  );
}

function LatencyComparison({ items }: { items: readonly RecordedSample[] }) {
  const maximumLatencyMs = Math.max(...items.map((item) => item.durationMs));
  return (
    <section className="showcase-comparison" aria-labelledby="sample-latency-heading">
      <div className="section-heading">
        <h2 id="sample-latency-heading">Latency by recorded call</h2>
        <span className="muted small">Individual samples · not a time series</span>
      </div>
      <ol className="showcase-latency-list">
        {items.map((item) => (
          <li key={item.sampleNumber}>
            <span className="small">Call {item.sampleNumber}</span>
            <div className="showcase-latency-track" aria-hidden="true">
              <span
                style={{
                  width: `${maximumLatencyMs > 0 ? (item.durationMs / maximumLatencyMs) * 100 : 0}%`,
                }}
              />
            </div>
            <span className="mono small">{latency(item.durationMs)}</span>
          </li>
        ))}
      </ol>
      <p className="muted small">
        Common scale: 0 to {latency(maximumLatencyMs)}. Values are also listed below.
      </p>
    </section>
  );
}

function Measurements({ items }: { items: readonly RecordedSample[] }) {
  return (
    <section
      id="measurements"
      className="showcase-section"
      aria-labelledby="recorded-calls-heading"
    >
      <div className="section-heading">
        <h2 id="recorded-calls-heading">Recorded model calls</h2>
        <span className="muted small">Public sample numbers · no private trace identifiers</span>
      </div>
      <div
        className="table-scroll"
        tabIndex={0}
        role="region"
        aria-label="Recorded calls table scroll area"
      >
        <table aria-label="Recorded model calls">
          <thead>
            <tr>
              <th scope="col">Sample</th>
              <th scope="col">Model</th>
              <th scope="col">Latency</th>
              <th scope="col">Input tokens</th>
              <th scope="col">Output tokens</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.sampleNumber}>
                <th scope="row">Call {item.sampleNumber}</th>
                <td className="mono">{item.model}</td>
                <td className="mono">{latency(item.durationMs)}</td>
                <td className="mono">{formatTokens(item.inputTokens)}</td>
                <td className="mono">{formatTokens(item.outputTokens)}</td>
                <td>
                  <Status status={item.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ModelSummary({ models }: { models: ShowcaseResponse['models'] }) {
  return (
    <section
      id="model-summary"
      className="showcase-section"
      aria-labelledby="model-summary-heading"
    >
      <div className="section-heading">
        <h2 id="model-summary-heading">Model summary</h2>
        <span className="muted small">Observed operation metrics only</span>
      </div>
      {models.map((model) => (
        <div className="showcase-model" key={model.model}>
          <h3 className="mono">{model.model}</h3>
          <dl>
            <div>
              <dt>Recorded calls</dt>
              <dd>{integer(model.totalRequests)}</dd>
            </div>
            <div>
              <dt>Average latency</dt>
              <dd>{formatLatency(model.averageLatencyMs)}</dd>
            </div>
            <div>
              <dt>P95 latency</dt>
              <dd>{formatLatency(model.p95LatencyMs)}</dd>
            </div>
            <div>
              <dt>Input / output tokens</dt>
              <dd>
                {formatTokens(model.inputTokens)} / {formatTokens(model.outputTokens)}
              </dd>
            </div>
          </dl>
        </div>
      ))}
      <p className="muted small">
        Only one model was recorded. These samples do not compare model quality or establish a
        ranking.
      </p>
    </section>
  );
}

function SdkIntegration() {
  return (
    <section className="showcase-sdk" aria-labelledby="showcase-sdk-heading">
      <div>
        <p className="eyebrow">PUBLISHED TYPESCRIPT SDK</p>
        <h2 id="showcase-sdk-heading">Capture your own operations</h2>
        <p className="muted small">
          Use a private project and server-side ingestion key. Visiting this page never calls a
          model.
        </p>
      </div>
      <div className="showcase-install">
        <code>{INSTALL_COMMAND}</code>
        <CopyButton value={INSTALL_COMMAND} label="Copy install command" />
      </div>
      <a
        href="https://github.com/Metricra-code/traceai/tree/main/packages/sdk"
        target="_blank"
        rel="noreferrer"
      >
        SDK integration guide <ArrowUpRight size={14} />
      </a>
    </section>
  );
}

export function ShowcaseView() {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const model = searchParams.get('model') ?? '';
  const status = searchParams.get('status') ?? '';
  const sort = searchParams.get('sort') ?? 'recorded';
  const recorded = useQuery({
    queryKey: ['showcase', query],
    queryFn: ({ signal }) =>
      api<ShowcaseResponse>(`showcase${query ? `?${query}` : ''}`, { signal }),
  });
  // Keep the source's model choices available when the selected filters match no calls.
  const baseline = useQuery({
    queryKey: ['showcase', ''],
    queryFn: ({ signal }) => api<ShowcaseResponse>('showcase', { signal }),
    enabled: query !== '',
  });
  const modelChoices = Array.from(
    new Set([
      ...(baseline.data?.models ?? recorded.data?.models ?? []).map((item) => item.model),
      ...(model ? [model] : []),
    ]),
  );
  function updateFilter(name: 'model' | 'status' | 'sort', value: string) {
    const next = new URLSearchParams(query);
    if (!value || (name === 'sort' && value === 'recorded')) next.delete(name);
    else next.set(name, value);
    window.history.pushState(null, '', `/showcase${next.size ? `?${next}` : ''}`);
  }
  function resetFilters() {
    window.history.pushState(null, '', '/showcase');
  }
  return (
    <>
      <div className="showcase-source">
        <span className="recorded-tag">Recorded real API calls · Read-only</span>
      </div>
      <Title
        eyebrow="REAL API EVIDENCE"
        subtitle="Genuine Gemini calls captured with the TraceAI SDK and persisted in D1. A curated snapshot, not live traffic or a benchmark."
      >
        Real measurements
      </Title>
      <div className="showcase-filters" aria-label="Recorded call filters">
        <label>
          Model
          <select
            aria-label="Model"
            value={model}
            onChange={(event) => updateFilter('model', event.target.value)}
          >
            <option value="">All recorded models</option>
            {modelChoices.map((choice) => (
              <option value={choice} key={choice}>
                {choice}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            aria-label="Status"
            value={status}
            onChange={(event) => updateFilter('status', event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="success">Success</option>
            <option value="error">Error</option>
          </select>
        </label>
        <label>
          Sort by
          <select
            aria-label="Sort by"
            value={sort}
            onChange={(event) => updateFilter('sort', event.target.value)}
          >
            <option value="recorded">Recorded order</option>
            <option value="latency-asc">Latency: low to high</option>
            <option value="latency-desc">Latency: high to low</option>
          </select>
        </label>
        <button type="button" onClick={resetFilters} disabled={!query}>
          Reset filters
        </button>
        <p className="muted small">Filters and sorting are applied by the server.</p>
      </div>
      {recorded.error ? (
        <Failure error={recorded.error} retry={() => void recorded.refetch()} />
      ) : !recorded.data ? (
        <Loading />
      ) : (
        <div aria-busy={recorded.isFetching}>
          <Summary summary={recorded.data.summary} />
          {recorded.data.items.length ? (
            <>
              <LatencyComparison items={recorded.data.items} />
              <Measurements items={recorded.data.items} />
              <ModelSummary models={recorded.data.models} />
            </>
          ) : (
            <section id="measurements" className="showcase-section">
              <div id="model-summary">
                <Empty>
                  <h2>No recorded calls match</h2>
                  <p>
                    Try another model or status. This recorded snapshot contains three successful
                    calls; it does not fabricate failures.
                  </p>
                  <button type="button" onClick={resetFilters}>
                    Show all recorded calls
                  </button>
                </Empty>
              </div>
            </section>
          )}
        </div>
      )}
      <p className="showcase-privacy-note">
        Only model, latency, token usage and status are public. Prompts, responses, credentials,
        account details and private trace identifiers are excluded.
      </p>
      <SdkIntegration />
      <p className="footnote">
        For larger datasets, multi-model comparisons and full trace navigation,{' '}
        <Link href="/demo">explore the separate simulated dataset</Link>.
      </p>
    </>
  );
}
