import { env, exports } from 'cloudflare:workers';
import {
  createExecutionContext,
  createScheduledController,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import {
  ERROR_CAPTURE_POLICY,
  MAX_METADATA_BYTES,
  type TraceEvent,
  type Trace,
} from '@traceai/shared';
import {
  builtInPricingRegistry,
  generatePricingImportSql,
} from '../../../packages/database/src/pricing-registry';
import { createIngestionKey } from '../src/services/api-keys';
import { newSession, SESSION_COOKIE_NAME } from '../src/services/auth-sessions';
import { CLEANUP_ROW_LIMIT, pruneExpiredAuthState } from '../src/services/cleanup';
import worker from '../src';

const verifiedAt = builtInPricingRegistry.entries[0]!.verifiedAt;
const event: TraceEvent = {
  traceId: 'priced-trace',
  name: 'explicit operation',
  provider: 'openai',
  model: 'gpt-4.1-mini',
  status: 'success',
  startedAt: verifiedAt,
  endedAt: new Date(Date.parse(verifiedAt) + 100).toISOString(),
  durationMs: 100,
  inputTokens: 1000,
  outputTokens: 100,
};

async function fixture() {
  await env.DB.prepare('INSERT INTO users VALUES (?,?,?,?,?)')
    .bind('owner', 'owner@example.test', 'disabled-test-login', verifiedAt, verifiedAt)
    .run();
  await env.DB.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?)')
    .bind('project', 'owner', 'project', '', verifiedAt, verifiedAt)
    .run();
  const key = await createIngestionKey();
  await env.DB.prepare(
    'INSERT INTO api_keys (id,project_id,key_hash,key_salt,key_prefix,created_at) VALUES (?,?,?,?,?,?)',
  )
    .bind(key.id, 'project', key.keyHash, key.keySalt, key.keyPrefix, verifiedAt)
    .run();
  const session = await newSession('owner');
  await env.DB.prepare('INSERT INTO sessions VALUES (?,?,?,?)')
    .bind(session.record.id, 'owner', session.record.expiresAt, session.record.createdAt)
    .run();
  return { key: key.rawKey, cookie: `${SESSION_COOKIE_NAME}=${session.token}` };
}
const ingest = (key: string, events: unknown[]) =>
  exports.default.fetch('https://traceai.test/v1/events/batch', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ events }),
  });
const detail = async (cookie: string, id: string): Promise<Trace> =>
  (
    await exports.default.fetch(`https://traceai.test/v1/projects/project/traces/${id}`, {
      headers: { cookie },
    })
  ).json();

