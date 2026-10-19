'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { CopyButton } from '@/components/ui/copy-button';
import { Empty, Failure, Loading } from '@/components/ui/feedback';
import { PageTitle } from '@/components/ui/page-title';
import { api } from '@/lib/api';
import { paths } from '@/lib/routes';
import type { ShowcaseResponse } from './model';
import { LatencyComparison, Measurements, ModelSummary, Summary } from './recorded-sections';

const INSTALL_COMMAND = 'bun add @akai_80percent/traceai-sdk';

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
    window.history.pushState(null, '', `${paths.showcase}${next.size ? `?${next}` : ''}`);
  }
  function resetFilters() {
    window.history.pushState(null, '', paths.showcase);
  }
  return (
    <>
      <div className="showcase-source">
        <span className="recorded-tag">Recorded real API calls · Read-only</span>
      </div>
      <PageTitle
        eyebrow="REAL API EVIDENCE"
        subtitle="Genuine Gemini calls captured with the TraceAI SDK and persisted in D1. A curated snapshot, not live traffic or a benchmark."
      >
        Real measurements
      </PageTitle>
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
        <Link href={paths.demo}>explore the separate simulated dataset</Link>.
      </p>
    </>
  );
}
