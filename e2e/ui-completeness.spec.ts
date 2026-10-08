import { expect, test, type Page, type PlaywrightWorkerArgs } from '@playwright/test';
import type { ModelComparison, Overview, Project, Trace, TracePage } from '@traceai/shared';

const endpoint = process.env.TRACEAI_E2E_API_URL ?? 'http://127.0.0.1:8787';
const formatLatency = (value: number) =>
  value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;
const formatInteger = (value: number) => new Intl.NumberFormat('en-US').format(value);
const formatCost = (value: string | null) =>
  value === null
    ? 'Pricing unavailable'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 4,
        maximumFractionDigits: 4,
      }).format(Number(value) / 1e9);

async function demoWindow(page: Page, days = 30) {
  const response = await page.context().request.get('/api/demo');
  expect(response.status()).toBe(200);
  const metadata = (await response.json()) as { anchor: string };
  const to = new Date(Date.parse(metadata.anchor) + 1).toISOString();
  return new URLSearchParams({
    from: new Date(Date.parse(to) - days * 86_400_000).toISOString(),
    to,
  });
}
async function createWorkspace({
  page,
  playwright,
  baseURL,
}: {
  page: Page;
  playwright: PlaywrightWorkerArgs['playwright'];
  baseURL: string;
}) {
  const origin = new URL(baseURL).origin;
  const owner = page.context().request;
  const suffix = crypto.randomUUID();
  const email = `ui-${suffix}@example.test`;
  const password = `Unique-passphrase-${suffix}`;
  const registration = await owner.post('/api/auth/register', {
    headers: { Origin: origin },
    data: { email, password },
  });
  expect(registration.status()).toBe(201);
  const cleanup = await playwright.request.newContext({
    baseURL,
    storageState: await page.context().storageState(),
  });
  let projectId: string | undefined;
  try {
    const created = await owner.post('/api/projects', {
      headers: { Origin: origin },
      data: { name: `UI ${suffix.slice(0, 8)}`, description: 'UI completeness test' },
    });
    expect(created.status()).toBe(201);
    const project = (await created.json()) as Project;
    projectId = project.id;
    const minted = await owner.post(`/api/projects/${project.id}/api-keys`, {
      headers: { Origin: origin },
    });
    expect(minted.status()).toBe(201);
    const key = (await minted.json()) as { key: string };
    const startedAt = Date.now() - 300_000;
    const successId = `ui-success-${suffix}`;
    const errorId = `ui-error-${suffix}`;
    const ingested = await owner.post(`${endpoint}/v1/events/batch`, {
      headers: { Authorization: `Bearer ${key.key}` },
      data: {
        events: [
          {
            traceId: successId,
            name: 'UI success',
            provider: 'local',
            model: 'ui-model',
            status: 'success',
            startedAt: new Date(startedAt).toISOString(),
            endedAt: new Date(startedAt + 100).toISOString(),
            durationMs: 100,
            inputTokens: 20,
            outputTokens: 10,
          },
          {
            traceId: errorId,
            name: 'UI explicit summary',
            provider: 'local',
            model: 'ui-model',
            status: 'error',
            startedAt: new Date(startedAt + 1000).toISOString(),
            endedAt: new Date(startedAt + 1250).toISOString(),
            durationMs: 250,
            errorType: 'application',
            errorSummary: 'Application supplied diagnostic summary.',
            metadata: { feature: 'ui-completeness' },
          },
        ],
      },
    });
    expect(ingested.status()).toBe(202);
    return {
      project,
      email,
      password,
      successId,
      errorId,
      async dispose() {
        try {
          const current = await cleanup.get(`/api/projects/${project.id}`);
          if (current.status() === 200) {
            const existing = (await current.json()) as Project;
            expect(
              (
                await cleanup.delete(`/api/projects/${project.id}`, {
                  headers: { Origin: origin },
                  data: { confirmName: existing.name },
                })
              ).status(),
            ).toBe(204);
          }
          await cleanup.post('/api/auth/logout', { headers: { Origin: origin } });
        } finally {
          await cleanup.dispose();
        }
      },
    };
  } catch (error) {
    if (projectId) {
      const current = await cleanup.get(`/api/projects/${projectId}`);
      if (current.status() === 200)
        await cleanup.delete(`/api/projects/${projectId}`, {
          headers: { Origin: origin },
          data: { confirmName: ((await current.json()) as Project).name },
        });
    }
    await cleanup.dispose();
    throw error;
  }
}

