import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { MAX_BATCH_SIZE, MAX_PAYLOAD_BYTES, type TraceEvent } from '@traceai/shared';
import { createIngestionKey, type CreatedIngestionKey } from '../src/services/api-keys';
import {
  countIngestionRequest,
  INGESTION_REQUESTS_PER_MINUTE,
} from '../src/repositories/ingestion';

const event: TraceEvent = {
  traceId: 'real-trace',
  name: 'chat',
  provider: 'verified-test-provider',
  model: 'model-v1',
  status: 'success',
  startedAt: '2026-10-09T00:00:00.000Z',
  endedAt: '2026-10-09T00:00:00.123Z',
  durationMs: 123,
  inputTokens: 100,
  outputTokens: 20,
};

async function projectKey(projectId = 'project-one'): Promise<CreatedIngestionKey> {
  const key = await createIngestionKey();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO users VALUES ('local-owner','local@example.test','disabled-local-auth','2026-10-09T00:00:00.000Z','2026-10-09T00:00:00.000Z')",
  ).run();
  await env.DB.prepare(
    "INSERT OR IGNORE INTO projects VALUES (?,'local-owner','test project','','2026-10-09T00:00:00.000Z','2026-10-09T00:00:00.000Z')",
  )
    .bind(projectId)
    .run();
  await env.DB.prepare(
    'INSERT INTO api_keys (id,project_id,key_hash,key_salt,key_prefix,created_at) VALUES (?,?,?,?,?,?)',
  )
    .bind(key.id, projectId, key.keyHash, key.keySalt, key.keyPrefix, new Date().toISOString())
    .run();
  return key;
}

