import { expect, test } from '@playwright/test';

test('prerendered shells use the Worker cache while private BFF reads remain uncached', async ({
  request,
}) => {
  for (const path of ['/showcase', '/projects', '/demo', '/demo/traces?range=30']) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    if (process.env.TRACEAI_E2E_WORKERS) expect(response.headers()['x-opennext-cache']).toBe('HIT');
    expect(await response.text()).not.toContain('Error 1102');
  }
  const prefetchHeaders: Record<string, string>[] = [
    { RSC: '1' },
    { RSC: '1', 'Next-Router-Prefetch': '1', 'Next-Router-Segment-Prefetch': '/_tree' },
  ];
  for (const headers of prefetchHeaders) {
    const response = await request.get('/demo/traces?range=30&_rsc=static-regression', {
      headers,
    });
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/x-component');
    if (process.env.TRACEAI_E2E_WORKERS) expect(response.headers()['x-opennext-cache']).toBe('HIT');
  }
  const privateProjects = await request.get('/api/projects');
  expect(privateProjects.status()).toBe(401);
  expect(privateProjects.headers()['cache-control']).toBe('no-store');
  expect(privateProjects.headers()['x-opennext-cache']).toBeUndefined();
});
