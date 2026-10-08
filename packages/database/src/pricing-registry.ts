import { z } from 'zod';

const timestamp = z.iso.datetime().transform((value) => new Date(value).toISOString());
const identifier = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-zA-Z0-9._-]+$/);
const amount = z.string().regex(/^(?:0|[1-9]\d{0,19})$/);
const sourceUrl = z
  .url()
  .max(2048)
  .refine((value) => {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
  });

export const pricingEntrySchema = z
  .object({
    id: identifier,
    provider: z.enum(['openai', 'anthropic']),
    model: identifier,
    inputNanoUsdPerMillion: amount,
    outputNanoUsdPerMillion: amount,
    currency: z.literal('USD'),
    effectiveFrom: timestamp,
    effectiveTo: timestamp.nullable(),
    sourceUrl,
    simulated: z.literal(false),
    verifiedAt: timestamp,
    billingBasis: z.literal('base-text-global'),
  })
  .strict()
  .refine((entry) => entry.effectiveTo === null || entry.effectiveTo > entry.effectiveFrom, {
    message: 'A price window must have a strictly increasing end',
  })
  .refine((entry) => entry.effectiveFrom >= entry.verifiedAt, {
    message: 'A verified snapshot cannot price operations before its verification',
  })
  .refine((entry) => Date.parse(entry.verifiedAt) <= Date.now(), {
    message: 'Verification must not be in the future',
  })
  .refine(
    (entry) =>
      new URL(entry.sourceUrl).hostname ===
      (entry.provider === 'openai' ? 'developers.openai.com' : 'platform.claude.com'),
    { message: 'Use the provider official source domain' },
  );

export type PricingEntry = z.infer<typeof pricingEntrySchema>;
export const pricingRegistrySchema = z
  .object({ version: z.literal(1), entries: z.array(pricingEntrySchema).min(1).max(100) })
  .strict()
  .superRefine(({ entries }, context) => {
    for (const [index, entry] of entries.entries()) {
      if (entries.slice(0, index).some((previous) => previous.id === entry.id))
        context.addIssue({ code: 'custom', message: 'Duplicate pricing version ID' });
      if (entries.slice(0, index).some((previous) => priceWindowsOverlap(previous, entry)))
        context.addIssue({ code: 'custom', message: 'Pricing windows overlap' });
    }
  });
export type PricingRegistry = z.infer<typeof pricingRegistrySchema>;

// Snapshot observed Oct 9 Taipei. These are NOT claimed provider historical effective dates.
const verifiedAt = '2026-10-08T19:38:52.000Z';
export const builtInPricingRegistry: PricingRegistry = pricingRegistrySchema.parse({
  version: 1,
  entries: [
    {
      id: 'openai-gpt-4.1-mini-2026-10-09',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      inputNanoUsdPerMillion: '400000000',
      outputNanoUsdPerMillion: '1600000000',
      currency: 'USD',
      effectiveFrom: verifiedAt,
      effectiveTo: null,
      sourceUrl: 'https://developers.openai.com/api/docs/models/gpt-4.1-mini',
      simulated: false,
      verifiedAt,
      billingBasis: 'base-text-global',
    },
    {
      id: 'anthropic-claude-sonnet-4-6-2026-10-09',
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      inputNanoUsdPerMillion: '3000000000',
      outputNanoUsdPerMillion: '15000000000',
      currency: 'USD',
      effectiveFrom: verifiedAt,
      effectiveTo: null,
      sourceUrl: 'https://platform.claude.com/docs/en/about-claude/pricing',
      simulated: false,
      verifiedAt,
      billingBasis: 'base-text-global',
    },
  ],
});
for (const entry of builtInPricingRegistry.entries) Object.freeze(entry);
Object.freeze(builtInPricingRegistry.entries);
Object.freeze(builtInPricingRegistry);

export interface StoredPricingEntry {
  id: string;
  provider: string;
  model: string;
  inputNanoUsdPerMillion: string;
  outputNanoUsdPerMillion: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  sourceUrl: string;
  simulated: boolean | number;
  verifiedAt: string | null;
  billingBasis: string | null;
}
export const storedPricingEntrySchema = z
  .object({
    id: identifier,
    provider: identifier,
    model: identifier,
    inputNanoUsdPerMillion: amount,
    outputNanoUsdPerMillion: amount,
    currency: z.string().min(1).max(10),
    effectiveFrom: timestamp,
    effectiveTo: timestamp.nullable(),
    sourceUrl: z.string().min(1).max(2048),
    simulated: z.union([z.boolean(), z.literal(0), z.literal(1)]),
    verifiedAt: timestamp.nullable(),
    billingBasis: z.string().max(100).nullable(),
  })
  .strict();

