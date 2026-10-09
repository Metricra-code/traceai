import { createRequire } from 'node:module';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WebEnvironmentError,
  validateWebEnvSnapshot,
  verifyWebEnvironment,
} from './verify-web-env';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const snapshot = (variables: Record<string, string> = {}) =>
  ['production', 'development', 'test']
    .map((mode) => `export const ${mode} = ${JSON.stringify(variables)};`)
    .join('\n') + '\n';
const temporaryDirectories: string[] = [];
const createFixture = async () => {
  const monorepoRoot = await mkdtemp(join(tmpdir(), 'traceai-env-guard-'));
  temporaryDirectories.push(monorepoRoot);
  const appPath = join(monorepoRoot, 'apps/web');
  const outputDir = join(monorepoRoot, 'output');
  await mkdir(appPath, { recursive: true });
  return { monorepoRoot, appPath, outputDir };
};
const compiledFile = (fixture: Awaited<ReturnType<typeof createFixture>>) =>
  join(fixture.outputDir, 'cloudflare/next-env.mjs');
const loadInstalledCompiler = async () => {
  const require = createRequire(import.meta.url);
  const entry = require.resolve('@opennextjs/cloudflare', { paths: [join(root, 'apps/web')] });
  const moduleUrl = pathToFileURL(
    join(dirname(entry), '../cli/build/open-next/compile-env-files.js'),
  ).href;
  return (await import(/* @vite-ignore */ moduleUrl)) as {
    compileEnvFiles(options: { monorepoRoot: string; appPath: string; outputDir: string }): void;
  };
};

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const path of temporaryDirectories.splice(0))
    await rm(path, { recursive: true, force: true });
});

describe('compiled Worker environment guard', () => {
  it('accepts all three empty or explicitly public configuration snapshots', () => {
    expect(() => validateWebEnvSnapshot(snapshot())).not.toThrow();
    expect(() =>
      validateWebEnvSnapshot(
        snapshot({ NEXT_PUBLIC_SITE_NAME: 'TraceAI', TRACEAI_API_URL: 'https://api.example' }),
      ),
    ).not.toThrow();
  });
  it.each([
    'GEMINI_API_KEY',
    'TRACEAI_API_KEY',
    'APIKEY',
    'OPENAI_API_KEY',
    'CLOUDFLARE_API_TOKEN',
    'SESSION_SECRET',
    'PASSWORD',
    'SERVICE_CREDENTIALS',
    'NEXT_PUBLIC_GEMINI_API_KEY',
    'NEXT_PUBLIC_ACCESS_TOKEN',
    'private_secret',
  ])('rejects credential variable names in every compiled mode: %s', (name) => {
    expect(() => validateWebEnvSnapshot(snapshot({ [name]: 'test-only' }))).toThrow(
      WebEnvironmentError,
    );
    try {
      validateWebEnvSnapshot(snapshot({ [name]: 'test-only' }));
    } catch (error) {
      expect(error).toMatchObject({ code: 'credentials_in_snapshot', blockedNames: [name] });
      expect(String(error)).not.toContain('test-only');
    }
  });
  it('rejects a secret present only in the development export because it is still bundled', () => {
    const source = snapshot().replace(
      'export const development = {};',
      'export const development = {"GEMINI_API_KEY":"test-only"};',
    );
    expect(() => validateWebEnvSnapshot(source)).toThrow(WebEnvironmentError);
  });
  it('deduplicates and sorts blocked names without retaining their values', () => {
    try {
      validateWebEnvSnapshot(
        snapshot({ TRACEAI_API_KEY: 'trace-test', GEMINI_API_KEY: 'gem-test' }),
      );
    } catch (error) {
      expect(error).toMatchObject({ blockedNames: ['GEMINI_API_KEY', 'TRACEAI_API_KEY'] });
      expect(JSON.stringify(error)).not.toContain('trace-test');
      expect(JSON.stringify(error)).not.toContain('gem-test');
    }
  });
  it.each([
    '',
    'export const production = {};',
    snapshot() + 'export const production = {};\n',
    snapshot().replace('export const test', 'export const production'),
    snapshot().replace('export const test = {};', 'export const test = dangerousCode();'),
    snapshot().replace('export const test = {};', 'export const test = {"KEY":"invalid JSON";};'),
    snapshot().replace('export const test = {};', 'export const test = {"GEMINI_API_KEY":42};'),
    snapshot().replace(
      'export const test = {};',
      'export const test = {"invalid\\nname":"test-only"};',
    ),
    snapshot() + 'globalThis.privateLeak = true;\n',
    ' '.repeat(1024 * 1024 + 1),
  ])('fails closed on malformed, changed or overbound generated code: %j', (source) => {
    expect(() => validateWebEnvSnapshot(source)).toThrow(WebEnvironmentError);
  });
  it('never executes additional generated code', () => {
    const executeCanary = vi.fn();
    const source = snapshot() + `executeCanary();\n`;
    expect(() => validateWebEnvSnapshot(source)).toThrow(WebEnvironmentError);
    expect(executeCanary).not.toHaveBeenCalled();
  });
  it('checks the actual file and fails closed when it is missing', async () => {
    const fixture = await createFixture();
    await expect(verifyWebEnvironment(compiledFile(fixture))).rejects.toMatchObject({
      code: 'missing_snapshot',
    });
    await mkdir(dirname(compiledFile(fixture)), { recursive: true });
    await writeFile(compiledFile(fixture), snapshot());
    await expect(verifyWebEnvironment(compiledFile(fixture))).resolves.toBeUndefined();
  });
  it('does not expose file contents when schema validation fails', async () => {
    const fixture = await createFixture();
    await mkdir(dirname(compiledFile(fixture)), { recursive: true });
    await writeFile(compiledFile(fixture), snapshot().replace('{}', '{"GEMINI_API_KEY":123}'));
    await expect(verifyWebEnvironment(compiledFile(fixture))).rejects.toMatchObject({
      code: 'invalid_snapshot',
      blockedNames: [],
    });
  });
});

