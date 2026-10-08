import { defineConfig } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const remote = process.env.TRACEAI_E2E_BASE_URL;
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  workers: 2,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: { baseURL: remote ?? 'http://localhost:3000', trace: 'retain-on-failure' },
  webServer: remote
    ? undefined
    : {
        command: process.env.TRACEAI_E2E_WORKERS
          ? 'bunx --no-install concurrently -k -n api,web "bun run --filter @traceai/api dev" "bun run --filter @traceai/web preview:built"'
          : 'bun run dev',
        url: 'http://localhost:3000',
        // Force-killed servers leave fresh registry entries; both children share a new namespace.
        env: { WRANGLER_REGISTRY_PATH: join(tmpdir(), `traceai-e2e-${randomUUID()}`) },
        reuseExistingServer: !process.env.CI && !process.env.TRACEAI_E2E_WORKERS,
        timeout: 120_000,
      },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  reporter: [['list'], ['html', { open: 'never' }]],
});
