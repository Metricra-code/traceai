'use client';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import type { MetricBucket } from '@traceai/shared';
export const COLORS = [1, 2, 3, 4, 5].map((number) => `var(--chart-${number})`);
export function MetricChart({
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
