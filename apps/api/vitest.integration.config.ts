import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

const vitestDirectory = realpathSync(
  fileURLToPath(new URL('../../node_modules/vitest', import.meta.url)),
);

export default defineConfig({
  // Test imports must share the native Workerd runner's canonical Vitest module identity.
  resolve: {
    alias: [
      { find: /^vitest$/, replacement: `${vitestDirectory}/dist/index.js` },
      { find: /^vitest\//, replacement: `${vitestDirectory}/dist/` },
    ],
  },
  plugins: [
    cloudflareTest(async () => ({
      remoteBindings: false,
      wrangler: { configPath: fileURLToPath(new URL('./wrangler.jsonc', import.meta.url)) },
      miniflare: {
        bindings: {
          ENVIRONMENT: 'development',
          WEB_ORIGIN: 'http://localhost:3000',
          TEST_MIGRATIONS: await readD1Migrations(
            fileURLToPath(new URL('../../packages/database/migrations/', import.meta.url)),
          ),
        },
      },
    })),
  ],
  test: { include: ['test/**/*.integration.test.ts'], setupFiles: ['./test/setup.ts'] },
});