function ingest(rawKey: string, events: readonly TraceEvent[] = [event]): Promise<Response> {
  return exports.default.fetch('https://traceai.test/v1/events/batch', {
    method: 'POST',
    headers: { authorization: `Bearer ${rawKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ events }),
  });
}

async function traceCount(projectId = 'project-one'): Promise<number> {
  return (
    (
      await env.DB.prepare('SELECT COUNT(*) AS count FROM traces WHERE project_id = ?')
        .bind(projectId)
        .first<{ count: number }>()
    )?.count ?? 0
  );
}

async function addPrice(
  id: string,
  options: {
    simulated?: number;
    effectiveFrom?: string;
    effectiveTo?: string | null;
    inputRate?: string;
  } = {},
): Promise<void> {
  await env.DB.prepare('INSERT INTO model_pricing VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(
      id,
      event.provider,
      event.model,
      options.inputRate ?? '3000000000',
      '15000000000',
      'USD',
      options.effectiveFrom ?? '2026-01-01T00:00:00.000Z',
      options.effectiveTo ?? null,
      'https://pricing.example.test',
      options.simulated ?? 0,
    )
    .run();
}

describe('real Worker ingestion with migrated D1', () => {
  it('checks D1 health', async () => {
    const response = await exports.default.fetch('https://traceai.test/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', service: 'traceai-api' });
  });

  it('authenticates a generated key, persists a trace, and retries idempotently', async () => {
    const key = await projectKey();
    expect(await (await ingest(key.rawKey)).json()).toEqual({ accepted: 1, duplicates: 0 });
    const retry = await ingest(key.rawKey);
    expect(retry.status).toBe(202);
    expect(await retry.json()).toEqual({ accepted: 0, duplicates: 1 });
    expect(await traceCount()).toBe(1);
    const row = await env.DB.prepare(
      'SELECT project_id, trace_id, estimated_cost_nano_usd, pricing_version FROM traces',
    ).first();
    expect(row).toEqual({
      project_id: 'project-one',
      trace_id: event.traceId,
      estimated_cost_nano_usd: null,
      pricing_version: null,
    });
    expect(
      await env.DB.prepare('SELECT last_used_at FROM api_keys WHERE id = ?')
        .bind(key.id)
        .first('last_used_at'),
    ).toBeTruthy();
  });

  it('counts repeated IDs inside a batch and preserves the first event', async () => {
    const key = await projectKey();
    const response = await ingest(key.rawKey, [
      event,
      { ...event, name: 'later retry', model: 'unknown' },
    ]);
    expect(await response.json()).toEqual({ accepted: 1, duplicates: 1 });
    expect(await env.DB.prepare('SELECT name FROM traces').first('name')).toBe('chat');
  });

  it('prices the first event only when duplicate IDs have different models or effective dates', async () => {
    const key = await projectKey();
    await addPrice('real-current', { effectiveFrom: '2026-09-01T00:00:00.000Z' });
    await ingest(key.rawKey, [{ ...event, model: 'unknown' }, event]);
    expect(
      await env.DB.prepare('SELECT estimated_cost_nano_usd FROM traces').first(
        'estimated_cost_nano_usd',
      ),
    ).toBeNull();
    await addPrice('real-older', {
      effectiveTo: '2026-09-01T00:00:00.000Z',
      inputRate: '1000000000',
    });
    const earlier = {
      ...event,
      traceId: 'effective-date',
      startedAt: '2026-08-01T00:00:00.000Z',
      endedAt: '2026-08-01T00:00:00.123Z',
    };
    await ingest(key.rawKey, [earlier, { ...event, traceId: 'effective-date' }]);
    expect(
      await env.DB.prepare(
        "SELECT estimated_cost_nano_usd, pricing_version FROM traces WHERE trace_id = 'effective-date'",
      ).first(),
    ).toEqual({ estimated_cost_nano_usd: 400000, pricing_version: 'real-older' });
  });

  it('scopes the same trace ID to different projects', async () => {
    const first = await projectKey();
    const second = await projectKey('project-two');
    await ingest(first.rawKey);
    await ingest(second.rawKey);
    expect(await traceCount('project-one')).toBe(1);
    expect(await traceCount('project-two')).toBe(1);
    const spoofed = await exports.default.fetch('https://traceai.test/v1/events/batch', {
      method: 'POST',
      headers: { authorization: `Bearer ${first.rawKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'project-two', events: [{ ...event, traceId: 'spoof' }] }),
    });
    expect(spoofed.status).toBe(400);
    expect(await traceCount('project-two')).toBe(1);
  });

  it('rejects missing, wrong, and revoked keys without writes or secret leakage', async () => {
    const key = await projectKey();
    const wrongKey = `tai_${key.id}_${'0'.repeat(64)}`;
    for (const credential of ['', wrongKey]) {
      const response = await ingest(credential);
      expect(response.status).toBe(401);
      expect(await response.text()).not.toContain(key.keyHash);
    }
    await env.DB.prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), key.id)
      .run();
    expect((await ingest(key.rawKey)).status).toBe(401);
    expect(await traceCount()).toBe(0);
  });

  it('rejects an invalid event atomically even when preceding events are valid', async () => {
    const key = await projectKey();
    const response = await ingest(key.rawKey, [
      event,
      { ...event, traceId: 'invalid', inputTokens: -1 },
    ]);
    expect(response.status).toBe(400);
    expect(await traceCount()).toBe(0);
    expect(
      (
        await ingest(
          key.rawKey,
          Array.from({ length: MAX_BATCH_SIZE + 1 }, (_, index) => ({
            ...event,
            traceId: `trace-${index}`,
          })),
        )
      ).status,
    ).toBe(400);
  });

  it('rejects invalid JSON, media types, oversized content-length and streamed bytes', async () => {
    const key = await projectKey();
    const headers = { authorization: `Bearer ${key.rawKey}`, 'content-type': 'application/json' };
    expect(
      (
        await exports.default.fetch('https://traceai.test/v1/events/batch', {
          method: 'POST',
          headers,
          body: '{broken',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await exports.default.fetch('https://traceai.test/v1/events/batch', {
          method: 'POST',
          headers: { ...headers, 'content-type': 'text/plain' },
          body: '{}',
        })
      ).status,
    ).toBe(415);
    expect(
      (
        await exports.default.fetch('https://traceai.test/v1/events/batch', {
          method: 'POST',
          headers: { ...headers, 'content-length': String(MAX_PAYLOAD_BYTES + 1) },
          body: 'x'.repeat(MAX_PAYLOAD_BYTES + 1),
        })
      ).status,
    ).toBe(413);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let index = 0; index < 65; index++) controller.enqueue(new Uint8Array(4096).fill(32));
        controller.close();
      },
    });
    expect(
      (
        await exports.default.fetch('https://traceai.test/v1/events/batch', {
          method: 'POST',
          headers,
          body,
        })
      ).status,
    ).toBe(413);
    expect(await traceCount()).toBe(0);
  });

  it('uses only effective real pricing, never the simulated registry', async () => {
    const key = await projectKey();
    await addPrice('simulated-latest', { simulated: 1, effectiveFrom: '2026-10-01T00:00:00.000Z' });
    await ingest(key.rawKey);
    expect(
      await env.DB.prepare('SELECT estimated_cost_nano_usd FROM traces').first(
        'estimated_cost_nano_usd',
      ),
    ).toBeNull();
    await addPrice('real-expired', { effectiveTo: '2026-08-01T00:00:00.000Z' });
    await addPrice('real-current', { effectiveFrom: '2026-09-01T00:00:00.000Z' });
    await addPrice('real-future', { effectiveFrom: '2027-01-01T00:00:00.000Z' });
    await ingest(key.rawKey, [
      { ...event, traceId: 'priced' },
      { ...event, traceId: 'missing-usage', outputTokens: undefined },
      { ...event, traceId: 'unknown-model', model: 'unknown' },
    ]);
    expect(
      await env.DB.prepare(
        "SELECT estimated_cost_nano_usd, pricing_version FROM traces WHERE trace_id = 'priced'",
      ).first(),
    ).toEqual({ estimated_cost_nano_usd: 600000, pricing_version: 'real-current' });
    expect(
      await env.DB.prepare(
        "SELECT estimated_cost_nano_usd FROM traces WHERE trace_id = 'missing-usage'",
      ).first('estimated_cost_nano_usd'),
    ).toBeNull();
    expect(
      await env.DB.prepare(
        "SELECT estimated_cost_nano_usd FROM traces WHERE trace_id = 'unknown-model'",
      ).first('estimated_cost_nano_usd'),
    ).toBeNull();
  });

  it('persists all 50 events within D1 statement binding limits', async () => {
    const key = await projectKey();
    const events = Array.from({ length: MAX_BATCH_SIZE }, (_, index) => ({
      ...event,
      traceId: `trace-${index}`,
      metadata: { region: 'local' },
      errorType: 'unknown' as const,
    }));
    const response = await ingest(key.rawKey, events);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: 50, duplicates: 0 });
    expect(await traceCount()).toBe(50);
  });

  it('rolls back every insert if a later storage statement fails, without exposing diagnostics', async () => {
    const key = await projectKey();
    await env.DB.prepare(
      "CREATE TRIGGER fail_storage BEFORE INSERT ON traces WHEN NEW.trace_id = 'reject-storage' BEGIN SELECT RAISE(ABORT, 'private diagnostic'); END",
    ).run();
    const events = [
      ...Array.from({ length: 10 }, (_, index) => ({ ...event, traceId: `trace-${index}` })),
      { ...event, traceId: 'reject-storage' },
    ];
    const response = await ingest(key.rawKey, events);
    expect(response.status).toBe(500);
    expect(response.headers.get('x-request-id')).toMatch(/^[a-f0-9-]{36}$/);
    expect(await response.text()).not.toContain('private diagnostic');
    expect(await traceCount()).toBe(0);
    expect(
      await env.DB.prepare('SELECT last_used_at FROM api_keys WHERE id = ?')
        .bind(key.id)
        .first('last_used_at'),
    ).toBeNull();
  });

  it('applies NOT NULL primary key constraints from the actual migration', async () => {
    await expect(
      env.DB.prepare(
        "INSERT INTO users (id,email,password_hash,created_at,updated_at) VALUES (NULL,'null@example.test','disabled','2026-10-09T00:00:00Z','2026-10-09T00:00:00Z')",
      ).run(),
    ).rejects.toThrow();
  });

  it('counts concurrent requests atomically', async () => {
    const key = await projectKey();
    const now = Date.parse('2026-10-09T00:00:00.000Z');
    await env.DB.prepare('INSERT INTO rate_limits VALUES (?, ?, ?)')
      .bind(`ingestion:${key.id}`, INGESTION_REQUESTS_PER_MINUTE - 1, now + 60000)
      .run();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => countIngestionRequest(env.DB, key.id, now)),
    );
    expect(results.filter((result) => result.allowed)).toHaveLength(1);
  });

  it('enforces the atomic per-key limit, returns Retry-After, and resets expired counters', async () => {
    const key = await projectKey();
    const expiresAt = (Math.floor(Date.now() / 60000) + 1) * 60000;
    await env.DB.prepare('INSERT INTO rate_limits VALUES (?, ?, ?)')
      .bind(`ingestion:${key.id}`, INGESTION_REQUESTS_PER_MINUTE, expiresAt)
      .run();
    const response = await ingest(key.rawKey);
    expect(response.status).toBe(429);
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await traceCount()).toBe(0);
    const allowed = await countIngestionRequest(env.DB, key.id, expiresAt);
    expect(allowed.allowed).toBe(true);
    expect(
      await env.DB.prepare('SELECT count FROM rate_limits WHERE key = ?')
        .bind(`ingestion:${key.id}`)
        .first('count'),
    ).toBe(1);
  });
});
