import { Status } from '@/components/ui/feedback';
import { integer, latency } from '@/lib/api';
import type { RecordedSample, ShowcaseResponse, ShowcaseSummary } from './model';

const formatLatency = (value: number | null) => (value === null ? 'Unavailable' : latency(value));
const formatTokens = (value: number | null) => (value === null ? 'Unavailable' : integer(value));

export function Summary({ summary }: { summary: ShowcaseSummary }) {
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

export function LatencyComparison({ items }: { items: readonly RecordedSample[] }) {
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

export function Measurements({ items }: { items: readonly RecordedSample[] }) {
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
        <table className="responsive-table" aria-label="Recorded model calls">
          <thead>
            <tr>
              <th scope="col">Sample</th>
              <th scope="col">Model</th>
              <th scope="col" className="numeric">
                Latency
              </th>
              <th scope="col" className="numeric">
                Input tokens
              </th>
              <th scope="col" className="numeric">
                Output tokens
              </th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.sampleNumber}>
                <th scope="row" data-label="Sample">
                  Call {item.sampleNumber}
                </th>
                <td className="mono" data-label="Model">
                  {item.model}
                </td>
                <td className="mono numeric" data-label="Latency">
                  {latency(item.durationMs)}
                </td>
                <td className="mono numeric" data-label="Input tokens">
                  {formatTokens(item.inputTokens)}
                </td>
                <td className="mono numeric" data-label="Output tokens">
                  {formatTokens(item.outputTokens)}
                </td>
                <td data-label="Status">
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

export function ModelSummary({ models }: { models: ShowcaseResponse['models'] }) {
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
