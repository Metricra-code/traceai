import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { z } from 'zod';

const registry = 'https://registry.npmjs.org/';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const execute = promisify(execFile);
const optionsSchema = z.object({
  package: z
    .string()
    .max(214)
    .regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/),
  version: z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/),
  tarball: z.string().refine((value) => isAbsolute(value) && value.endsWith('.tgz')),
});
type Options = z.infer<typeof optionsSchema>;
const registryReleaseSchema = z.object({
  name: z.string(),
  version: z.string(),
  dist: z.object({
    integrity: z.string().regex(/^sha512-[A-Za-z0-9+/]{86}==$/),
    tarball: z.string().url(),
  }),
});

/** Explicit inputs prevent guessing an npm scope or accidentally checking a moving dist-tag. */
export function parseVerificationOptions(args: readonly string[]): Options {
  const entries = args.map((argument) => {
    const match = /^--(package|version|tarball)=(.+)$/.exec(argument);
    if (!match) throw new Error('Expected explicit package, version and tarball options.');
    return [match[1]!, match[2]!] as const;
  });
  if (entries.length !== 3 || new Set(entries.map(([name]) => name)).size !== 3)
    throw new Error('Expected each verification option exactly once.');
  return optionsSchema.parse(Object.fromEntries(entries));
}

export function verifyIntegrity(bytes: Uint8Array, expected: string): void {
  const actual = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  if (actual !== expected) throw new Error('SDK tarball integrity mismatch.');
}