test('real overview presets, all chart panels and model metrics match API data', async ({
  page,
}) => {
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  for (const days of [1, 7, 30]) {
    const query = await demoWindow(page, days);
    const response = await page.context().request.get(`/api/demo/overview?${query}`);
    expect(response.status()).toBe(200);
    const overview = (await response.json()) as Overview;
    await page.getByLabel('Date range').selectOption(String(days));
    await expect(page.getByTestId('total-requests')).toHaveText(
      formatInteger(overview.totalRequests),
    );
    await expect(page.getByTestId('average-latency')).toHaveText(
      formatLatency(overview.averageLatencyMs),
    );
    await expect(page.getByTestId('p95-latency')).toHaveText(formatLatency(overview.p95LatencyMs));
  }
  for (const name of [
    'Request volume',
    'Latency distribution over time',
    'Token usage',
    'Simulated priced-request cost',
    'Requests by provider',
    'Model usage',
  ]) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }
  await expect(page.locator('.chart-panel')).toHaveCount(6);
  await expect(page.locator('.chart-panel svg.recharts-surface')).toHaveCount(5);
  const modelsResponse = await page
    .context()
    .request.get(`/api/demo/models?${await demoWindow(page)}`);
  expect(modelsResponse.status()).toBe(200);
  const { items } = (await modelsResponse.json()) as { items: ModelComparison[] };
  const totalRequests = items.reduce((total, item) => total + item.totalRequests, 0);
  for (const item of items) {
    const identity = `${item.provider} / ${item.model}`;
    const distribution = page.locator('.model-usage');
    await expect(distribution.getByText(identity, { exact: true })).toBeVisible();
    const meter = distribution.getByRole('meter', { name: `${identity} requests`, exact: true });
    await expect(meter).toHaveAttribute('value', String(item.totalRequests));
    await expect(meter).toHaveAttribute('max', String(totalRequests));
  }
  await page.getByRole('link', { name: 'Models', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(items.length);
  for (const item of items) {
    const row = page
      .locator('tbody tr')
      .filter({ has: page.getByText(item.model, { exact: true }) });
    await expect(row.locator('td').nth(0)).toContainText(item.provider);
    await expect(row.locator('td').nth(1)).toHaveText(formatInteger(item.totalRequests));
    await expect(row.locator('td').nth(2)).toHaveText(formatLatency(item.averageLatencyMs));
    await expect(row.locator('td').nth(3)).toHaveText(formatLatency(item.p95LatencyMs));
    await expect(row.locator('td').nth(4)).toHaveText(
      `${((1 - item.errorRate) * 100).toFixed(1)}%`,
    );
    await expect(row.locator('td').nth(5)).toHaveText(
      formatInteger(item.inputTokens + item.outputTokens),
    );
    await expect(row.locator('td').nth(6)).toContainText(formatCost(item.estimatedCostNanoUsd));
    await expect(page.locator('.model-comparison-chart svg')).toContainText(
      `${item.provider} / ${item.model}`,
    );
  }
  await expect(page.getByText('not model quality or accuracy', { exact: false })).toBeVisible();
});

test('real trace filters, both sort directions, cursor navigation, exact ID and date exclusion work', async ({
  page,
}) => {
  await page.goto('/demo/traces');
  await page.getByLabel('Date range').selectOption('30');
  await expect(
    page.getByLabel('Provider filter').getByRole('option', { name: 'anthropic', exact: true }),
  ).toBeAttached();
  await page.getByLabel('Provider filter').selectOption('anthropic');
  await page.getByLabel('Model filter').selectOption('demo-balanced');
  await page.getByLabel('Status filter').selectOption('success');
  for (const sort of ['oldest', 'newest']) {
    const query = await demoWindow(page);
    for (const [key, value] of Object.entries({
      provider: 'anthropic',
      model: 'demo-balanced',
      status: 'success',
      sort,
      limit: '25',
    }))
      query.set(key, value);
    const response = await page.context().request.get(`/api/demo/traces?${query}`);
    expect(response.status()).toBe(200);
    const expected = (await response.json()) as TracePage;
    await page.getByLabel('Trace sort').selectOption(sort);
    await expect(page.locator('tbody a').first()).toHaveText(expected.items[0]!.traceId);
    await expect(page.locator('tbody tr')).toHaveCount(25);
    const firstId = expected.items[0]!.traceId;
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(page.locator('tbody a').first()).not.toHaveText(firstId);
    await page.getByRole('button', { name: 'Previous page', exact: true }).click();
    await expect(page.locator('tbody a').first()).toHaveText(firstId);
  }
  const traceId = await page.locator('tbody a').first().textContent();
  await page.getByLabel('Exact trace ID').fill(traceId!);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody a')).toHaveText(traceId!);
  await page.getByLabel('Exact trace ID').fill('nonexistent-trace-id');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No matching traces' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear trace search', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(25);
  await page.getByLabel('Date range').selectOption('custom');
  await page.getByLabel('From (UTC)').fill('2000-01-01T00:00');
  await page.getByLabel('To (UTC)').fill('2000-01-02T00:00');
  await page.getByRole('button', { name: 'Apply range', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No matching traces' })).toBeVisible();
  await page.getByLabel('To (UTC)').fill('2000-02-02T00:00');
  await page.getByRole('button', { name: 'Apply range', exact: true }).click();
  await expect(page.locator('.custom-range').getByRole('alert')).toContainText('at most 31 days');
});

test('account menu keyboard, durable theme, project rename and SDK clipboard actions work', async ({
  page,
  playwright,
  baseURL,
}) => {
  const workspace = await createWorkspace({ page, playwright, baseURL: baseURL! });
  try {
    await page.goto(`/dashboard/${workspace.project.id}/settings`);
    const trigger = page.getByRole('button', { name: 'Account menu', exact: true });
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menu', { name: 'Account menu' })).toBeVisible();
    await expect(page.getByText(workspace.email, { exact: true })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: 'Projects', exact: true })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Documentation', exact: true })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await page.getByLabel('Toggle theme').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Projects', exact: true })
      .click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByLabel('Toggle theme').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.goto(`/dashboard/${workspace.project.id}/settings`);
    await page.getByLabel('Project name', { exact: true }).fill('Renamed UI project');
    await page
      .getByRole('textbox', { name: 'Description', exact: true })
      .fill('Updated through the actual dashboard');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Project updated.' })).toBeVisible();
    await expect(page.getByLabel('Project selector')).toHaveValue(workspace.project.id);
    await expect(page.getByLabel('Project selector').locator('option:checked')).toHaveText(
      'Renamed UI project',
    );
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: new URL(baseURL!).origin,
    });
    await page.getByRole('button', { name: 'Copy example', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: /^Copied$/ })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
      'Bun.env.TRACEAI_API_KEY',
    );
    await page.addInitScript(() =>
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async () => {
            throw new DOMException('Denied', 'NotAllowedError');
          },
        },
      }),
    );
    await page.reload();
    await page.getByRole('button', { name: 'Copy example', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'Copy unavailable — select the text manually.' }),
    ).toBeVisible();
  } finally {
    await workspace.dispose();
  }
});

