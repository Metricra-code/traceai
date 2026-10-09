import { cpus, totalmem } from 'node:os';
import { TraceAI } from '@akai_80percent/traceai-sdk';

const iterations = 10_000;
const warmupIterations = 1000;
const repeats = 5;
const operation = async () => 42;
const options = { name: 'benchmark', provider: 'example', model: 'noop' };
const measure = async (
  run: () => Promise<number>,
  count: number,
  concurrency: number,
  afterChunk?: () => Promise<void>,
) => {
  const samples: number[] = [];
  let elapsedMs = 0;
  for (let index = 0; index < count; index += concurrency) {
    const started = performance.now();
    await Promise.all(
      Array.from({ length: Math.min(concurrency, count - index) }, async () => {
        const before = performance.now();
        if ((await run()) !== 42) throw new Error('Operation result was not preserved');
        samples.push(performance.now() - before);
      }),
    );
    elapsedMs += performance.now() - started;
    // Drain between concurrent waves to measure wrapper overhead without overflowing a bounded queue.
    await afterChunk?.();
  }
  const sorted = [...samples].sort((first, second) => first - second);
  return { elapsedMs, meanMs: elapsedMs / count, p95Ms: sorted[Math.ceil(count * 0.95) - 1] ?? 0 };
};
const results = [];
for (const concurrency of [1, 50, 1000]) {
  for (let repeat = 1; repeat <= repeats; repeat++) {
    let batches = 0;
    let delivered = 0;
    let dropped = 0;
    const client = new TraceAI({
      apiKey: 'bench-test',
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
    const drainWave = concurrency > 1 ? () => client.flush() : undefined;
    await measure(operation, warmupIterations, concurrency);
    await measure(() => client.trace(options, operation), warmupIterations, concurrency, drainWave);
    await client.flush();
    batches = 0;
    delivered = 0;
    dropped = 0;
    const baseline = await measure(operation, iterations, concurrency);
    const wrapped = await measure(
      () => client.trace(options, operation),
      iterations,
      concurrency,
      drainWave,
    );
    await client.shutdown();
    if (delivered !== iterations || dropped !== 0)
      throw new Error('Benchmark lost telemetry; this run is not representative');
    results.push({
      concurrency,
      repeat,
      baseline,
      wrapped,
      addedMeanMs: wrapped.meanMs - baseline.meanMs,
      batches,
      delivered,
      dropped,
    });
  }
}
const runtime = globalThis as typeof globalThis & { Bun?: { version: string } };
console.log(
  JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      runtime: runtime.Bun ? `Bun ${runtime.Bun.version}` : `Node ${process.version}`,
      hardware: {
        cpu: cpus()[0]?.model ?? 'unknown',
        logicalCpus: cpus().length,
        architecture: process.arch,
        platform: process.platform,
        memoryGiB: totalmem() / 1024 ** 3,
      },
      iterations,
      warmupIterationsPerPath: warmupIterations,
      repeats,
      network: 'stub HTTP acceptance; no provider or API contacted',
      scope:
        'wrapper/validation/serialization overhead; explicit between-wave drain time excluded; concurrent P95 includes wave scheduling, not just per-call CPU',
      results,
    },
    null,
    2,
  ),
);
