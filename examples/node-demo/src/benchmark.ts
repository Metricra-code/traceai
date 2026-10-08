import { TraceAI } from '@traceai/sdk';

const iterations = 10_000;
const operation = async () => 42;
const options = { name: 'benchmark', provider: 'example', model: 'noop' };
const measure = async (run: () => Promise<number>, count: number) => {
  const samples: number[] = [];
  const started = performance.now();
  for (let index = 0; index < count; index++) {
    const before = performance.now();
    if ((await run()) !== 42) throw new Error('Operation result was not preserved');
    samples.push(performance.now() - before);
  }
  const elapsedMs = performance.now() - started;
  const sorted = [...samples].sort((first, second) => first - second);
  return { elapsedMs, meanMs: elapsedMs / count, p95Ms: sorted[Math.ceil(count * 0.95) - 1] ?? 0 };
};

await measure(operation, 500);
const baseline = await measure(operation, iterations);
let batches = 0;
let delivered = 0;
let dropped = 0;
const telemetry = new TraceAI({
  apiKey: crypto.randomUUID(),
  endpoint: 'http://localhost:8787',
  maxQueueSize: 1000,
  fetch: async (_url, init) => {
    batches++;
    delivered += (JSON.parse(String(init?.body)) as { events: unknown[] }).events.length;
    return new Response(null, { status: 202 });
  },
  onDiagnostic: (diagnostic) => {
    if (diagnostic.code === 'queue_full' || diagnostic.code === 'delivery_failed')
      dropped += diagnostic.count;
  },
});
const wrapped = await measure(() => telemetry.trace(options, operation), iterations);
await telemetry.shutdown();
const runtime = globalThis as typeof globalThis & { Bun?: { version: string } };
console.log(
  JSON.stringify(
    {
      runtime: runtime.Bun ? `Bun ${runtime.Bun.version}` : `Node ${process.version}`,
      iterations,
      baseline,
      wrapped,
      batches,
      delivered,
      dropped,
      network: 'stub transport; no provider or API contacted',
    },
    null,
    2,
  ),
);
if (delivered !== iterations || dropped !== 0)
  throw new Error('Benchmark lost telemetry; do not report this run as representative');
