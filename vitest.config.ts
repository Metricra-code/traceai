import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: {
    // Adapter unit tests run before package builds in a fresh checkout; public tarballs stay dist-only.
    alias: {
      '@akai_80percent/traceai-sdk': fileURLToPath(
        new URL('./packages/sdk/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    include: [
      'packages/**/*.test.ts',
      'apps/api/src/**/*.test.ts',
      'examples/gemini-demo/src/**/*.test.ts',
      'scripts/**/*.test.ts',
    ],
    exclude: ['**/node_modules/**', '**/dist/**'],
    coverage: {
      provider: 'v8',
      include: [
        'packages/sdk/src/**/*.ts',
        'packages/shared/src/**/*.ts',
        'apps/api/src/services/**/*.ts',
      ],
    },
  },
});
