import { describe, expect, it } from 'vitest';
import {
  builtInPricingRegistry,
  generatePricingImportSql,
  pricingRegistrySchema,
  validatePricingImport,
} from './pricing-registry';

const entry = builtInPricingRegistry.entries[0]!;
describe('sourced immutable pricing registry', () => {
  it('ships two official base-price snapshots from actual verification time, not invented historical dates', () => {
    expect(
      builtInPricingRegistry.entries.map((value) => [
        value.provider,
        value.model,
        value.inputNanoUsdPerMillion,
        value.outputNanoUsdPerMillion,
      ]),
    ).toEqual([
      ['openai', 'gpt-4.1-mini', '400000000', '1600000000'],
      ['anthropic', 'claude-sonnet-4-6', '3000000000', '15000000000'],
    ]);
    expect(
      builtInPricingRegistry.entries.every(
        (value) => value.effectiveFrom === value.verifiedAt && !value.simulated,
      ),
    ).toBe(true);
  });
  it.each([
    { inputNanoUsdPerMillion: '-1' },
    { outputNanoUsdPerMillion: '1.5' },
    { inputNanoUsdPerMillion: '0001' },
    { simulated: true },
    { currency: 'EUR' },
    { unknown: 'not allowed' },
    { effectiveFrom: '2020-01-01T00:00:00.000Z' },
    { effectiveTo: entry.effectiveFrom },
    { sourceUrl: 'http://developers.openai.com/api/docs/models/gpt-4.1-mini' },
    { sourceUrl: 'https://unverified.example/pricing' },
    {
      verifiedAt: new Date(Date.now() + 60_000).toISOString(),
      effectiveFrom: new Date(Date.now() + 60_000).toISOString(),
    },
  ])('rejects unverified/invalid snapshot fields %j', (changes) => {
    expect(
      pricingRegistrySchema.safeParse({ version: 1, entries: [{ ...entry, ...changes }] }).success,
    ).toBe(false);
  });
  it('rejects source URL credentials', () => {
    const source = new URL(entry.sourceUrl);
    source.username = crypto.randomUUID();
    source.password = crypto.randomUUID();
    expect(
      pricingRegistrySchema.safeParse({
        version: 1,
        entries: [{ ...entry, sourceUrl: source.href }],
      }).success,
    ).toBe(false);
  });
  it('rejects duplicate version IDs and overlapping windows but permits adjacent versions', () => {
    expect(pricingRegistrySchema.safeParse({ version: 1, entries: [entry, entry] }).success).toBe(
      false,
    );
    expect(
      pricingRegistrySchema.safeParse({ version: 1, entries: [entry, { ...entry, id: 'next' }] })
        .success,
    ).toBe(false);
    const boundary = '2027-01-01T00:00:00.000Z';
    expect(
      pricingRegistrySchema.safeParse({
        version: 1,
        entries: [
          { ...entry, effectiveTo: boundary },
          { ...entry, id: 'next', effectiveFrom: boundary },
        ],
      }).success,
    ).toBe(true);
  });
  it('allows exact repeats but rejects overwrites and overlaps against stored history', () => {
    expect(() =>
      validatePricingImport(builtInPricingRegistry, builtInPricingRegistry.entries),
    ).not.toThrow();
    expect(() =>
      validatePricingImport({ version: 1, entries: [{ ...entry, inputNanoUsdPerMillion: '1' }] }, [
        entry,
      ]),
    ).toThrow('immutable');
    expect(() =>
      validatePricingImport({ version: 1, entries: [{ ...entry, id: 'overlap' }] }, [entry]),
    ).toThrow('overlaps');
  });
  it('generates a single atomic insert and never updates or replaces historical versions', () => {
    const sql = generatePricingImportSql(builtInPricingRegistry);
    expect(sql).toContain('FROM json_each(');
    expect(sql).toContain('ON CONFLICT(id) DO NOTHING');
    expect(sql).not.toMatch(/\b(?:UPDATE|REPLACE|DELETE)\b/);
    expect(sql.split(';').filter(Boolean)).toHaveLength(1);
  });
});
