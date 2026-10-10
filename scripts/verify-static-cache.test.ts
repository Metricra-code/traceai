import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import config from '../apps/web/open-next.config';
import webPackage from '../apps/web/package.json';
import { dynamic, GET } from '../apps/web/src/app/api/[...path]/route';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const overrides = [
  config.default?.override,
  config.middleware && 'override' in config.middleware ? config.middleware.override : undefined,
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('prerendered shell cache configuration', () => {
  it('intercepts shells with the actual installed read-only static-assets cache', async () => {
    const require = createRequire(import.meta.url);
    const cachePath = require.resolve(
      '@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache',
      { paths: [join(root, 'apps/web')] },
    );
    const installed = (await import(/* @vite-ignore */ pathToFileURL(cachePath).href)) as {
      default: object;
    };

    expect(config.dangerous?.enableCacheInterception).toBe(true);
    for (const override of overrides) {
      const cache = override?.incrementalCache;
      expect(cache).toBeTypeOf('function');
      if (typeof cache !== 'function') throw new Error('Static cache override is missing.');
      expect(await cache()).toBe(installed.default);
    }
  });

  it('does not introduce a revalidation queue or a tag cache', () => {
    for (const override of overrides) {
      expect(override).toMatchObject({ queue: 'dummy', tagCache: 'dummy' });
    }
  });

  it('populates local static cache assets after building and before the environment guard', () => {
    expect(webPackage.scripts['build:cloudflare'].split(/\s*&&\s*/)).toEqual([
      'opennextjs-cloudflare build',
      'opennextjs-cloudflare populateCache local',
      'bun --no-env-file ../../scripts/verify-web-env.ts',
    ]);
  });
});

describe('private BFF cache isolation', () => {
  it('keeps API requests dynamic and bypasses caching on both sides of the proxy', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('TRACEAI_API_URL', 'http://127.0.0.1:8787');
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 401,
        headers: { 'Cache-Control': 'public, max-age=3600' },
      }),
    );

    const response = await GET(new Request('http://localhost:3000/api/auth/session'), {
      params: Promise.resolve({ path: ['auth', 'session'] }),
    });

    expect(dynamic).toBe('force-dynamic');
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(
      new URL('http://127.0.0.1:8787/v1/auth/session'),
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });
});
