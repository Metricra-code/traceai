import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createIngestionKey } from '../../apps/api/src/services/api-keys';

if (!process.argv.includes('--local-only'))
  throw new Error(
    'Explicit --local-only is required. This script must never provision a deployed database.',
  );
const outputDirectory = fileURLToPath(new URL('../../.local/', import.meta.url));
const key = await createIngestionKey();
const projectId = `local_${crypto.randomUUID()}`;
const createdAt = new Date().toISOString();
const literal = (value: string): string => `'${value.replaceAll("'", "''")}'`;
const sql =
  [
    'PRAGMA foreign_keys = ON;',
    `INSERT OR IGNORE INTO users (id,email,password_hash,created_at,updated_at) VALUES ('local-sdk-owner','local-sdk@example.invalid','disabled:local-only',${literal(createdAt)},${literal(createdAt)});`,
    `INSERT INTO projects (id,owner_id,name,description,created_at,updated_at) VALUES (${literal(projectId)},'local-sdk-owner','Local SDK project','Real locally ingested telemetry; not the simulated demo',${literal(createdAt)},${literal(createdAt)});`,
    `INSERT INTO api_keys (id,project_id,key_hash,key_salt,key_prefix,created_at) VALUES (${[key.id, projectId, key.keyHash, key.keySalt, key.keyPrefix, createdAt].map(literal).join(',')});`,
  ].join('\n') + '\n';

await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
// Exclusive creation prevents accidentally overwriting an existing one-time secret.
await writeFile(
  join(outputDirectory, 'ingestion.env'),
  `TRACEAI_API_KEY=${key.rawKey}\nTRACEAI_PROJECT_ID=${projectId}\nTRACEAI_ENDPOINT=http://localhost:8787\n`,
  { flag: 'wx', mode: 0o600 },
);
await writeFile(join(outputDirectory, 'bootstrap.sql'), sql, { flag: 'wx', mode: 0o600 });
console.info('Local key written once to .local/ingestion.env (mode 0600); no raw secret printed.');
console.info('Apply only to local D1: bun run --filter @traceai/api db:bootstrap');
