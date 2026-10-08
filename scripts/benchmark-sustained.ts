import { percentile } from '../packages/shared/src/index';
import { setTimeout as delay } from 'node:timers/promises';

const endpoint = new URL(process.env.TRACEAI_ENDPOINT ?? 'http://127.0.0.1:8787');
if (
  !['https:', 'http:'].includes(endpoint.protocol) ||
  endpoint.username ||
  endpoint.password ||
  endpoint.pathname !== '/' ||
  endpoint.search ||
  endpoint.hash
)
  throw new Error('Use a credential-free API HTTP(S) origin.');
const samples = Number(process.env.TRACEAI_BENCHMARK_SAMPLES ?? 30);
const intervalMs = Number(process.env.TRACEAI_BENCHMARK_INTERVAL_MS ?? 2000);
if (!Number.isInteger(samples) || samples < 10 || samples > 120)
  throw new Error('Use 10–120 samples to bound public-demo reads.');
if (!Number.isInteger(intervalMs) || intervalMs < 500 || intervalMs > 5000)
  throw new Error(
    'Use a 500–5000ms interval; this is an observation, not an unbounded load generator.',
  );

const metadataResponse = await fetch(new URL('/v1/demo', endpoint));
if (!metadataResponse.ok) throw new Error(`Demo metadata: HTTP ${metadataResponse.status}`);
const { anchor } = (await metadataResponse.json()) as { anchor: string };
const end = Date.parse(anchor) + 1;
if (!Number.isFinite(end)) throw new Error('Demo anchor is not a valid timestamp.');
const query = new URLSearchParams({
  from: new Date(end - 30 * 86_400_000).toISOString(),
  to: new Date(end).toISOString(),
});
const paths = ['overview', 'metrics', 'models', 'traces'] as const;
const results: { path: string; status: number; durationMs: number }[] = [];
const started = performance.now();
for (let index = 0; index < samples; index++) {
  const due = started + index * intervalMs;
  await delay(Math.max(0, due - performance.now()));
  const path = paths[index % paths.length]!;
  const requestStarted = performance.now();
  try {
    const response = await fetch(new URL(`/v1/demo/${path}?${query}`, endpoint), {
      signal: AbortSignal.timeout(15_000),
    });
    await response.arrayBuffer();
    results.push({ path, status: response.status, durationMs: performance.now() - requestStarted });
  } catch {
    // A network failure is a failed sample, not silently omitted from latency evidence.
    results.push({ path, status: 0, durationMs: performance.now() - requestStarted });
  }
}
const sorted = results.map((item) => item.durationMs).sort((a, b) => a - b);
const statuses = Object.fromEntries(
  Array.from(new Set(results.map((item) => item.status))).map((status) => [
    status,
    results.filter((item) => item.status === status).length,
  ]),
);
console.log(
  JSON.stringify(
    {
      endpoint: endpoint.origin,
      measuredAt: new Date().toISOString(),
      scope:
        'Read-only 30-day/10k simulated demo. Sequential rotating overview/metrics/models/traces at fixed start interval. Includes first request and failed samples, client network/body time; no writes. Short modest-traffic observation, not a soak/load test, edge CPU measurement or SLA.',
      samples,
      intervalMs,
      observedDurationMs: Math.round(performance.now() - started),
      statuses,
      p50Ms: Math.round(percentile(sorted, 0.5)),
      p95Ms: Math.round(percentile(sorted, 0.95)),
      maximumMs: Math.round(sorted.at(-1)!),
      endpoints: paths.map((path) => ({
        path,
        samples: results.filter((item) => item.path === path).length,
      })),
    },
    null,
    2,
  ),
);
if (results.some((item) => item.status !== 200)) process.exitCode = 1;