describe('completion contracts on actual migrated D1', () => {
  it('imports both sourced snapshots idempotently and returns priced provenance without rewriting older unpriced events', async () => {
    const { key, cookie } = await fixture();
    await ingest(key, [{ ...event, traceId: 'before-import' }]);
    const sql = generatePricingImportSql(builtInPricingRegistry);
    await env.DB.prepare(sql).run();
    await env.DB.prepare(sql).run();
    expect(await env.DB.prepare('SELECT count(*) FROM model_pricing').first('count(*)')).toBe(2);
    const before = new Date(Date.parse(verifiedAt) - 1).toISOString();
    expect(
      (
        await ingest(key, [
          event,
          { ...event, traceId: 'before-verification', startedAt: before, endedAt: verifiedAt },
          {
            ...event,
            traceId: 'claude',
            provider: 'anthropic',
            model: 'claude-sonnet-4-6',
            inputTokens: 2000,
            outputTokens: 500,
          },
        ])
      ).status,
    ).toBe(202);
    const trace = await detail(cookie, event.traceId);
    expect(trace.estimatedCostNanoUsd).toBe('560000');
    const { id, ...expectedPricing } = builtInPricingRegistry.entries[0]!;
    expect(trace.pricing).toStrictEqual({ ...expectedPricing, version: id });
    expect((await detail(cookie, 'claude')).estimatedCostNanoUsd).toBe('13500000');
    expect((await detail(cookie, 'before-verification')).estimatedCostNanoUsd).toBeNull();
    expect((await detail(cookie, 'before-import')).estimatedCostNanoUsd).toBeNull();
  });

  it('protects immutable versions and atomically rolls back an import with an existing overlap', async () => {
    await env.DB.prepare(generatePricingImportSql(builtInPricingRegistry)).run();
    const original = builtInPricingRegistry.entries[0]!;
    await expect(
      env.DB.prepare(
        generatePricingImportSql({
          version: 1,
          entries: [{ ...original, inputNanoUsdPerMillion: '1' }],
        }),
      ).run(),
    ).rejects.toThrow('pricing_version_immutable');
    await expect(
      env.DB.prepare("UPDATE model_pricing SET source_url = 'https://invalid.example' WHERE id = ?")
        .bind(original.id)
        .run(),
    ).rejects.toThrow('pricing_version_immutable');
    await expect(
      env.DB.prepare('DELETE FROM model_pricing WHERE id = ?').bind(original.id).run(),
    ).rejects.toThrow('pricing_version_immutable');
    await expect(
      env.DB.prepare(
        generatePricingImportSql({
          version: 1,
          entries: [
            { ...original, id: 'first-new-entry', model: 'different-fixture-model' },
            { ...original, id: 'conflicting-entry' },
          ],
        }),
      ).run(),
    ).rejects.toThrow('pricing_window_overlap');
    expect(await env.DB.prepare('SELECT count(*) FROM model_pricing').first('count(*)')).toBe(2);
    expect(
      await env.DB.prepare('SELECT input_nano_usd_per_million FROM model_pricing WHERE id = ?')
        .bind(original.id)
        .first('input_nano_usd_per_million'),
    ).toBe(original.inputNanoUsdPerMillion);
  });

  it('stores only marked sanitized explicit summaries and sanitizes them again at read time', async () => {
    const { key, cookie } = await fixture();
    const secret = crypto.randomUUID();
    const error = {
      ...event,
      status: 'error',
      errorType: 'rate_limit',
      errorSummary: `HTTP 429 retry after 30s; Authorization: Bearer ${secret}; user@example.test`,
    };
    expect((await ingest(key, [error])).status).toBe(202);
    const stored = await env.DB.prepare(
      'SELECT error_message,error_capture_policy FROM traces',
    ).first<{ error_message: string; error_capture_policy: string }>();
    expect(stored?.error_capture_policy).toBe(ERROR_CAPTURE_POLICY);
    expect(stored?.error_message).toContain('HTTP 429 retry after 30s');
    expect(stored?.error_message).not.toContain(secret);
    expect(stored?.error_message).not.toContain('user@example.test');
    await env.DB.prepare('UPDATE traces SET error_message = ?')
      .bind(`Safe operator context; Bearer ${secret}`)
      .run();
    expect((await detail(cookie, event.traceId)).errorSummary).toBe(
      'Safe operator context; [redacted-auth]',
    );
    await env.DB.prepare(
      "UPDATE traces SET error_capture_policy = NULL, error_message = 'legacy-sensitive-error'",
    ).run();
    const legacy = await detail(cookie, event.traceId);
    expect(legacy).not.toHaveProperty('errorSummary');
    expect(JSON.stringify(legacy)).not.toContain('legacy-sensitive-error');
  });

  it('accepts the explicit summary boundary and rejects summaries on successful operations or raw errorMessage atomically', async () => {
    const { key } = await fixture();
    expect(
      (await ingest(key, [{ ...event, status: 'error', errorSummary: '漢'.repeat(1000) }])).status,
    ).toBe(202);
    for (const invalid of [
      { ...event, traceId: 'invalid', status: 'error', errorSummary: 'x'.repeat(1001) },
      { ...event, traceId: 'invalid', errorSummary: 'Success is not an error' },
      { ...event, traceId: 'invalid', status: 'error', errorMessage: 'Not a supported raw field' },
    ])
      expect((await ingest(key, [{ ...event, traceId: 'preceding-valid' }, invalid])).status).toBe(
        400,
      );
    expect(await env.DB.prepare('SELECT count(*) FROM traces').first('count(*)')).toBe(1);
  });

  it('enforces exact 8KiB metadata bytes and rejects one extra byte before any insert', async () => {
    const { key } = await fixture();
    const base = {
      a: 'x'.repeat(2000),
      b: 'x'.repeat(2000),
      c: 'x'.repeat(2000),
      d: 'x'.repeat(2000),
    };
    const padding =
      MAX_METADATA_BYTES - new TextEncoder().encode(JSON.stringify({ ...base, e: '' })).length;
    const metadata = { ...base, e: 'x'.repeat(padding) };
    expect((await ingest(key, [{ ...event, metadata }])).status).toBe(202);
    expect(
      (
        await ingest(key, [
          { ...event, traceId: 'too-large', metadata: { ...metadata, e: metadata.e + 'x' } },
        ])
      ).status,
    ).toBe(400);
    expect(
      (
        await ingest(key, [
          {
            ...event,
            traceId: 'utf8-large',
            metadata: { a: '漢'.repeat(2000), b: '漢'.repeat(2000) },
          },
        ])
      ).status,
    ).toBe(400);
    expect(await env.DB.prepare('SELECT count(*) FROM traces').first('count(*)')).toBe(1);
  });

  it.each([
    { startedAt: 'not-a-date' },
    { endedAt: '2020-01-01T00:00:00.000Z' },
    { startedAt: '2026-10-09T00:00:00.123456789Z', endedAt: '2026-10-09T00:00:00.123456788Z' },
    { durationMs: -1 },
    { inputTokens: -1 },
    { outputTokens: 0.5 },
    { provider: '' },
    { status: 'invalid' },
  ])('rejects invalid event fields %j without partial writes', async (changes) => {
    const { key } = await fixture();
    expect((await ingest(key, [event, { ...event, traceId: 'invalid', ...changes }])).status).toBe(
      400,
    );
    expect(await env.DB.prepare('SELECT count(*) FROM traces').first('count(*)')).toBe(0);
  });

  it('runs bounded scheduled cleanup for expired auth state only, preserving active state and every user trace', async () => {
    const { key } = await fixture();
    await ingest(key, [event]);
    const expired = '2000-01-01T00:00:00.000Z';
    await env.DB.prepare(
      `WITH RECURSIVE numbers(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM numbers WHERE n < ?)
      INSERT INTO sessions SELECT 'expired-'||n,'owner',?,? FROM numbers`,
    )
      .bind(CLEANUP_ROW_LIMIT, expired, expired)
      .run();
    await env.DB.prepare(
      `WITH RECURSIVE numbers(n) AS (SELECT 0 UNION ALL SELECT n+1 FROM numbers WHERE n < ?)
      INSERT INTO rate_limits SELECT 'expired-'||n,1,0 FROM numbers`,
    )
      .bind(CLEANUP_ROW_LIMIT)
      .run();
    await env.DB.prepare('INSERT INTO rate_limits VALUES (?,?,?)')
      .bind('active-counter', 1, Date.now() + 60000)
      .run();
    const execution = createExecutionContext();
    worker.scheduled(
      createScheduledController({ scheduledTime: Date.now(), cron: '17 * * * *' }),
      env,
      execution,
    );
    await waitOnExecutionContext(execution);
    expect(await env.DB.prepare('SELECT count(*) FROM sessions').first('count(*)')).toBe(2);
    expect(
      await env.DB.prepare("SELECT count(*) FROM rate_limits WHERE key LIKE 'expired-%'").first(
        'count(*)',
      ),
    ).toBe(1);
    expect(await env.DB.prepare('SELECT count(*) FROM traces').first('count(*)')).toBe(1);
    expect(await env.DB.prepare('SELECT count(*) FROM projects').first('count(*)')).toBe(1);
    expect(await env.DB.prepare('SELECT count(*) FROM api_keys').first('count(*)')).toBe(1);
    expect(await pruneExpiredAuthState(env.DB, Date.now())).toEqual({
      sessionsDeleted: 1,
      countersDeleted: 1,
    });
    for (const [table, index] of [
      ['sessions', 'sessions_expiry'],
      ['rate_limits', 'rate_limits_expiry'],
    ]) {
      const plan = await env.DB.prepare(
        `EXPLAIN QUERY PLAN SELECT * FROM ${table} WHERE expires_at <= ? ORDER BY expires_at LIMIT ?`,
      )
        .bind(table === 'sessions' ? new Date().toISOString() : Date.now(), CLEANUP_ROW_LIMIT)
        .all<{ detail: string }>();
      expect(plan.results.some((row) => row.detail.includes(index!))).toBe(true);
    }
    expect(
      await env.DB.prepare("SELECT count(*) FROM rate_limits WHERE key='active-counter'").first(
        'count(*)',
      ),
    ).toBe(1);
  });
});
