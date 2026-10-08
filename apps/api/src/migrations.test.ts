import { readFileSync } from 'node:fs';
import { unstable_splitSqlQuery } from 'wrangler';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('../../../packages/database/migrations/0002_debugging_and_pricing.sql', import.meta.url),
  'utf8',
);

describe('pricing migration transport compatibility', () => {
  it('parenthesizes CASE expressions for the remote D1 query parser and uses uppercase BEGIN with LF', () => {
    // Local SQLite accepts bare CASE..END; the remote /query splitter does not (#4727).
    expect(migration).not.toContain('\r');
    expect(migration).not.toMatch(/\bSELECT\s+CASE\b/i);
    expect(migration.match(/SELECT \(CASE/g)).toHaveLength(4);
    expect(migration.match(/^BEGIN$/gm)).toHaveLength(3);
  });

  it('retains all additive columns and complete immutable guards through the actual Wrangler splitter', () => {
    const statements = unstable_splitSqlQuery(migration);
    expect(statements).toHaveLength(6);
    expect(statements.filter((statement) => statement.startsWith('ALTER TABLE'))).toHaveLength(3);
    for (const guard of ['insert', 'delete', 'update']) {
      const statement = statements.find((item) =>
        item.includes(`CREATE TRIGGER pricing_registry_${guard}_guard`),
      );
      expect(statement).toBeDefined();
      expect(statement?.trim()).toMatch(/END$/);
      expect(statement).toContain('RAISE(ABORT,');
    }
  });
});