describe('actual installed OpenNext dotenv serialization regression', () => {
  it('reproduces and blocks the real root .env.local serialization path with a fake canary', async () => {
    const fixture = await createFixture();
    await writeFile(
      join(fixture.monorepoRoot, '.env.local'),
      'GEMINI_API_KEY=test-only\nNEXT_PUBLIC_SITE_NAME=TraceAI\n',
    );
    const compiler = await loadInstalledCompiler();
    compiler.compileEnvFiles(fixture);
    const source = await readFile(compiledFile(fixture), 'utf8');
    expect(source).toContain('GEMINI_API_KEY');
    expect(source).toContain('test-only');
    await expect(verifyWebEnvironment(compiledFile(fixture))).rejects.toMatchObject({
      code: 'credentials_in_snapshot',
      blockedNames: ['GEMINI_API_KEY'],
    });
  });
  it('keeps an explicitly loaded .local/gemini.env outside adapter discovery', async () => {
    const fixture = await createFixture();
    await mkdir(join(fixture.monorepoRoot, '.local'));
    await writeFile(
      join(fixture.monorepoRoot, '.local/gemini.env'),
      'GEMINI_API_KEY=test-only\nTRACEAI_API_KEY=trace-test\n',
    );
    await writeFile(join(fixture.appPath, '.env.production'), 'NEXT_PUBLIC_SITE_NAME=TraceAI\n');
    const compiler = await loadInstalledCompiler();
    compiler.compileEnvFiles(fixture);
    const source = await readFile(compiledFile(fixture), 'utf8');
    expect(source).not.toContain('test-only');
    expect(source).not.toContain('trace-test');
    expect(source).not.toContain('GEMINI_API_KEY');
    await expect(verifyWebEnvironment(compiledFile(fixture))).resolves.toBeUndefined();
  });
  it('does not serialize an inherited env-only canary without an auto-discovered file', async () => {
    const fixture = await createFixture();
    // No reading of real environment values: Vitest restores this test-only variable afterward.
    vi.stubEnv('TRACEAI_GUARD_TEST_API_KEY', 'test-only');
    const compiler = await loadInstalledCompiler();
    compiler.compileEnvFiles(fixture);
    expect(await readFile(compiledFile(fixture), 'utf8')).not.toContain('test-only');
    await expect(verifyWebEnvironment(compiledFile(fixture))).resolves.toBeUndefined();
    vi.unstubAllEnvs();
  });
  it('imports the guard without reading credentials or generated snapshots', async () => {
    vi.resetModules();
    const reads = vi.fn(() => {
      throw new Error('File reads are forbidden while importing.');
    });
    const stats = vi.fn(() => {
      throw new Error('File stats are forbidden while importing.');
    });
    vi.doMock('node:fs/promises', () => ({ readFile: reads, stat: stats }));
    try {
      const imported = await import('./verify-web-env');
      expect(imported.verifyWebEnvironment).toBeTypeOf('function');
      expect(reads).not.toHaveBeenCalled();
      expect(stats).not.toHaveBeenCalled();
    } finally {
      vi.doUnmock('node:fs/promises');
      vi.resetModules();
    }
  });
});
