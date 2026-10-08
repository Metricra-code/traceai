import { percentile } from '../packages/shared/src/index';
const endpoint = process.env.TRACEAI_ENDPOINT ?? 'http://127.0.0.1:8787';
const samples = Number(process.env.TRACEAI_BENCHMARK_SAMPLES ?? 20);
if (!Number.isInteger(samples) || samples < 5 || samples > 30)
  throw new Error('Use between 5 and 30 samples.');
const metadataResponse = await fetch(`${endpoint}/v1/demo`);
if (!metadataResponse.ok) throw new Error(`Demo metadata: HTTP ${metadataResponse.status}`);
const metadata = (await metadataResponse.json()) as { anchor: string };
const to = new Date(Date.parse(metadata.anchor) + 1).toISOString();
const from = new Date(Date.parse(to) - 30 * 86_400_000).toISOString();
const query = new URLSearchParams({ from, to });
const result: Record<string, unknown> = {};
for (const path of ['overview', 'metrics', 'models', 'traces']) {
  const times: number[] = [];
  for (let index = 0; index <= samples; index++) {
    const started = performance.now();
    const response = await fetch(`${endpoint}/v1/demo/${path}?${query}`);
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    await response.json();
    if (index) times.push(performance.now() - started); // Exclude one warm-up request.
  }
  const sorted = [...times].sort((a, b) => a - b);
  result[path] = {
    samples,
    p50Ms: Math.round(percentile(sorted, 0.5)),
    p95Ms: Math.round(percentile(sorted, 0.95)),
    maxMs: Math.round(sorted.at(-1)!),
  };
}
console.log(
  JSON.stringify(
    {
      endpoint,
      measuredAt: new Date().toISOString(),
      window: { from, to },
      scope:
        '30-day simulated 10,000-event dataset; client-observed round-trip including network/JSON; warm-up excluded; not an SLA or CPU metric',
      result,
    },
    null,
    2,
  ),
);
