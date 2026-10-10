import { expect, test } from '@playwright/test';
import { TraceAI } from '../packages/sdk/src/index';

const endpoint = process.env.TRACEAI_E2E_API_URL ?? 'http://127.0.0.1:8787';
test('account, project, SDK telemetry, filters, key rotation and revocation work end-to-end', async ({
  page,
  request,
}) => {
  const suffix = crypto.randomUUID();
  const email = `portfolio-${suffix}@example.com`;
  const password = `Unique-passphrase-${suffix}`;
  const projectName = `E2E ${suffix.slice(0, 8)}`;
  await page.goto('/register');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  await page.getByLabel('Project name').fill(projectName);
  await page.getByLabel('Description').fill('Real SDK end-to-end test');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Generate API key' }).click();
  const key = await page.getByTestId('raw-api-key').textContent();
  expect(key).toMatch(/^tai_[a-f0-9]{32}_[a-f0-9]{64}$/);
  const overviewLink = page.getByRole('link', { name: 'Overview', exact: true });
  const snapshotUrl = new URL((await overviewLink.getAttribute('href'))!, page.url());
  const sdk = new TraceAI({
    apiKey: key!,
    endpoint,
    flushIntervalMs: 60_000,
  });
  await sdk.trace({ name: 'e2e-success', provider: 'local', model: 'mock-model' }, async (span) => {
    span.setUsage({ inputTokens: 1200, outputTokens: 350 });
    return 'original-result';
  });
  const original = new Error('Private application error');
  await expect(
    sdk.trace({ name: 'e2e-failure', provider: 'local', model: 'mock-model' }, async () => {
      throw original;
    }),
  ).rejects.toBe(original);
  await sdk.shutdown();
  await page.getByRole('button', { name: 'I saved it · Hide key' }).click();
  await expect(page.getByTestId('raw-api-key')).toHaveCount(0);
  await overviewLink.click();
  await expect(page).toHaveURL(snapshotUrl.href);
  // Navigation retains the pre-ingestion snapshot; only an explicit refresh advances it.
  await expect(page.getByTestId('total-requests')).toHaveText('0');
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(page.getByTestId('total-requests')).toHaveText('2');
  const refreshedPreset = new URL(page.url()).searchParams;
  expect(refreshedPreset.get('range')).toBe('1');
  expect(Date.parse(refreshedPreset.get('to')!)).toBeGreaterThan(
    Date.parse(snapshotUrl.searchParams.get('to')!),
  );
  expect(Date.parse(refreshedPreset.get('to')!) - Date.parse(refreshedPreset.get('from')!)).toBe(
    86_400_000,
  );
  const rangeFrom = new Date(Date.now() - 86_400_000).toISOString().slice(0, 16);
  const rangeTo = new Date(Date.now() + 120_000).toISOString().slice(0, 16);
  await page.getByLabel('Date range').selectOption('custom');
  await page.getByLabel('From (UTC)').fill(rangeFrom);
  await page.getByLabel('To (UTC)').fill(rangeTo);
  const initialCustomOverview = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      url.pathname.endsWith('/overview') &&
      url.searchParams.get('from') === `${rangeFrom}:00.000Z` &&
      url.searchParams.get('to') === `${rangeTo}:00.000Z`
    );
  });
  await page.getByRole('button', { name: 'Apply range', exact: true }).click();
  const initialCustomResponse = await initialCustomOverview;
  expect(initialCustomResponse.status()).toBe(200);
  await expect(page.getByTestId('total-requests')).toHaveText('2');
  const backdatedStart = Date.now() - 7_200_000;
  expect(
    (
      await request.post(`${endpoint}/v1/events/batch`, {
        headers: { Authorization: `Bearer ${key}` },
        data: {
          events: [
            {
              traceId: crypto.randomUUID(),
              name: 'e2e-backdated-refresh',
              provider: 'local',
              model: 'mock-model',
              status: 'success',
              startedAt: new Date(backdatedStart).toISOString(),
              endedAt: new Date(backdatedStart + 1000).toISOString(),
              durationMs: 1000,
            },
          ],
        },
      })
    ).status(),
  ).toBe(202);
  const refreshedOverview = page.waitForResponse(
    (response) => response.url() === initialCustomResponse.url(),
  );
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  expect((await refreshedOverview).status()).toBe(200);
  await expect(page.getByTestId('total-requests')).toHaveText('3');
  await page.getByRole('link', { name: 'Traces', exact: true }).click();
  await page.getByLabel('Status filter').selectOption('error');
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody')).toContainText('e2e-failure');
  await page.locator('tbody a').first().click();
  await expect(page.getByRole('heading', { name: 'Trace detail' })).toBeVisible();
  await expect(
    page.getByText('Raw application errors are not collected.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByText('Private application error', { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Rotate key', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm rotate' }).click();
  await expect(page.getByTestId('raw-api-key')).toBeVisible();
  const rotatedKey = await page.getByTestId('raw-api-key').textContent();
  expect(rotatedKey).not.toBe(key);
  const payload = {
    events: [
      {
        traceId: crypto.randomUUID(),
        name: 'revocation-check',
        provider: 'local',
        model: 'mock',
        status: 'success',
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: 1,
      },
    ],
  };
  expect(
    (
      await request.post(`${endpoint}/v1/events/batch`, {
        headers: { Authorization: `Bearer ${key}` },
        data: payload,
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post(`${endpoint}/v1/events/batch`, {
        headers: { Authorization: `Bearer ${rotatedKey}` },
        data: payload,
      })
    ).status(),
  ).toBe(202);
  await page.getByRole('button', { name: 'I saved it · Hide key' }).click();
  await page.getByRole('button', { name: 'Revoke key', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm revoke' }).click();
  await expect(page.getByRole('button', { name: 'Revoke key', exact: true })).toHaveCount(0);
  expect(
    (
      await request.post(`${endpoint}/v1/events/batch`, {
        headers: { Authorization: `Bearer ${rotatedKey}` },
        data: payload,
      })
    ).status(),
  ).toBe(401);
  await page.getByLabel('Confirm project name').fill(projectName);
  await page.getByRole('button', { name: 'Delete project permanently' }).click();
  await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: projectName, exact: false })).toHaveCount(0);
});
