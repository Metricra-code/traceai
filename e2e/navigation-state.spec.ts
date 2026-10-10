import { expect, test } from '@playwright/test';

test('trace investigation survives detail, browser back, reload and a shared URL', async ({
  page,
  context,
}) => {
  await page.goto('/demo/traces');
  await page.getByLabel('Date range').selectOption('30');
  await page.getByLabel('Provider filter').selectOption('anthropic');
  await page.getByLabel('Model filter').selectOption('demo-balanced');
  await page.getByLabel('Status filter').selectOption('error');
  await page.getByLabel('Trace sort').selectOption('oldest');
  await expect(page.locator('tbody tr')).toHaveCount(25);
  const firstPageId = await page.locator('tbody a').first().textContent();
  await page.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(page.locator('tbody a').first()).not.toHaveText(firstPageId!);
  const traceId = await page.locator('tbody a').first().textContent();
  const listUrl = page.url();
  expect(new URL(listUrl).searchParams.get('provider')).toBe('anthropic');
  expect(new URL(listUrl).searchParams.get('cursor')).toBeTruthy();
  await page.locator('tbody a').first().click();
  await expect(page.getByRole('heading', { name: 'Trace detail', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'All traces', exact: false }).click();
  await expect(page).toHaveURL(listUrl);
  await expect(page.locator('tbody a').first()).toHaveText(traceId!);
  await expect(page.getByLabel('Provider filter')).toHaveValue('anthropic');
  await expect(page.getByLabel('Model filter')).toHaveValue('demo-balanced');
  await expect(page.getByLabel('Status filter')).toHaveValue('error');
  await expect(page.getByLabel('Trace sort')).toHaveValue('oldest');
  await expect(page.getByLabel('Date range')).toHaveValue('30');
  await expect(page.locator('.pagination')).toContainText('Page 2');
  await page.getByRole('button', { name: 'Previous page', exact: true }).click();
  await expect(page.locator('tbody a').first()).toHaveText(firstPageId!);
  await page.goBack();
  await expect(page).toHaveURL(listUrl);
  await expect(page.locator('tbody a').first()).toHaveText(traceId!);
  await page.reload();
  await expect(page.locator('tbody a').first()).toHaveText(traceId!);
  await expect(page.getByLabel('Provider filter')).toHaveValue('anthropic');
  await expect(page.locator('.pagination')).toContainText('Current page');
  await expect(page.getByRole('button', { name: 'First page', exact: true })).toBeVisible();
  const shared = await context.newPage();
  try {
    await shared.goto(listUrl);
    await expect(shared.locator('tbody a').first()).toHaveText(traceId!);
    await expect(shared.getByLabel('Status filter')).toHaveValue('error');
    await shared.getByLabel('Provider filter').selectOption('openai');
    await expect(shared.getByLabel('Model filter')).toHaveValue('');
    await expect(shared).not.toHaveURL(/cursor=/);
    await expect(shared.locator('.pagination')).toContainText('Page 1');
  } finally {
    await shared.close();
  }
});

test('an unapplied custom range does not override the restored browser-history snapshot', async ({
  page,
}) => {
  await page.goto('/demo');
  await expect(page.getByLabel('Date range')).toHaveValue('7');
  const initialUrl = page.url();
  await page.getByLabel('Date range').selectOption('30');
  await expect(page).toHaveURL(/range=30/);
  const presetUrl = page.url();
  const presetParams = new URL(presetUrl).searchParams;
  const rangeAlert = page.locator('form.custom-range').getByRole('alert');
  await page.getByLabel('Date range').selectOption('custom');
  await expect(page.getByLabel('From (UTC)')).toBeVisible();
  await page.getByLabel('From (UTC)').fill('2026-01-02T00:00');
  await page.getByLabel('To (UTC)').fill('2026-01-01T00:00');
  await page.getByRole('button', { name: 'Apply range', exact: true }).click();
  await expect(rangeAlert).toHaveText('Choose an increasing UTC range of at most 31 days.');
  // Opening an editor must not apply its draft to the current data snapshot.
  expect(new URL(page.url()).searchParams.get('range')).toBe('30');

  await page.goBack();
  await expect(page).toHaveURL(initialUrl);
  await expect(page.getByLabel('Date range')).toHaveValue('7');
  await expect(page.getByLabel('From (UTC)')).toHaveCount(0);
  await expect(rangeAlert).toHaveCount(0);

  await page.goForward();
  await expect(page).toHaveURL(presetUrl);
  await expect(page.getByLabel('Date range')).toHaveValue('30');
  await expect(page.getByLabel('From (UTC)')).toHaveCount(0);
  await expect(rangeAlert).toHaveCount(0);
  await page.getByLabel('Date range').selectOption('custom');
  await expect(page.getByLabel('From (UTC)')).toHaveValue(presetParams.get('from')!.slice(0, 16));
  await expect(page.getByLabel('To (UTC)')).toHaveValue(presetParams.get('to')!.slice(0, 16));
  await expect(rangeAlert).toHaveCount(0);
});

test('inline model comparison preserves the selected UTC snapshot', async ({ page }) => {
  await page.goto('/demo');
  await page.getByLabel('Date range').selectOption('30');
  await expect(page.getByTestId('total-requests')).toHaveText('10,000');
  const query = new URL(page.url()).search;
  await expect(page.getByRole('link', { name: 'Compare models', exact: true })).toHaveAttribute(
    'href',
    `/demo/models${query}`,
  );
  await page.getByRole('link', { name: 'Compare models', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Model comparison', exact: true })).toBeVisible();
  expect(new URL(page.url()).search).toBe(query);
});

test('a shared exact filter remains visible when it has no model-summary suggestions', async ({
  page,
}) => {
  await page.goto('/demo/traces?provider=unlisted-provider&model=unlisted-model');
  await expect(
    page.getByRole('heading', { name: 'No matching traces', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Provider filter')).toHaveValue('unlisted-provider');
  await expect(page.getByLabel('Model filter')).toHaveValue('unlisted-model');
  await expect(page.getByLabel('Provider filter')).toContainText(
    'unlisted-provider (exact filter)',
  );
  await expect(page.getByLabel('Model filter')).toContainText('unlisted-model (exact filter)');
});

test('preset refresh sends one current request per endpoint; custom refresh keeps its URL', async ({
  page,
}) => {
  const project = {
    id: 'refresh-test',
    name: 'Refresh test',
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  const requests: URL[] = [];
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/auth/session')
      return route.fulfill({ json: { user: { id: 'test-user', email: 'test@example.test' } } });
    if (url.pathname === '/api/projects') return route.fulfill({ json: { items: [project] } });
    requests.push(url);
    if (url.pathname.endsWith('/overview'))
      return route.fulfill({
        json: {
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          errorRate: 0,
          averageLatencyMs: 0,
          p50LatencyMs: 0,
          p95LatencyMs: 0,
          p99LatencyMs: 0,
          inputTokens: 0,
          outputTokens: 0,
          estimatedCostNanoUsd: '0',
          knownEstimatedCostNanoUsd: '0',
          pricedRequests: 0,
          unpricedRequests: 0,
        },
      });
    return route.fulfill({ json: { items: [], bucket: 'hour' } });
  });
  await page.goto(`/dashboard/${project.id}`);
  await expect(page.getByTestId('total-requests')).toHaveText('0');
  const window = page.getByRole('region', { name: 'Trace start window' });
  const initialCutoff = await window.locator('time').nth(1).getAttribute('datetime');
  await expect(window).toContainText('Refresh data sets its cutoff to now.');
  await expect(page.getByRole('button', { name: 'Refresh data', exact: true })).toHaveAttribute(
    'aria-describedby',
    'trace-window-note',
  );
  requests.length = 0;
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(page.getByTestId('total-requests')).toHaveText('0');
  await expect.poll(() => requests.length).toBe(3);
  await expect(page.getByRole('button', { name: 'Refresh data', exact: true })).toBeEnabled();
  expect(requests.map((url) => url.pathname).sort()).toEqual([
    '/api/projects/refresh-test/metrics',
    '/api/projects/refresh-test/models',
    '/api/projects/refresh-test/overview',
  ]);
  const presetUrl = page.url();
  const presetParams = new URL(presetUrl).searchParams;
  expect(Date.parse(presetParams.get('to')!)).toBeGreaterThan(Date.parse(initialCutoff!));
  await expect(window.locator('time').nth(0)).toHaveAttribute(
    'datetime',
    presetParams.get('from')!,
  );
  await expect(window.locator('time').nth(1)).toHaveAttribute('datetime', presetParams.get('to')!);
  await page.getByLabel('Date range').selectOption('custom');
  await page.getByLabel('From (UTC)').fill('2026-01-01T00:00');
  await page.getByLabel('To (UTC)').fill('2026-01-02T00:00');
  await page.getByRole('button', { name: 'Apply range', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh data', exact: true })).toBeEnabled();
  const customUrl = page.url();
  await expect(window).toContainText('Refresh data reloads this fixed window.');
  requests.length = 0;
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect.poll(() => requests.length).toBe(3);
  await expect(page.getByRole('button', { name: 'Refresh data', exact: true })).toBeEnabled();
  expect(page.url()).toBe(customUrl);
  expect(
    requests.every(
      (url) =>
        url.searchParams.get('from') === '2026-01-01T00:00:00.000Z' &&
        url.searchParams.get('to') === '2026-01-02T00:00:00.000Z',
    ),
  ).toBe(true);
  await expect(window.locator('time').nth(0)).toHaveAttribute(
    'datetime',
    '2026-01-01T00:00:00.000Z',
  );
  await expect(window.locator('time').nth(1)).toHaveAttribute(
    'datetime',
    '2026-01-02T00:00:00.000Z',
  );
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(window).toContainText('It does not filter this page.');
  const settingsUrl = page.url();
  await expect(page.getByRole('button', { name: 'Refresh data', exact: true })).toBeEnabled();
  requests.length = 0;
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]!.pathname).toBe('/api/projects/refresh-test/api-keys');
  expect(page.url()).toBe(settingsUrl);
  await expect(window.locator('time').nth(1)).toHaveAttribute(
    'datetime',
    '2026-01-02T00:00:00.000Z',
  );
});
