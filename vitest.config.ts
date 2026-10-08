import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/api/src/**/*.test.ts'],
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
