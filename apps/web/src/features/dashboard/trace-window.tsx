type WindowMode = 'preset' | 'custom' | 'simulated' | 'retained';
const notes: Record<WindowMode, string> = {
  preset: 'Navigation keeps this window. Refresh data sets its cutoff to now.',
  custom: 'Refresh data reloads this fixed window.',
  simulated: 'Fixed simulated window, not live traffic.',
  retained: 'Retained for Overview, Traces and Models. It does not filter this page.',
};

export function TraceWindow({ from, to, mode }: { from: string; to: string; mode: WindowMode }) {
  return (
    <section className="trace-window" aria-label="Trace start window">
      <div className="trace-window-boundaries">
        <span>Trace start window (UTC)</span>
        <span className="trace-window-boundary">
          <span className="muted">From (inclusive)</span>
          <time dateTime={from} className="mono">
            {from.replace('T', ' ').replace('Z', '')}
          </time>
        </span>
        <span className="trace-window-boundary">
          <span className="muted">Before (exclusive)</span>
          <time dateTime={to} className="mono">
            {to.replace('T', ' ').replace('Z', '')}
          </time>
        </span>
      </div>
      <p id="trace-window-note" className="muted">
        {notes[mode]}
      </p>
    </section>
  );
}