test('critical pages fit 320/390/768/1440 widths and show safe real trace details and pricing provenance', async ({
  page,
  playwright,
  baseURL,
}) => {
  const workspace = await createWorkspace({ page, playwright, baseURL: baseURL! });
  try {
    const demoResponse = await page
      .context()
      .request.get(`/api/demo/traces?${await demoWindow(page)}&provider=anthropic&limit=1`);
    expect(demoResponse.status()).toBe(200);
    const demoTrace = ((await demoResponse.json()) as TracePage).items[0]!;
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of [
        '/demo',
        '/demo/models',
        '/demo/traces',
        `/demo/traces/${demoTrace.traceId}`,
        '/projects',
        `/dashboard/${workspace.project.id}/settings`,
        `/dashboard/${workspace.project.id}/traces/${workspace.errorId}`,
        '/login',
        '/register',
      ]) {
        await page.goto(path);
        await expect(page.locator('h1')).toBeVisible();
        // Measure loaded content, not an early page heading above a pending data request.
        if (path === '/demo') {
          await expect(page.locator('.chart-panel svg.recharts-surface')).toHaveCount(5);
        } else if (path === '/demo/models') {
          await expect(page.locator('tbody tr').first()).toBeVisible();
          await expect(page.locator('.model-comparison-chart svg.recharts-surface')).toBeVisible();
        } else if (path === '/demo/traces') {
          await expect(page.locator('tbody tr')).toHaveCount(25);
        } else if (path === `/demo/traces/${demoTrace.traceId}`) {
          await expect(page.getByRole('region', { name: 'Pricing provenance' })).toBeVisible();
        } else if (path === '/projects') {
          await expect(
            page.getByRole('heading', { name: workspace.project.name, exact: true }),
          ).toBeVisible();
          await expect(
            page.getByRole('button', { name: 'Create project', exact: true }),
          ).toBeVisible();
        } else if (path.endsWith('/settings')) {
          await expect(
            page.getByRole('table', { name: 'Project ingestion API keys' }).locator('tbody tr'),
          ).toHaveCount(1);
          await expect(
            page.getByRole('button', { name: 'Account menu', exact: true }),
          ).toBeVisible();
        } else if (path === `/dashboard/${workspace.project.id}/traces/${workspace.errorId}`) {
          await expect(page.getByTestId('error-summary')).toBeVisible();
        } else {
          await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
          await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
        }
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        if (path === '/demo' && width <= 768)
          await expect(
            page.getByRole('link', { name: 'Documentation', exact: true }),
          ).toBeVisible();
      }
    }
    await page.goto(`/dashboard/${workspace.project.id}/traces/${workspace.errorId}`);
    await expect(page.getByTestId('error-summary')).toHaveText(
      'Application supplied diagnostic summary.',
    );
    await expect(
      page.getByText('Capture policy: explicit-summary-v1', { exact: false }),
    ).toBeVisible();
    await expect(page.getByText('Sanitization cannot guarantee', { exact: false })).toBeVisible();
    const realDetail = await page
      .context()
      .request.get(`/api/projects/${workspace.project.id}/traces/${workspace.errorId}`);
    expect(realDetail.status()).toBe(200);
    const detail = (await realDetail.json()) as Trace;
    await expect(page.getByRole('heading', { name: 'Execution timeline' })).toBeVisible();
    await expect(page.getByText('feature', { exact: false })).toBeVisible();
    await expect(
      page.getByText(formatLatency(detail.durationMs), { exact: true }).first(),
    ).toBeVisible();
    await page.goto(`/demo/traces/${demoTrace.traceId}`);
    await expect(page.getByRole('region', { name: 'Pricing provenance' })).toBeVisible();
    await expect(page.getByText('Simulated pricing', { exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Pricing source', exact: false })).toHaveAttribute(
      'href',
      /^https:\/\//,
    );
  } finally {
    await workspace.dispose();
  }
});

