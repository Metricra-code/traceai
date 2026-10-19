import { expect, test } from '@playwright/test';
const endpoint = process.env.TRACEAI_E2E_API_URL ?? 'http://127.0.0.1:8787';
test('Worker health confirms the D1 connection', async ({ request }) => {
  await expect
    .poll(async () => {
      try {
        return (await request.get(`${endpoint}/health`)).status();
      } catch {
        return 0;
      }
    })
    .toBe(200);
  const response = await request.get(`${endpoint}/health`);
  expect(await response.json()).toMatchObject({ status: 'ok', service: 'traceai-api' });
});
