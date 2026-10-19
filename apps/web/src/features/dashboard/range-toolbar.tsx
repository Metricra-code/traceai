'use client';
import { useState, type FormEvent } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import type { Project } from '@traceai/shared';
import type { NavigationState } from './navigation';
import { TraceWindow } from './trace-window';

export function RangeToolbar({
  demo,
  project,
  apiBase,
  navigation,
  windowView,
  navigate,
}: {
  demo: boolean;
  project: Project;
  apiBase: string;
  navigation: NavigationState;
  windowView: boolean;
  navigate: (next: NavigationState, replace?: boolean) => void;
}) {
  const cache = useQueryClient();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [customEditing, setCustomEditing] = useState(false);
  const [rangeError, setRangeError] = useState('');
  const viewKey = `${pathname}?${searchParams.toString()}`;
  const [editorViewKey, setEditorViewKey] = useState(viewKey);
  // Discard unapplied editor state when navigation restores another snapshot.
  if (editorViewKey !== viewKey) {
    setEditorViewKey(viewKey);
    setCustomEditing(false);
    setRangeError('');
  }
  const refreshing = useIsFetching({ queryKey: [apiBase] }) > 0;
  const { from, to } = navigation;
  function refresh() {
    if (navigation.range === 'custom' || !windowView) {
      void cache.invalidateQueries({ queryKey: [apiBase] });
      return;
    }
    // Mark old snapshots stale without refetching a range we are about to replace.
    void cache.invalidateQueries({ queryKey: [apiBase], refetchType: 'none' });
    const finish = new Date().toISOString();
    navigate(
      {
        ...navigation,
        from: new Date(Date.parse(finish) - Number(navigation.range) * 86_400_000).toISOString(),
        to: finish,
        cursor: '',
      },
      true,
    );
  }
  function applyRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const start = new Date(`${String(fields.get('from'))}:00Z`);
    const finish = new Date(`${String(fields.get('to'))}:00Z`);
    const distance = finish.getTime() - start.getTime();
    if (!Number.isFinite(distance) || distance <= 0 || distance > 31 * 86_400_000) {
      setRangeError('Choose an increasing UTC range of at most 31 days.');
      return;
    }
    navigate({
      ...navigation,
      from: start.toISOString(),
      to: finish.toISOString(),
      range: 'custom',
      cursor: '',
    });
    setCustomEditing(false);
    setRangeError('');
  }
  return (
    <>
      <div className="view-toolbar">
        {demo ? (
          <span className="simulated-tag">Simulated data · Read-only</span>
        ) : (
          <span className="muted small">{project.description || 'Application telemetry'}</span>
        )}
        <div className="range-control">
          {!demo && (
            <button disabled={refreshing} onClick={refresh} aria-describedby="trace-window-note">
              Refresh data
            </button>
          )}
          <span className="muted small">UTC</span>
          <select
            aria-label="Date range"
            aria-describedby="trace-window-note"
            value={customEditing ? 'custom' : navigation.range}
            onChange={(e) => {
              setRangeError('');
              if (e.target.value === 'custom') setCustomEditing(true);
              else {
                setCustomEditing(false);
                const range = e.target.value as '1' | '7' | '30';
                navigate({
                  ...navigation,
                  from: new Date(Date.parse(to) - Number(range) * 86_400_000).toISOString(),
                  range,
                  cursor: '',
                });
              }
            }}
          >
            <option value="1">Last 24 hours</option>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="custom">Custom range</option>
          </select>
        </div>
      </div>
      <TraceWindow
        from={from}
        to={to}
        mode={
          !windowView
            ? 'retained'
            : demo
              ? 'simulated'
              : navigation.range === 'custom'
                ? 'custom'
                : 'preset'
        }
      />
      {(customEditing || navigation.range === 'custom') && (
        <form className="custom-range" onSubmit={applyRange} key={`${viewKey}:${from}:${to}`}>
          <label>
            From (UTC)
            <input name="from" type="datetime-local" defaultValue={from.slice(0, 16)} required />
          </label>
          <label>
            To (UTC)
            <input name="to" type="datetime-local" defaultValue={to.slice(0, 16)} required />
          </label>
          <button type="submit">Apply range</button>
          {rangeError && <p role="alert">{rangeError}</p>}
        </form>
      )}
    </>
  );
}
