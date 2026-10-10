import { expect, test } from '@playwright/test';

test('exact trace search rejects invalid characters and accepts hyphens and underscores', async ({
  page,
}) => {
  await page.goto('/demo/traces');
  const traceId = page.getByLabel('Exact trace ID', { exact: true });
  const initialUrl = page.url();
  await traceId.fill('bad/id');
  await expect
    .poll(() => traceId.evaluate((input: HTMLInputElement) => input.validity.patternMismatch))
    .toBe(true);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(initialUrl);
  await expect(traceId).toBeFocused();

  await traceId.fill('Trace-123_valid');
  expect(await traceId.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(true);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page).toHaveURL(/traceId=Trace-123_valid/);
  await expect(
    page.getByRole('heading', { name: 'No matching traces', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Clear trace search', exact: true }).click();
  await expect(page).not.toHaveURL(/traceId=/);
  await expect(page.locator('tbody tr')).toHaveCount(25);
});
