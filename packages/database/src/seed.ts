import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { DEMO_ANCHOR, DEMO_MODELS, createDemoTraces } from './demo';
const anchor = z.iso.datetime().parse(process.env.DEMO_ANCHOR ?? DEMO_ANCHOR);
const sqlValue = (value: string | number | null | undefined): string =>
  value == null
    ? 'NULL'
    : typeof value === 'number'
      ? String(value)
      : `'${value.replaceAll("'", "''")}'`;
const statements = [
  'PRAGMA foreign_keys = ON;',
  `INSERT OR IGNORE INTO users (id,email,password_hash,created_at,updated_at) VALUES ('demo-owner','demo@invalid.example','disabled',${sqlValue(anchor)},${sqlValue(anchor)});`,
  `INSERT OR IGNORE INTO projects (id,owner_id,name,description,created_at,updated_at) VALUES ('demo','demo-owner','TraceAI Demo','10,000 simulated requests. Fictional models and prices.',${sqlValue(anchor)},${sqlValue(anchor)});`,
  "DELETE FROM traces WHERE project_id = 'demo';",
  ...DEMO_MODELS.filter((model) => model.provider !== 'unknown').map(
    (model) =>
      `INSERT OR IGNORE INTO model_pricing (id,provider,model,input_nano_usd_per_million,output_nano_usd_per_million,currency,effective_from,effective_to,source_url,simulated) VALUES (${[`demo-pricing-${model.provider}`, model.provider, model.model, model.inputNanoUsdPerMillion, model.outputNanoUsdPerMillion, 'USD', '2020-01-01T00:00:00.000Z', null, 'https://github.com/Metricra-code/traceai/blob/main/docs/demo.md', 1].map(sqlValue).join(',')});`,
  ),
  ...createDemoTraces(anchor).map(
    ({ event, estimatedCostNanoUsd, pricingVersion }) =>
      `INSERT INTO traces (id,project_id,trace_id,name,provider,model,status,started_at,ended_at,duration_ms,input_tokens,output_tokens,estimated_cost_nano_usd,pricing_version,error_type,metadata_json,created_at) VALUES (${[event.traceId, 'demo', event.traceId, event.name, event.provider, event.model, event.status, event.startedAt, event.endedAt, event.durationMs, event.inputTokens, event.outputTokens, estimatedCostNanoUsd === null ? null : Number(estimatedCostNanoUsd), pricingVersion, event.errorType, JSON.stringify(event.metadata), anchor].map(sqlValue).join(',')});`,
  ),
];
await writeFile(fileURLToPath(new URL('../seed.sql', import.meta.url)), statements.join('\n'));
process.stdout
  .write(`Generated exactly 10,000 simulated events (anchor ${anchor}). Run the local D1 seed command.
`);
