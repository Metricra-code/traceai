import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const seed = spawnSync('bun', ['run', 'db:seed', '--json'], {
  cwd: fileURLToPath(new URL('../apps/api/', import.meta.url)),
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});
if (seed.status !== 0) {
  process.stderr.write(seed.stderr || 'Local D1 seed failed. Run migrations first.\n');
  process.exit(seed.status ?? 1);
}
const results = JSON.parse(seed.stdout) as { success: boolean }[];
if (!results.every((result) => result.success))
  throw new Error('Local D1 seed returned unsuccessful statements');
process.stdout.write(
  `Local demo seed succeeded: ${results.length} statements; 10,000 simulated traces.\n`,
);
