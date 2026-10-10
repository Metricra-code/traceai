import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = join(root, '.local', 'packages', randomUUID());
const consumer = await mkdtemp(join(tmpdir(), 'traceai-package-consumer-'));
const run = async (command: string, args: string[], cwd: string) =>
  execute(command, args, { cwd, maxBuffer: 2 * 1024 * 1024 });
const installedVersion = async (name: string) =>
  (
    JSON.parse(await readFile(join(root, 'node_modules', name, 'package.json'), 'utf8')) as {
      version: string;
    }
  ).version;
const fixture = String.raw`
import assert from 'node:assert/strict';
import { TraceAI } from '@akai_80percent/traceai-sdk';
import { TraceAIExporter } from '@traceai/opentelemetry';
import { SpanStatusCode } from '@opentelemetry/api';
import { BasicTracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
const uploaded = [];
const config = {
  apiKey: 'test-only', endpoint: 'http://localhost:8787',
  fetch: async (_url, init) => {
    const events = JSON.parse(String(init?.body)).events;
    assert.ok(events.length <= 50);
    uploaded.push(...events);
    return new Response('{}', { status: 202 });
  },
};
const options = { name: 'pack-check', provider: 'example', model: 'mock' };
const sdk = new TraceAI(config);
const result = Object.freeze({ original: true });
assert.equal(await sdk.trace(options, async span => { span.setUsage({ inputTokens: 1, outputTokens: 2 }); return result; }), result);
const error = new Error('do-not-export');
await assert.rejects(sdk.trace({ ...options, errorSummary: () => 'Safe failure token=do-not-export' }, async () => { throw error; }), value => value === error);
const receipt = sdk.record({ ...options, traceId: 'packed_completed', status: 'success', startedAt: '2026-10-09T00:00:00Z', endedAt: '2026-10-09T00:00:01Z', durationMs: 1000 });
await sdk.flush();
assert.deepEqual(await receipt, { status: 'delivered' });
await sdk.shutdown();
assert.equal(uploaded.length, 3);
assert.ok(!JSON.stringify(uploaded).includes('do-not-export'));
const sdkEvents = uploaded.length;
const exporter = new TraceAIExporter(config);
const provider = new BasicTracerProvider({ spanProcessors: [new BatchSpanProcessor(exporter, { maxExportBatchSize: 50, scheduledDelayMillis: 60000 })] });
const tracer = provider.getTracer('isolated-package-check');
const ids = [];
for (const failed of [false, true]) {
  const span = tracer.startSpan('do-not-export', { attributes: {
    'gen_ai.operation.name': 'chat', 'gen_ai.provider.name': 'example', 'gen_ai.request.model': 'mock',
    'gen_ai.input.messages': 'do-not-export', 'gen_ai.usage.input_tokens': 120, 'gen_ai.usage.output_tokens': 40,
  } });
  const context = span.spanContext();
  ids.push('otel_' + context.traceId + '_' + context.spanId);
  if (failed) span.setStatus({ code: SpanStatusCode.ERROR, message: 'do-not-export' });
  span.end();
}
await provider.forceFlush();
await provider.shutdown();
assert.equal(uploaded.length - sdkEvents, 2);
assert.deepEqual(uploaded.slice(sdkEvents).map(event => event.traceId), ids);
assert.ok(!JSON.stringify(uploaded).includes('do-not-export'));
console.log(JSON.stringify({ runtime: typeof Bun === 'undefined' ? process.version : 'Bun ' + Bun.version, sdkEvents, otelEvents: 2, passed: true }));
`;
const typesFixture = `
import { TraceAI, type CompletedTrace, type TraceOptions, type DeliveryResult, sanitizeErrorSummary, snapshotTraceMetadata } from '@akai_80percent/traceai-sdk';
import { TraceAIExporter, type TraceAIExporterOptions } from '@traceai/opentelemetry';
import type { SpanExporter } from '@opentelemetry/sdk-trace-base';
const config: TraceAIExporterOptions = { apiKey: 'type-test', endpoint: 'http://localhost:8787', metadata: () => ({ scalar: true }) };
const exporter: SpanExporter = new TraceAIExporter(config);
const options: TraceOptions = { name: 'chat', provider: 'example', model: 'mock', errorSummary: () => 'Safe summary' };
const event: CompletedTrace = { ...options, traceId: 'typecheck', status: 'success', startedAt: '2026-10-09T00:00:00Z', endedAt: '2026-10-09T00:00:00Z', durationMs: 0, errorSummary: undefined };
const sdk = new TraceAI(config);
const receipt: Promise<DeliveryResult> = sdk.record(event);
void receipt; void exporter; void sanitizeErrorSummary('safe'); void snapshotTraceMetadata({ scalar: true });
`;
try {
  await mkdir(artifacts, { recursive: true });
  for (const name of ['sdk', 'opentelemetry']) {
    const directory = join(root, 'packages', name);
    const declarations = await readFile(join(directory, 'dist', 'index.d.ts'), 'utf8');
    if (declarations.includes('@traceai/shared'))
      throw new Error(`Private workspace leaked into ${name} declarations`);
    await run(
      'bun',
      ['pm', 'pack', '--filename', join(artifacts, `${name}.tgz`), '--ignore-scripts', '--quiet'],
      directory,
    );
  }
  await writeFile(
    join(consumer, 'package.json'),
    JSON.stringify(
      {
        name: 'traceai-isolated-package-verification',
        private: true,
        type: 'module',
        dependencies: {
          '@akai_80percent/traceai-sdk': `file:${join(artifacts, 'sdk.tgz')}`,
          '@traceai/opentelemetry': `file:${join(artifacts, 'opentelemetry.tgz')}`,
          '@opentelemetry/api': '1.9.1',
          '@opentelemetry/sdk-trace-base': '2.12.0',
        },
        // Verify the current workspace SDK artifact with the adapter, independently of registry releases.
        overrides: { '@akai_80percent/traceai-sdk': `file:${join(artifacts, 'sdk.tgz')}` },
        devDependencies: {
          typescript: await installedVersion('typescript'),
          '@types/node': await installedVersion('@types/node'),
        },
      },
      null,
      2,
    ),
  );
  await run('bun', ['install', '--ignore-scripts'], consumer);
  for (const name of ['@akai_80percent/traceai-sdk', '@traceai/opentelemetry']) {
    const directory = join(consumer, 'node_modules', name);
    await readFile(join(directory, 'LICENSE'), 'utf8');
    await readFile(join(directory, 'README.md'), 'utf8');
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    for (const [dependency, version] of Object.entries({
      ...manifest.dependencies,
      ...manifest.peerDependencies,
    })) {
      if (dependency === '@traceai/shared' || version.startsWith('workspace:'))
        throw new Error(`Private runtime dependency in ${name}`);
    }
  }
  await writeFile(join(consumer, 'check.mjs'), fixture);
  await writeFile(join(consumer, 'check.ts'), typesFixture);
  await writeFile(
    join(consumer, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        skipLibCheck: false,
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        lib: ['ES2022', 'DOM'],
        types: ['node'],
      },
      include: ['check.ts'],
    }),
  );
  await run('bun', ['run', '--bun', 'tsc', '--noEmit'], consumer);
  const bun = await run('bun', ['check.mjs'], consumer);
  const node = await run('node', ['check.mjs'], consumer);
  console.log(bun.stdout.trim());
  console.log(node.stdout.trim());
  console.log(
    JSON.stringify({
      passed: true,
      tarballs: artifacts,
      isolatedTypes: true,
      licenseIncluded: true,
      published: false,
    }),
  );
} finally {
  // Remove only this run's external temporary consumer; retain ignored tarballs for inspection.
  await rm(consumer, { recursive: true, force: true });
}
