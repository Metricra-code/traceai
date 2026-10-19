'use client';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import type { Trace } from '@traceai/shared';
import { CopyButton } from '@/components/ui/copy-button';
import { Failure, Loading, Status } from '@/components/ui/feedback';
import { PageTitle } from '@/components/ui/page-title';
import { api, cost, integer, latency, utc } from '@/lib/api';
import { sectionPath } from '@/lib/routes';
import { useDashboard } from '@/features/dashboard';
function pricingSource(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}
export function TraceDetail({ traceId }: { traceId: string }) {
  const { apiBase, basePath, demo, href } = useDashboard();
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
      <Link className="back-link" href={href(sectionPath(basePath, 'traces'))}>
        ← All traces
      </Link>
      <PageTitle eyebrow="OPERATION INSPECTOR" subtitle={trace.name}>
        Trace detail
      </PageTitle>
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
