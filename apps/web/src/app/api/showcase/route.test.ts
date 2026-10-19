import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ShowcaseResponse } from '@/features/showcase';

afterEach(() => {
  vi.restoreAllMocks();
});

async function readShowcase(search = '', headers?: HeadersInit): Promise<Response> {
  const { GET } = await import('./route');
  return GET(new Request(`https://traceai.test/api/showcase${search}`, { headers }));
}

describe('isolated public showcase route', () => {
  it('returns the committed snapshot without network, auth or forwarded cookies', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'));
    const response = await readShowcase('', {
      cookie: 'session=PRIVATE_CANARY',
      authorization: 'Bearer PRIVATE_CANARY',
      origin: 'https://private.example',
    });
    const body = (await response.json()) as ShowcaseResponse;

    expect(response.status).toBe(200);
    expect(body.totalSamples).toBe(3);
    expect(body.items).toHaveLength(3);
    expect(fetch).not.toHaveBeenCalled();
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(JSON.stringify(body)).not.toContain('PRIVATE_CANARY');
  });

  it('exposes exactly the allowlisted sample and derived summary keys', async () => {
    const body = (await (await readShowcase()).json()) as ShowcaseResponse;
    expect(Object.keys(body).sort()).toEqual(
      ['source', 'snapshot', 'totalSamples', 'items', 'summary', 'models'].sort(),
    );
    for (const row of body.items) {
      expect(Object.keys(row).sort()).toEqual(
        ['model', 'durationMs', 'inputTokens', 'outputTokens', 'status', 'sampleNumber'].sort(),
      );
    }
    const summaryKeys = [
      'totalRequests',
      'successfulRequests',
      'failedRequests',
      'averageLatencyMs',
      'p50LatencyMs',
      'p95LatencyMs',
      'inputTokens',
      'outputTokens',
    ];
    expect(Object.keys(body.summary).sort()).toEqual(summaryKeys.sort());
    for (const model of body.models)
      expect(Object.keys(model).sort()).toEqual([...summaryKeys, 'model'].sort());
  });

  it('keeps responses dynamic, uncached and non-sniffable', async () => {
    const { dynamic } = await import('./route');
    const response = await readShowcase();
    expect(dynamic).toBe('force-dynamic');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it.each([
    '?projectId=PRIVATE_CANARY',
    '?model=a&model=b',
    '?status=PRIVATE_CANARY',
    '?sort=newest',
  ])('returns a generic 400 for invalid filters without echoing input: %s', async (search) => {
    const response = await readShowcase(search);
    expect(response.status).toBe(400);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.text()).not.toContain('PRIVATE_CANARY');
  });

  it('filters the actual route response without falling back to demo data', async () => {
    const response = await readShowcase('?model=definitely-not-recorded');
    const body = (await response.json()) as ShowcaseResponse;
    expect(response.status).toBe(200);
    expect(body.items).toEqual([]);
    expect(body.summary.totalRequests).toBe(0);
    expect(body.totalSamples).toBe(3);
    expect(body.source).toBe('recorded-real');
  });

  it('does not change recordings between requests', async () => {
    const first = await (await readShowcase()).json();
    const second = await (await readShowcase()).json();
    expect(second).toEqual(first);
  });

  it('exports no mutation method handlers', async () => {
    const route = await import('./route');
    expect(Object.keys(route).sort()).toEqual(['GET', 'dynamic']);
  });
});
