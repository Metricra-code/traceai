import { expect, test } from '@playwright/test';
// Foundation smoke only; Dashboard journeys will be added with the Dashboard milestone.
test('Next application renders the TraceAI foundation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'TraceAI', exact: true })).toBeVisible();
});
test('Worker health confirms a local D1 connection', async ({ request }) => {
  await expect
    .poll(async () => {
      try {
        return (await request.get('http://127.0.0.1:8787/health')).status();
      } catch {
        return 0;
      }
    })
    .toBe(200);
  const response = await request.get('http://127.0.0.1:8787/health');
  expect(await response.json()).toMatchObject({ status: 'ok', service: 'traceai-api' });
});
