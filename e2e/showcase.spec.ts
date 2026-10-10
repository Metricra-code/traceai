import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('root opens genuine recorded calls and keeps the simulated demo separate', async ({
  page,
}) => {
  const privateRequests: string[] = [];
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname;
    if (/^\/api\/(auth|projects)(?:\/|$)/.test(pathname)) privateRequests.push(pathname);
  });
  await page.goto('/');
  await expect(page).toHaveURL(/\/showcase(?:\?|$)/);
  await expect(page.getByRole('heading', { name: 'Real measurements', exact: true })).toBeVisible();
  await expect(page.getByTestId('showcase-total-requests')).toHaveText('3');
  await expect(page.getByTestId('showcase-total-tokens')).toHaveText('112');
  await expect(page.getByTestId('showcase-p95')).toHaveText('1.29 s');
  const table = page.getByRole('table', { name: 'Recorded model calls' });
  await expect(table.getByRole('row')).toHaveCount(4);
  await expect(table).toContainText('gemini-3.5-flash-lite');
  await expect(page.getByText(/Recorded real API calls/)).toBeVisible();
  await expect(page.getByText(/not live traffic/i)).toBeVisible();

  const sortedResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/showcase' &&
      new URL(response.url()).searchParams.get('sort') === 'latency-asc',
  );
  await page.getByLabel('Sort by', { exact: true }).selectOption('latency-asc');
  expect((await sortedResponse).status()).toBe(200);
  await expect(table.getByRole('row').nth(1)).toContainText('Call 3');
  const sortedTable = await table.innerText();
  await page
    .getByRole('navigation', { name: 'Main navigation', exact: true })
    .getByRole('link', { name: 'Measurements', exact: true })
    .click();
  await expect.poll(() => new URL(page.url()).hash).toBe('#measurements');
  expect(new URL(page.url()).searchParams.get('sort')).toBe('latency-asc');
  expect(await table.innerText()).toBe(sortedTable);

  const filtered = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/showcase' &&
      new URL(response.url()).searchParams.get('status') === 'error',
  );
  await page.getByLabel('Status', { exact: true }).selectOption('error');
  const response = await filtered;
  expect(response.status()).toBe(200);
  const empty = await response.json();
  expect(empty.items).toEqual([]);
  expect(empty.summary.totalRequests).toBe(0);
  expect(empty.summary.p95LatencyMs).toBeNull();
  await expect(page.getByText('No recorded calls match', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await expect(page.getByTestId('showcase-total-requests')).toHaveText('3');

  const sources = page.getByRole('navigation', { name: 'Data source', exact: true });
  await sources.getByRole('link', { name: 'Simulated demo', exact: true }).click();
  await expect(page).toHaveURL(/\/demo(?:\?|$)/);
  await expect(page.getByText('Simulated data · Read-only', { exact: true })).toBeVisible();
  await expect(page.getByTestId('total-requests')).not.toHaveText('3');
  await page
    .getByRole('navigation', { name: 'Data source', exact: true })
    .getByRole('link', { name: 'Real measurements', exact: true })
    .click();
  await expect(page).toHaveURL(/\/showcase(?:\?|$)/);
  await expect(page.getByTestId('showcase-total-requests')).toHaveText('3');
  expect(privateRequests).toEqual([]);
});

test('public real snapshot exposes only approved telemetry and never accepts private scopes or writes', async ({
  request,
}) => {
  const response = await request.get('/api/showcase');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('no-store');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  const body = await response.json();
  expect(body.source).toBe('recorded-real');
  expect(body.snapshot).toBe(true);
  expect(body.totalSamples).toBe(3);
  expect(body.items).toHaveLength(3);
  for (const item of body.items) {
    expect(Object.keys(item).sort()).toEqual([
      'durationMs',
      'inputTokens',
      'model',
      'outputTokens',
      'sampleNumber',
      'status',
    ]);
  }
  expect(body.summary.inputTokens).toBe(31);
  expect(body.summary.outputTokens).toBe(81);
  expect(body.summary.p95LatencyMs).toBe(
    Math.max(...body.items.map((item: { durationMs: number }) => item.durationMs)),
  );
  const ascending = await request.get('/api/showcase?sort=latency-asc');
  const ordered = (await ascending.json()).items;
  expect(ordered.map((item: { durationMs: number }) => item.durationMs)).toEqual(
    [...body.items.map((item: { durationMs: number }) => item.durationMs)].sort(
      (left: number, right: number) => left - right,
    ),
  );
  for (const query of [
    'projectId=private',
    'cursor=private',
    'status=error&status=success',
    'sort=invalid',
  ]) {
    expect((await request.get(`/api/showcase?${query}`)).status()).toBe(400);
  }
  expect((await request.post('/api/showcase', { data: {} })).status()).toBe(405);
});

test('real measurement page stays accessible and usable at narrow and desktop widths', async ({
  page,
}) => {
  await page.goto('/showcase');
  await expect(page.getByTestId('showcase-total-requests')).toHaveText('3');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(
      page.getByRole('heading', { name: 'Real measurements', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Status', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  for (const theme of ['dark', 'light']) {
    if (theme === 'light')
      await page.getByRole('button', { name: 'Toggle theme', exact: true }).click();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  }
});

test('recorded-page transport errors recover through retry without a simulated fallback', async ({
  page,
}) => {
  let holdFailure = true;
  await page.route('**/api/showcase*', async (route) => {
    if (holdFailure) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: { message: 'Recorded snapshot unavailable in this test.' } }),
      });
    } else {
      await route.continue();
    }
  });
  await page.goto('/showcase');
  await expect(
    page.getByRole('heading', { name: 'Could not load this view', exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId('showcase-total-requests')).toHaveCount(0);
  await expect(page.getByText('Simulated data · Read-only', { exact: true })).toHaveCount(0);
  holdFailure = false;
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByTestId('showcase-total-requests')).toHaveText('3');
  await expect(page.getByTestId('showcase-total-tokens')).toHaveText('112');
});
