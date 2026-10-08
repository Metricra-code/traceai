import { expect, test } from '@playwright/test';
import type { Project, ApiKey } from '@traceai/shared';

test('BFF blocks missing or malicious Origin, demo writes, oversized bodies and unapproved paths', async ({
  request,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const hostile = await request.post('/api/auth/login', {
    headers: { Origin: 'https://attacker.example' },
    data: { email: 'invalid@example.test', password: crypto.randomUUID() },
  });
  expect(hostile.status()).toBe(403);
  expect((await request.post('/api/auth/logout')).status()).toBe(403);
  expect(
    (await request.post('/api/demo', { headers: { Origin: origin }, data: {} })).status(),
  ).toBe(405);
  expect(
    (await request.delete('/api/demo/traces/example', { headers: { Origin: origin } })).status(),
  ).toBe(405);
  expect(
    (
      await request.post('/api/events/batch', { headers: { Origin: origin }, data: { events: [] } })
    ).status(),
  ).toBe(404);
  expect((await request.get('/api/projects')).status()).toBe(401);
  const oversized = await request.post('/api/auth/login', {
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    data: JSON.stringify({
      email: 'invalid@example.test',
      password: crypto.randomUUID().repeat(512),
    }),
  });
  expect(oversized.status()).toBe(413);
});

test('BFF cookies enforce ownership, key secrecy and escaped long project text on mobile', async ({
  page,
  playwright,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const owner = page.context().request;
  const attacker = await playwright.request.newContext({ baseURL });
  const suffix = crypto.randomUUID();
  const projectName = 'W'.repeat(80);
  const description = `<img src=x onerror=alert(1)> ${'s'.repeat(400)}`;
  let projectId: string | undefined;
  try {
    const first = await owner.post('/api/auth/register', {
      headers: { Origin: origin },
      data: {
        email: `security-owner-${suffix}@example.test`,
        password: crypto.randomUUID(),
      },
    });
    expect(first.status()).toBe(201);
    const second = await attacker.post('/api/auth/register', {
      headers: { Origin: origin },
      data: {
        email: `security-other-${suffix}@example.test`,
        password: crypto.randomUUID(),
      },
    });
    expect(second.status()).toBe(201);
    const cookies = await page.context().cookies();
    expect(cookies.find((cookie) => cookie.name === 'traceai_session')?.httpOnly).toBe(true);
    const created = await owner.post('/api/projects', {
      headers: { Origin: origin },
      data: { name: projectName, description },
    });
    expect(created.status()).toBe(201);
    const project = (await created.json()) as Project;
    projectId = project.id;
    expect((await attacker.get(`/api/projects/${projectId}`)).status()).toBe(404);
    expect((await attacker.get(`/api/projects/${projectId}/api-keys`)).status()).toBe(404);
    expect(
      (
        await attacker.patch(`/api/projects/${projectId}`, {
          headers: { Origin: origin },
          data: { name: 'Taken over' },
        })
      ).status(),
    ).toBe(404);
    expect(
      (
        await attacker.delete(`/api/projects/${projectId}`, {
          headers: { Origin: origin },
          data: { confirmName: projectName },
        })
      ).status(),
    ).toBe(404);
    const minted = await owner.post(`/api/projects/${projectId}/api-keys`, {
      headers: { Origin: origin },
    });
    expect(minted.status()).toBe(201);
    const key = (await minted.json()) as { apiKey: ApiKey; key: string };
    const listText = await (await owner.get(`/api/projects/${projectId}/api-keys`)).text();
    expect(listText.includes(key.key)).toBe(false);
    expect(listText).not.toContain('keyHash');
    expect(listText).not.toContain('keySalt');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/projects');
    await expect(page.getByRole('link', { name: projectName, exact: false })).toBeVisible();
    await expect(page.getByText(description, { exact: true })).toBeVisible();
    await expect(page.locator('img[src="x"]')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(await page.evaluate(() => document.cookie.includes('traceai_session'))).toBe(false);
  } finally {
    if (projectId) {
      await owner.delete(`/api/projects/${projectId}`, {
        headers: { Origin: origin },
        data: { confirmName: projectName },
      });
    }
    await owner.post('/api/auth/logout', { headers: { Origin: origin } });
    await attacker.post('/api/auth/logout', { headers: { Origin: origin } });
    await attacker.dispose();
  }
});