export function validateRegistryRelease(value: unknown, options: Options) {
  const release = registryReleaseSchema.parse(value);
  const url = new URL(release.dist.tarball);
  if (
    release.name !== options.package ||
    release.version !== options.version ||
    url.origin !== 'https://registry.npmjs.org' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Unexpected SDK registry release or tarball location.');
  return release;
}

async function readPublicBytes(url: string, maximum: number): Promise<Uint8Array> {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
  if (!response.ok || !response.body) throw new Error('Public registry request failed.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, size);
      size += value.byteLength;
      if (size > maximum) throw new Error('Public registry response exceeded its bound.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export const runtimeFixture = (packageName: string) => `
import assert from 'node:assert/strict';
import { TraceAI } from ${JSON.stringify(packageName)};
const uploaded = [];
const config = {
  apiKey: 'test-only', endpoint: 'http://localhost:8787', maxAttempts: 1,
  fetch: async (_url, init) => {
    const events = JSON.parse(String(init.body)).events;
    assert.ok(events.length <= 50);
    uploaded.push(...events);
    return new Response('{}', { status: 202 });
  },
};
const sdk = new TraceAI(config);
const options = { name: 'registry-check', provider: 'example', model: 'mock' };
const metadata = { feature: 'safe' };
const originalResult = Object.freeze({ privateOutput: 'private-sentinel' });
assert.equal(await sdk.trace({ ...options, metadata }, async span => {
  span.setUsage({ inputTokens: 1, outputTokens: 2 });
  return originalResult;
}), originalResult);
metadata.feature = 'modified';
const originalError = new Error('private-sentinel');
await assert.rejects(sdk.trace({ ...options, errorSummary: () => 'Controlled failure token=private-sentinel' }, async () => {
  throw originalError;
}), error => error === originalError);
const receipt = sdk.record({ ...options, traceId: 'registry_completed', status: 'success',
  startedAt: '2026-10-10T00:00:00Z', endedAt: '2026-10-10T00:00:01Z', durationMs: 1000 });
await sdk.flush();
assert.deepEqual(await receipt, { status: 'delivered' });
await sdk.shutdown();
assert.equal(uploaded.length, 3);
assert.deepEqual(uploaded[0].metadata, { feature: 'safe' });
assert.equal(uploaded[0].inputTokens, 1);
assert.equal(uploaded[0].outputTokens, 2);
assert.ok(!JSON.stringify(uploaded).includes('private-sentinel'));
let releaseUpload;
const gate = new Promise(resolve => { releaseUpload = resolve; });
const nonBlocking = new TraceAI({ ...config, batchSize: 1, fetch: async () => {
  await gate;
  return new Response(null, { status: 202 });
} });
try {
  assert.equal(await nonBlocking.trace(options, async () => originalResult), originalResult);
} finally {
  releaseUpload();
  await nonBlocking.shutdown();
}
const rejected = new TraceAI({ ...config, fetch: async () => new Response(null, { status: 401 }) });
const dropped = rejected.record({ ...options, traceId: 'registry_rejected', status: 'success',
  startedAt: '2026-10-10T00:00:00Z', endedAt: '2026-10-10T00:00:00Z', durationMs: 0 });
await rejected.shutdown();
assert.deepEqual(await dropped, { status: 'dropped', reason: 'delivery_failed' });
console.log(JSON.stringify({ runtime: typeof Bun === 'undefined' ? process.version : 'Bun ' + Bun.version,
  sdkEvents: uploaded.length, privacy: true, passed: true, transport: 'stub HTTP acknowledgment, not D1 proof' }));
`;
const typeFixture = (packageName: string) => `
import { TraceAI, type TraceOptions, type CompletedTrace, type DeliveryResult,
  sanitizeErrorSummary, snapshotTraceMetadata } from ${JSON.stringify(packageName)};
const sdk = new TraceAI({ apiKey: 'type-test', endpoint: 'http://localhost:8787' });
const options: TraceOptions = { name: 'typecheck', provider: 'example', model: 'mock', errorSummary: () => 'Safe failure' };
const event: CompletedTrace = { name: options.name, provider: options.provider, model: options.model,
  traceId: 'registry_types', status: 'success', startedAt: '2026-10-10T00:00:00Z', endedAt: '2026-10-10T00:00:00Z', durationMs: 0 };
const receipt: Promise<DeliveryResult> = sdk.record(event);
void receipt; void sanitizeErrorSummary('safe'); void snapshotTraceMetadata({ scalar: true });
`;

const installedVersion = async (name: string): Promise<string> =>
  (
    JSON.parse(await readFile(join(root, 'node_modules', name, 'package.json'), 'utf8')) as {
      version: string;
    }
  ).version;

function isolatedEnvironment(consumer: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: consumer,
    XDG_CONFIG_HOME: join(consumer, 'config'),
    XDG_CACHE_HOME: join(consumer, 'cache'),
    BUN_INSTALL_CACHE_DIR: join(consumer, 'cache'),
    NO_COLOR: '1',
  };
}

async function prepareConsumer(consumer: string, options: Options): Promise<void> {
  const manifest = {
    name: 'traceai-public-registry-verification',
    private: true,
    type: 'module',
    dependencies: { [options.package]: options.version },
    devDependencies: {
      typescript: await installedVersion('typescript'),
      '@types/node': await installedVersion('@types/node'),
    },
  };
  await writeFile(join(consumer, 'package.json'), JSON.stringify(manifest));
  await writeFile(join(consumer, 'check.mjs'), runtimeFixture(options.package));
  await writeFile(join(consumer, 'check.ts'), typeFixture(options.package));
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
}

async function checkInstalledPackage(consumer: string, options: Options): Promise<void> {
  const directory = join(consumer, 'node_modules', options.package);
  assert.ok(
    (await realpath(directory)).startsWith(consumer + sep),
    'External workspace link found.',
  );
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
    dependencies?: Record<string, string>;
  };
  assert.equal(manifest.name, options.package);
  assert.equal(manifest.version, options.version);
  assert.deepEqual(Object.keys(manifest.dependencies ?? {}), ['zod']);
  assert.ok(
    !Object.values(manifest.dependencies ?? {}).some((value) => value.startsWith('workspace:')),
  );
  assert.ok(
    !(await readFile(join(directory, 'dist/index.d.ts'), 'utf8')).includes('@traceai/shared'),
  );
  await readFile(join(directory, 'LICENSE'), 'utf8');
  await readFile(join(directory, 'README.md'), 'utf8');
}

export async function verifyNpmSdk(options: Options): Promise<void> {
  const metadataUrl = `${registry}${encodeURIComponent(options.package)}/${options.version}`;
  const release = validateRegistryRelease(
    JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        await readPublicBytes(metadataUrl, 256 * 1024),
      ),
    ),
    options,
  );
  verifyIntegrity(await readFile(options.tarball), release.dist.integrity);
  verifyIntegrity(
    await readPublicBytes(release.dist.tarball, 2 * 1024 * 1024),
    release.dist.integrity,
  );
  const consumer = await mkdtemp(join(tmpdir(), 'traceai-npm-sdk-'));
  const run = (command: string, args: string[]) =>
    execute(command, args, {
      cwd: consumer,
      env: isolatedEnvironment(consumer),
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });
  try {
    await prepareConsumer(consumer, options);
    await run('bun', ['install', '--ignore-scripts', '--no-cache', `--registry=${registry}`]);
    await checkInstalledPackage(consumer, options);
    await run('bun', ['run', '--bun', 'tsc', '--noEmit']);
    const bun = await run('bun', ['check.mjs']);
    const node = await run('node', ['check.mjs']);
    console.log(bun.stdout.trim());
    console.log(node.stdout.trim());
    console.log(
      JSON.stringify({
        package: options.package,
        version: options.version,
        registry,
        integrity: release.dist.integrity,
        exactVerifiedTarball: true,
        registryConsumerVerified: true,
        strictPublicTypes: true,
        sdkOnly: true,
        publishedByThisScript: false,
      }),
    );
  } finally {
    await rm(consumer, { recursive: true, force: true });
  }
}

// Importing helpers for offline tests never contacts a registry or reads authentication files.
if ((import.meta as ImportMeta & { main?: boolean }).main) {
  try {
    await verifyNpmSdk(parseVerificationOptions(process.argv.slice(2)));
  } catch {
    console.error(
      'Public SDK verification failed. Check explicit options, registry release, integrity and consumer checks. No authentication or provider calls are performed.',
    );
    process.exitCode = 1;
  }
}
