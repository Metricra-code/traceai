import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  builtInPricingRegistry,
  generatePricingImportSql,
  pricingPreflightSql,
  pricingRegistrySchema,
  validatePricingImport,
  parsePricingPreflightResult,
} from '../packages/database/src/pricing-registry';

function options(arguments_: string[]) {
  const args = [...arguments_];
  const local = args.includes('--local');
  const remote = args.includes('--remote');
  const fileIndex = args.indexOf('--file');
  const file = fileIndex >= 0 ? args[fileIndex + 1] : undefined;
  if (local === remote || (fileIndex >= 0 && (!file || file.startsWith('--'))))
    throw new Error('Choose exactly one of --local/--remote; --file requires a JSON path.');
  const permitted = new Set([
    '--local',
    '--remote',
    '--dry-run',
    '--confirm-remote',
    '--file',
    file,
  ]);
  if (args.some((argument) => !permitted.has(argument)))
    throw new Error('Unknown pricing import option.');
  const dryRun = args.includes('--dry-run');
  if (remote && !dryRun && !args.includes('--confirm-remote'))
    throw new Error(
      'Remote writes require explicit --confirm-remote. Use --remote --dry-run first.',
    );
  return { scope: local ? '--local' : '--remote', dryRun, file };
}

function executeWrangler(scope: string, command: string): unknown {
  const result = spawnSync(
    'bun',
    ['run', 'cf', 'd1', 'execute', 'traceai-db', scope, '--command', command, '--json'],
    {
      cwd: fileURLToPath(new URL('../apps/api', import.meta.url)),
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (result.status !== 0)
    throw new Error(
      `Wrangler pricing query failed (exit ${result.status ?? 'unknown'}). Check Cloudflare login, migration and explicit target configuration.`,
    );
  try {
    return JSON.parse(result.stdout) as unknown;
  } catch {
    throw new Error(
      'Wrangler returned an invalid pricing query response. No database writes were attempted.',
    );
  }
}

async function loadRegistry(file: string | undefined) {
  if (!file) return builtInPricingRegistry;
  if ((await stat(file)).size > 128 * 1024) throw new Error('Registry JSON exceeds 128 KiB.');
  return pricingRegistrySchema.parse(JSON.parse(await readFile(file, 'utf8')));
}

const flags = options(process.argv.slice(2));
const registry = await loadRegistry(flags.file);
const sql = generatePricingImportSql(registry);
const existing = parsePricingPreflightResult(
  executeWrangler(flags.scope, pricingPreflightSql(registry)),
);
validatePricingImport(registry, existing);
if (flags.dryRun) {
  console.log(
    `-- Validated ${registry.entries.length} immutable snapshots; target ${flags.scope}; NO WRITES.`,
  );
  console.log(sql);
} else {
  const directory = await mkdtemp(join(tmpdir(), 'traceai-pricing-'));
  try {
    const path = join(directory, 'import.sql');
    await writeFile(path, sql, { mode: 0o600 });
    const result = spawnSync(
      'bun',
      ['run', 'cf', 'd1', 'execute', 'traceai-db', flags.scope, '--file', path, '--json'],
      {
        cwd: fileURLToPath(new URL('../apps/api', import.meta.url)),
        encoding: 'utf8',
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    if (result.status !== 0)
      throw new Error(
        'Pricing import failed; immutable/window guards abort the entire statement. No automatic retries or deployments were attempted.',
      );
    console.log(
      `Imported ${registry.entries.length} snapshots into ${flags.scope}; identical versions remain unchanged.`,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
