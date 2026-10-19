import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import tseslint from 'typescript-eslint';
import { importX } from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import reactHooks from 'eslint-plugin-react-hooks';
import repository from '../../eslint.config.mjs';

const source = join(import.meta.dirname, 'src');
const features = readdirSync(join(source, 'features'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

export default tseslint.config(...repository, {
  files: ['src/**/*.{ts,tsx}'],
  plugins: { 'import-x': importX, 'react-hooks': reactHooks },
  settings: {
    'import-x/extensions': ['.ts', '.tsx'],
    'import-x/parsers': { '@typescript-eslint/parser': ['.ts', '.tsx'] },
    'import-x/resolver-next': [
      createTypeScriptImportResolver({
        project: join(import.meta.dirname, 'tsconfig.json'),
      }),
    ],
  },
  rules: {
    ...reactHooks.configs.recommended.rules,
    'import-x/no-cycle': 'error',
    'import-x/no-restricted-paths': [
      'error',
      {
        basePath: source,
        zones: [
          {
            target: ['./components', './lib', './features'],
            from: './app',
            message: 'Routes compose features; nothing imports from app/.',
          },
          {
            target: ['./components', './lib'],
            from: './features',
            message: 'Shared code must not depend on a feature.',
          },
          {
            target: './lib',
            from: './components',
            message: 'lib/ must not depend on components/.',
          },
          ...features.map((feature) => ({
            target: `./features/${feature}`,
            from: './features',
            except: [
              `./${feature}`,
              ...features
                .filter((other) => other !== feature)
                .map((other) => `./${other}/index.ts`),
            ],
            message: 'Import another feature only through its index.',
          })),
        ],
      },
    ],
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@/features/*/*'],
            message: 'Import a feature through its public index: @/features/<name>.',
          },
        ],
      },
    ],
  },
});
