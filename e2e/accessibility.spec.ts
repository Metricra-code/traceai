import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function assertAccessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(result.violations).toEqual([]);
}

test('public analytics and trace detail pass automated AA checks in dark and light themes', async ({
  page,
}) => {
  for (const theme of ['dark', 'light']) {
    for (const path of ['/demo', '/demo/models', '/demo/traces']) {
      await page.goto(path);
      await page.locator('h1').waitFor();
      // Explicitly choose the measured theme; persistence/toggling has a separate keyboard test.
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      if (path === '/demo') await page.getByTestId('total-requests').waitFor();
      else await page.locator('tbody tr').first().waitFor();
      await assertAccessible(page);
    }
    await page.locator('tbody a').first().click();
    await expect(page.getByRole('heading', { name: 'Trace detail' })).toBeVisible();
    await assertAccessible(page);
  }
});

test('authentication forms and denied private view have labeled controls at narrow mobile width', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  for (const path of ['/login', '/register']) {
    await page.goto(path);
    await page.getByLabel('Email', { exact: true }).waitFor();
    await assertAccessible(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible();
  await assertAccessible(page);
});

test('authenticated projects, settings, one-time key and account menu pass automated AA checks', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const request = page.context().request;
  const suffix = crypto.randomUUID();
  const name = `Accessibility ${suffix.slice(0, 8)}`;
  let projectId: string | undefined;
  expect(
    (
      await request.post('/api/auth/register', {
        headers: { Origin: origin },
        data: {
          email: `accessibility-${suffix}@example.test`,
          password: `Unique-passphrase-${suffix}`,
        },
      })
    ).status(),
  ).toBe(201);
  try {
    const created = await request.post('/api/projects', {
      headers: { Origin: origin },
      data: { name, description: 'Disposable accessibility verification' },
    });
    expect(created.status()).toBe(201);
    projectId = ((await created.json()) as { id: string }).id;
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1040 });
      for (const theme of ['dark', 'light']) {
        await page.goto('/projects');
        await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        await assertAccessible(page);
        await page.goto(`/dashboard/${projectId}/settings`);
        await expect(page.getByRole('textbox', { name: 'Project name', exact: true })).toHaveValue(
          name,
        );
        await expect(page.getByText('No keys yet.', { exact: false })).toBeVisible();
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        const commands = page.getByRole('region', {
          name: 'SDK environment commands',
          exact: true,
        });
        const example = page.getByRole('region', {
          name: 'TypeScript SDK integration example',
          exact: true,
        });
        await commands.focus();
        await expect(commands).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(example).toBeFocused();
        if (width === 390) {
          await page.keyboard.press('ArrowRight');
          await expect
            .poll(() => example.evaluate((element) => element.scrollLeft))
            .toBeGreaterThan(0);
        }
        await assertAccessible(page);
        await page.getByRole('button', { name: 'Account menu', exact: true }).click();
        await expect(page.getByRole('menu', { name: 'Account menu', exact: true })).toBeVisible();
        await assertAccessible(page);
        await page.keyboard.press('Escape');
      }
    }
    await page.getByRole('button', { name: 'Generate API key', exact: true }).click();
    await expect(page.getByTestId('raw-api-key')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rotate key', exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 1040 });
    for (const theme of ['dark', 'light']) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);
      await assertAccessible(page);
    }
  } finally {
    if (projectId)
      expect(
        (
          await request.delete(`/api/projects/${projectId}`, {
            headers: { Origin: origin },
            data: { confirmName: name },
          })
        ).status(),
      ).toBe(204);
    expect((await request.post('/api/auth/logout', { headers: { Origin: origin } })).status()).toBe(
      204,
    );
  }
});