test('test-injected aggregate 422 preserves manual exact filters backed by real trace queries', async ({
  page,
}) => {
  await page.route('**/api/demo/models?*', (route) =>
    route.fulfill({
      status: 422,
      json: { error: { code: 'analytics_window_limit', message: 'Test-injected aggregate cap' } },
    }),
  );
  await page.goto('/demo/traces');
  await page.getByLabel('Date range').selectOption('30');
  await page.getByLabel('Provider filter').fill('anthropic');
  await page.getByLabel('Model filter').fill('demo-balanced');
  await page.getByRole('button', { name: 'Apply exact filters', exact: true }).click();
  await expect(page.locator('tbody tr')).toHaveCount(25);
  for (const row of await page.locator('tbody tr').all()) {
    await expect(row.locator('td').nth(2)).toHaveText('anthropic');
    await expect(row.locator('td').nth(3)).toHaveText('demo-balanced');
  }
  await expect(
    page.getByRole('status').filter({ hasText: 'Exact provider/model filters still work' }),
  ).toBeVisible();
});

test('explicitly mocked loading, API failure/retry and empty states are actionable', async ({
  page,
}) => {
  let release!: () => void;
  let intercepted!: () => void;
  const pendingRequest = new Promise<void>((resolve) => {
    intercepted = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/demo/overview?*', async (route) => {
    intercepted();
    await gate;
    await route.continue();
  });
  try {
    await page.goto('/demo');
    await pendingRequest;
    await expect(page.getByRole('status', { name: 'Loading data' })).toBeVisible();
  } finally {
    release();
  }
  await expect(page.getByTestId('total-requests')).toBeVisible();
  await page.unroute('**/api/demo/overview?*');
  let fail = true;
  await page.route('**/api/demo/overview?*', async (route) => {
    if (fail) {
      fail = false;
      await route.fulfill({
        status: 503,
        json: { error: { message: 'Test-injected API unavailable' } },
      });
    } else await route.continue();
  });
  await page.reload();
  await expect(page.locator('.main-content').getByRole('alert')).toContainText(
    'Test-injected API unavailable',
  );
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByTestId('total-requests')).toBeVisible();
  await page.unroute('**/api/demo/overview?*');
  await page.route('**/api/demo/overview?*', (route) =>
    route.fulfill({
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
    }),
  );
  await page.reload();
  await expect(page.getByRole('heading', { name: 'No demo traces in this window' })).toBeVisible();
  await expect(
    page.getByText('Choose another date range within the simulated dataset.'),
  ).toBeVisible();
  await page.unroute('**/api/demo/overview?*');
  await page.route('**/api/demo/models?*', (route) => route.fulfill({ json: { items: [] } }));
  await page.goto('/demo/models');
  await expect(page.getByRole('heading', { name: 'No models in this window' })).toBeVisible();
});

test('actual missing-session denial offers safe sign-in return to the requested private route', async ({
  page,
  playwright,
  baseURL,
}) => {
  const workspace = await createWorkspace({ page, playwright, baseURL: baseURL! });
  try {
    await page.context().clearCookies();
    const requested = `/dashboard/${workspace.project.id}/traces/${workspace.successId}`;
    await page.goto(requested);
    await expect(page.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible();
    const signIn = page.getByRole('link', { name: 'Sign in to continue →', exact: true });
    await expect(signIn).toHaveAttribute(
      'href',
      `/login?returnTo=${encodeURIComponent(requested)}`,
    );
    await signIn.click();
    await page.getByLabel('Email', { exact: true }).fill(workspace.email);
    await page.getByLabel('Password', { exact: true }).fill(workspace.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${workspace.successId}$`));
    await expect(page.getByRole('heading', { name: 'Trace detail' })).toBeVisible();
    await page.goto('/login?returnTo=https%3A%2F%2Fattacker.example');
    await page.getByLabel('Email', { exact: true }).fill(workspace.email);
    await page.getByLabel('Password', { exact: true }).fill(workspace.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/projects$/);
  } finally {
    await workspace.dispose();
  }
});
