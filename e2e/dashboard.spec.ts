import { expect, test } from '@playwright/test';

test('public demo has real analytics, server filters, cursor pages and trace detail', async ({
  page,
}) => {
  await page.goto('/demo');
  await expect(page.getByRole('heading', { name: 'Overview', exact: true })).toBeVisible();
  await expect(page.getByText('Simulated data · Read-only', { exact: true })).toBeVisible();
  await page.getByLabel('Date range').selectOption('30');
  await expect(page.getByTestId('total-requests')).toHaveText('10,000');
  await expect(page.getByTestId('p95-latency')).not.toHaveText('0 ms');
  await page.getByRole('link', { name: 'Traces', exact: true }).click();
  await page.getByLabel('Status filter').selectOption('error');
  await expect(page.locator('tbody tr').first()).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(25);
  const firstId = await page.locator('tbody a').first().textContent();
  await page.getByRole('button', { name: 'Next page' }).click();
  await expect(page.locator('tbody a').first()).not.toHaveText(firstId ?? '');
  await page.locator('tbody a').first().click();
  await expect(page.getByRole('heading', { name: 'Trace detail' })).toBeVisible();
  await expect(page.getByText('Single operation · not a distributed span tree')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate API key' })).toHaveCount(0);
});

test('mobile demo keeps controls accessible without document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/demo/models');
  await expect(page.getByRole('heading', { name: 'Model comparison' })).toBeVisible();
  await expect(page.getByLabel('Date range')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});
