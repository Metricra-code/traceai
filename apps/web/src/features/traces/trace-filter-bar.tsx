'use client';
import type { FormEvent } from 'react';
import type { ModelComparison } from '@traceai/shared';
import { useDashboard, type TraceFilters } from '@/features/dashboard';

export function TraceFilterBar({
  suggestions,
  manual,
}: {
  suggestions: ModelComparison[] | undefined;
  manual: boolean;
}) {
  const { navigation, updateFilters } = useDashboard();
  const { provider, model, status, traceId, sort } = navigation;
  const filters = { provider, model, status, traceId, sort };
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
  return (
    <div className="filters">
      {manual ? (
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
                !suggestions?.some((item) => item.provider === filters.provider) && (
                  <option value={filters.provider}>{filters.provider} (exact filter)</option>
                )}
              {Array.from(new Set(suggestions?.map((item) => item.provider))).map((item) => (
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
              {filters.model &&
                !suggestions?.some(
                  (item) =>
                    item.model === filters.model &&
                    (!filters.provider || item.provider === filters.provider),
                ) && <option value={filters.model}>{filters.model} (exact filter)</option>}
              {suggestions
                ?.filter((item) => !filters.provider || item.provider === filters.provider)
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
  );
}