export function parsePricingPreflightResult(value: unknown): StoredPricingEntry[] {
  const parsed = z
    .array(z.object({ success: z.literal(true), results: z.array(storedPricingEntrySchema) }))
    .parse(value);
  const rows = parsed.flatMap((item) => item.results);
  if (rows.length > 10000) throw new Error('Registry history exceeds the bounded preflight limit.');
  return rows;
}

export function priceWindowsOverlap(
  first: StoredPricingEntry,
  second: StoredPricingEntry,
): boolean {
  return (
    !first.simulated &&
    !second.simulated &&
    first.provider === second.provider &&
    first.model === second.model &&
    first.currency === second.currency &&
    first.effectiveFrom < (second.effectiveTo ?? '9999-12-31T23:59:59.999Z') &&
    second.effectiveFrom < (first.effectiveTo ?? '9999-12-31T23:59:59.999Z')
  );
}

const immutableValues = (entry: StoredPricingEntry) =>
  JSON.stringify([
    entry.id,
    entry.provider,
    entry.model,
    entry.inputNanoUsdPerMillion,
    entry.outputNanoUsdPerMillion,
    entry.currency,
    entry.effectiveFrom,
    entry.effectiveTo,
    entry.sourceUrl,
    Boolean(entry.simulated),
    entry.verifiedAt,
    entry.billingBasis,
  ]);

export function validatePricingImport(
  registry: PricingRegistry,
  existing: readonly StoredPricingEntry[],
): void {
  for (const entry of pricingRegistrySchema.parse(registry).entries) {
    const sameId = existing.find((record) => record.id === entry.id);
    if (sameId && immutableValues(sameId) !== immutableValues(entry))
      throw new Error(
        `Pricing version ${entry.id} already exists with different immutable values.`,
      );
    if (existing.some((record) => record.id !== entry.id && priceWindowsOverlap(record, entry)))
      throw new Error(`Pricing version ${entry.id} overlaps a stored effective window.`);
  }
}

export function generatePricingImportSql(input: PricingRegistry): string {
  const registry = pricingRegistrySchema.parse(input);
  const json = JSON.stringify(registry.entries).replaceAll("'", "''");
  const sql = `INSERT INTO model_pricing
  (id,provider,model,input_nano_usd_per_million,output_nano_usd_per_million,currency,effective_from,effective_to,source_url,simulated,verified_at,billing_basis)
SELECT json_extract(value,'$.id'),json_extract(value,'$.provider'),json_extract(value,'$.model'),
  json_extract(value,'$.inputNanoUsdPerMillion'),json_extract(value,'$.outputNanoUsdPerMillion'),
  json_extract(value,'$.currency'),json_extract(value,'$.effectiveFrom'),json_extract(value,'$.effectiveTo'),
  json_extract(value,'$.sourceUrl'),0,json_extract(value,'$.verifiedAt'),json_extract(value,'$.billingBasis')
FROM json_each('${json}') WHERE 1 ON CONFLICT(id) DO NOTHING;`;
  if (new TextEncoder().encode(sql).length > 90 * 1024)
    throw new Error('Pricing import exceeds the bounded 90 KiB SQL statement budget.');
  return sql;
}

export function pricingPreflightSql(registry: PricingRegistry): string {
  const requested = JSON.stringify(
    pricingRegistrySchema
      .parse(registry)
      .entries.map(({ id, provider, model }) => ({ id, provider, model })),
  ).replaceAll("'", "''");
  return `SELECT id,provider,model,input_nano_usd_per_million AS inputNanoUsdPerMillion,
  output_nano_usd_per_million AS outputNanoUsdPerMillion,currency,effective_from AS effectiveFrom,
  effective_to AS effectiveTo,source_url AS sourceUrl,simulated,verified_at AS verifiedAt,billing_basis AS billingBasis
FROM model_pricing p WHERE EXISTS (SELECT 1 FROM json_each('${requested}')
  WHERE p.id=json_extract(value,'$.id') OR (p.provider=json_extract(value,'$.provider') AND p.model=json_extract(value,'$.model')))
LIMIT 10001;`;
}
