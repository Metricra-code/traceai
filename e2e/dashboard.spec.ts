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

test('phone-width trace rows show key fields without horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/demo/traces');
  const row = page.locator('tbody tr').first();
  await expect(row).toBeVisible();
  const scroller = page.locator('.table-scroll');
  expect(await scroller.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
    true,
  );
  for (const index of [0, 3, 4, 5, 8]) {
    const box = await row.locator('td').nth(index).boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(375);
  }
  await expect(page.getByRole('columnheader', { name: 'Latency', exact: true })).toBeAttached();
});

test('desktop data tables right-align numeric columns', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/demo/models');
  await expect(page.locator('tbody tr').first()).toBeVisible();
  for (const name of ['Requests', 'P95 latency', 'Estimated cost']) {
    const header = page.getByRole('columnheader', { name, exact: true });
    await expect(header).toHaveCSS('text-align', 'right');
  }
  await expect(page.locator('tbody tr').first().locator('td').nth(3)).toHaveCSS(
    'text-align',
    'right',
  );
  await expect(page.getByRole('columnheader', { name: 'Model / provider' })).toHaveCSS(
    'text-align',
    'left',
  );
});
