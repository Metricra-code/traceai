import { expect, test, type Request } from '@playwright/test';

test('changing the date window cancels obsolete reads without an offline error', async ({
  page,
}) => {
  let obsolete: Request | undefined;
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/demo/metrics?**', async (route) => {
    if (!obsolete) {
      obsolete = route.request();
      await held;
      // The browser has canceled this held request; releasing a route is test cleanup only.
      await route.continue().catch(() => undefined);
    } else await route.continue();
  });
  try {
    await page.goto('/demo', { waitUntil: 'domcontentloaded' });
    await expect
      .poll(() => obsolete !== undefined, {
        timeout: 15_000,
        message: 'Initial metrics request must reach the interception handler',
      })
      .toBe(true);
    await page.getByLabel('Date range').selectOption('30');
    await expect(page.getByTestId('total-requests')).toHaveText('10,000');
    await expect
      .poll(() => obsolete?.failure()?.errorText, { timeout: 15_000 })
      .toBe('net::ERR_ABORTED');
    await expect(page.getByText('Cannot reach TraceAI.', { exact: false })).toHaveCount(0);
  } finally {
    release();
    await page.unrouteAll({ behavior: 'wait' });
  }
});
