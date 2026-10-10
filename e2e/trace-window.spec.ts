import { expect, test } from '@playwright/test';

test('the applied trace-start window is exact, visible on mobile and retained on detail', async ({
  page,
}) => {
  const metadata = await page.context().request.get('/api/demo');
  expect(metadata.status()).toBe(200);
  const { anchor } = (await metadata.json()) as { anchor: string };
  const to = new Date(Date.parse(anchor) + 1).toISOString();
  const from = new Date(Date.parse(to) - 7 * 86_400_000).toISOString();
  const query = new URLSearchParams({ from, to, range: '7' });
  await page.goto(`/demo/traces?${query}`);
  await expect(page.locator('tbody tr')).toHaveCount(25);
  const listHref = await page
    .getByRole('link', { name: 'Traces', exact: true })
    .getAttribute('href');
  expect(listHref).toBeTruthy();
  const listUrl = new URL(listHref!, page.url()).href;
  const window = page.getByRole('region', { name: 'Trace start window' });
  await expect(window).toBeVisible();
  await expect(window.locator('time').nth(0)).toHaveAttribute('datetime', from);
  await expect(window.locator('time').nth(1)).toHaveAttribute('datetime', to);
  await expect(window.locator('time').nth(1)).toHaveText(to.replace('T', ' ').replace('Z', ''));
  await expect(window).toContainText('From (inclusive)');
  await expect(window).toContainText('Before (exclusive)');
  await expect(window).toContainText('Fixed simulated window, not live traffic.');
  await expect(page.getByLabel('Date range')).toHaveAttribute(
    'aria-describedby',
    'trace-window-note',
  );
  await page.setViewportSize({ width: 320, height: 900 });
  for (const time of await window.locator('time').all()) {
    const box = await time.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  }
  await page.locator('tbody a').first().click();
  await expect(page.getByRole('heading', { name: 'Trace detail', exact: true })).toBeVisible();
  await expect(window).toContainText('It does not filter this page.');
  await expect(window.locator('time').nth(1)).toHaveAttribute('datetime', to);
  await page.getByRole('link', { name: 'All traces', exact: false }).click();
  await expect(page).toHaveURL(listUrl);
  await expect(window).toContainText('Fixed simulated window, not live traffic.');
});
