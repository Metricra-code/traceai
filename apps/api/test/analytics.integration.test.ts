import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ModelComparison, Overview, Trace, TracePage } from '@traceai/shared';
import { newSession, SESSION_COOKIE_NAME } from '../src/services/auth-sessions';

const from = '2026-10-09T00:00:00.000Z';
const to = '2026-10-09T01:00:00.000Z';
const dates = `from=${from}&to=${to}`;
const timestamp = (minute: number) => new Date(Date.parse(from) + minute * 60_000).toISOString();

async function seedScope(): Promise<string> {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO users VALUES (?,?,?,?,?)').bind(
      'owner',
      'owner@example.test',
      'disabled-test-auth',
      from,
      from,
    ),
    env.DB.prepare('INSERT INTO users VALUES (?,?,?,?,?)').bind(
      'other-owner',
      'other@example.test',
      'disabled-test-auth',
      from,
      from,
    ),
    ...[
      ['project-one', 'owner'],
      ['foreign-project', 'other-owner'],
      ['demo', 'other-owner'],
    ].map(([id, owner]) =>
      env.DB.prepare('INSERT INTO projects VALUES (?,?,?,?,?,?)').bind(
        id,
        owner,
        id === 'demo' ? 'Simulated demo' : 'Real project',
        '',
        from,
        from,
      ),
    ),
  ]);
  const session = await newSession('owner');
  await env.DB.prepare('INSERT INTO sessions VALUES (?,?,?,?)')
    .bind(
      session.record.id,
      session.record.userId,
      session.record.expiresAt,
      session.record.createdAt,
    )
    .run();
  return `${SESSION_COOKIE_NAME}=${session.token}`;
}

async function addRows(projectId = 'project-one', count = 20): Promise<void> {
  await env.DB.batch(
    Array.from({ length: count }, (_, index) =>
      env.DB.prepare(
        `INSERT INTO traces
    (id,project_id,trace_id,name,provider,model,status,started_at,ended_at,duration_ms,input_tokens,output_tokens,estimated_cost_nano_usd,error_type,error_message,metadata_json,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        `${projectId}-${index}`,
        projectId,
        `trace-${index.toString().padStart(2, '0')}`,
        'summarize',
        index < 10 ? 'alpha' : 'beta',
        index < 10 ? 'fast' : 'slow',
        index === count - 1 ? 'error' : 'success',
        timestamp(index),
        new Date(Date.parse(timestamp(index)) + index + 1).toISOString(),
        index + 1,
        100,
        10,
        index < 10 ? 2 : null,
        index === count - 1 ? 'timeout' : null,
        'legacy-sensitive-error-never-return-this',
        '{"explicit":"metadata"}',
        from,
      ),
    ),
  );
}
const read = (path: string, cookie?: string) =>
  exports.default.fetch(
    `https://traceai.test${path}`,
    cookie ? { headers: { cookie } } : undefined,
  );

async function fixture() {
  const cookie = await seedScope();
  await addRows();
  await addRows('foreign-project', 1);
  await addRows('demo', 3);
  return cookie;
}

describe('real Worker project-scoped analytics on migrated D1', () => {
  it('calculates accurate nearest-rank P95 and never returns a partial cost as the total', async () => {
    const cookie = await fixture();
    const response = await read(`/v1/projects/project-one/overview?${dates}`, cookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      totalRequests: 20,
      successfulRequests: 19,
      failedRequests: 1,
      errorRate: 0.05,
      averageLatencyMs: 10.5,
      p50LatencyMs: 10,
      p95LatencyMs: 19,
      p99LatencyMs: 20,
      inputTokens: 2000,
      outputTokens: 200,
      estimatedCostNanoUsd: null,
      knownEstimatedCostNanoUsd: '20',
      pricedRequests: 10,
      unpricedRequests: 10,
    } satisfies Overview);
  });
  it('enforces authentication and non-enumerable ownership on every private analytics endpoint', async () => {
    const cookie = await fixture();
    for (const suffix of ['overview', 'metrics', 'models', 'traces', 'traces/trace-00']) {
      expect(
        (await read(`/v1/projects/project-one/${suffix}?${suffix.includes('/') ? '' : dates}`))
          .status,
      ).toBe(401);
      expect(
        (
          await read(
            `/v1/projects/foreign-project/${suffix}?${suffix.includes('/') ? '' : dates}`,
            cookie,
          )
        ).status,
      ).toBe(404);
      expect((await read(`/v1/projects/missing/${suffix}`, cookie)).status).toBe(404);
    }
  });
  it('applies provider/model/status/traceID filters server-side using exact parameterized matches', async () => {
    const cookie = await fixture();
    const overview = (await (
      await read(`/v1/projects/project-one/overview?${dates}&provider=alpha&model=fast`, cookie)
    ).json()) as Overview;
    expect(overview).toMatchObject({
      totalRequests: 10,
      p95LatencyMs: 10,
      estimatedCostNanoUsd: '20',
      knownEstimatedCostNanoUsd: '20',
    });
    const traces = (await (
      await read(`/v1/projects/project-one/traces?${dates}&status=error&traceId=trace-19`, cookie)
    ).json()) as TracePage;
    expect(traces.items.map((trace) => trace.traceId)).toEqual(['trace-19']);
    expect(traces.items.every((trace) => trace.projectId === 'project-one')).toBe(true);
    const injected = encodeURIComponent("alpha' OR 1=1 --");
    const empty = (await (
      await read(`/v1/projects/project-one/overview?${dates}&provider=${injected}`, cookie)
    ).json()) as Overview;
    expect(empty.totalRequests).toBe(0);
  });
  it('uses UTC half-open boundaries and zero fills missing metric buckets', async () => {
    const cookie = await fixture();
    const window = `from=${timestamp(5)}&to=${timestamp(10)}`;
    const overview = (await (
      await read(`/v1/projects/project-one/overview?${window}`, cookie)
    ).json()) as Overview;
    expect(overview.totalRequests).toBe(5);
    const result = (await (
      await read(`/v1/projects/project-one/metrics?from=${from}&to=${timestamp(180)}`, cookie)
    ).json()) as { bucket: string; items: Overview[] };
    expect(result.bucket).toBe('hour');
    expect(result.items.map((item) => item.totalRequests)).toEqual([20, 0, 0]);
    expect(result.items[0]?.p95LatencyMs).toBe(19);
    expect(result.items.map((item) => item.knownEstimatedCostNanoUsd)).toEqual(['20', '0', '0']);
  });
  it('compares operational model latency and pricing coverage without claiming quality', async () => {
    const cookie = await fixture();
    const result = (await (
      await read(`/v1/projects/project-one/models?${dates}`, cookie)
    ).json()) as { items: ModelComparison[] };
    expect(result.items).toMatchObject([
      {
        provider: 'alpha',
        model: 'fast',
        totalRequests: 10,
        p95LatencyMs: 10,
        estimatedCostNanoUsd: '20',
        knownEstimatedCostNanoUsd: '20',
      },
      {
        provider: 'beta',
        model: 'slow',
        totalRequests: 10,
        p95LatencyMs: 20,
        estimatedCostNanoUsd: null,
        knownEstimatedCostNanoUsd: null,
        unpricedRequests: 10,
      },
    ]);
  });
  it.each(['newest', 'oldest'])(
    'paginates timestamp ties without gaps or duplicates in %s order',
    async (sort) => {
      const cookie = await fixture();
      await env.DB.prepare('UPDATE traces SET started_at = ?, ended_at = ? WHERE project_id = ?')
        .bind(timestamp(1), timestamp(2), 'project-one')
        .run();
      const ids: string[] = [];
      let cursor: string | null = null;
      do {
        const result = (await (
          await read(
            `/v1/projects/project-one/traces?${dates}&limit=3&sort=${sort}${cursor ? `&cursor=${cursor}` : ''}`,
            cookie,
          )
        ).json()) as TracePage;
        ids.push(...result.items.map((trace) => trace.traceId));
        cursor = result.nextCursor;
      } while (cursor);
      const expected = Array.from(
        { length: 20 },
        (_, index) => `trace-${index.toString().padStart(2, '0')}`,
      );
      expect(ids).toEqual(sort === 'oldest' ? expected : [...expected].reverse());
      expect(new Set(ids).size).toBe(20);
    },
  );
  it('rejects cursor reuse with changed filters or project scope', async () => {
    const cookie = await fixture();
    const page = (await (
      await read(`/v1/projects/project-one/traces?${dates}&limit=2`, cookie)
    ).json()) as TracePage;
    expect(page.nextCursor).not.toBeNull();
    expect(
      (
        await read(
          `/v1/projects/project-one/traces?${dates}&provider=alpha&cursor=${page.nextCursor}`,
          cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await read(
          `/v1/projects/project-one/traces?${dates}&sort=oldest&cursor=${page.nextCursor}`,
          cookie,
        )
      ).status,
    ).toBe(400);
    expect((await read(`/v1/demo/traces?${dates}&cursor=${page.nextCursor}`)).status).toBe(400);
  });
  it('returns safe trace details with string cost and never raw legacy errors', async () => {
    const cookie = await fixture();
    const response = await read('/v1/projects/project-one/traces/trace-19', cookie);
    expect(response.status).toBe(200);
    const trace = (await response.json()) as Trace;
    expect(trace).toMatchObject({
      traceId: 'trace-19',
      projectId: 'project-one',
      status: 'error',
      errorType: 'timeout',
      estimatedCostNanoUsd: null,
      metadata: { explicit: 'metadata' },
    });
    expect(JSON.stringify(trace)).not.toContain('legacy-sensitive-error');
    expect((await read('/v1/projects/project-one/traces/not-present', cookie)).status).toBe(404);
    expect(
      (await read('/v1/projects/project-one/traces/trace-00?projectId=foreign-project', cookie))
        .status,
    ).toBe(400);
  });
  it('does not fabricate absent usage as zero on trace details', async () => {
    const cookie = await fixture();
    await env.DB.prepare(
      'UPDATE traces SET input_tokens = NULL, output_tokens = NULL WHERE project_id = ? AND trace_id = ?',
    )
      .bind('project-one', 'trace-00')
      .run();
    const trace = await (await read('/v1/projects/project-one/traces/trace-00', cookie)).json();
    expect(trace).not.toHaveProperty('inputTokens');
    expect(trace).not.toHaveProperty('outputTokens');
  });
  it.each([
    'from=invalid&to=2026-10-09T00:00:00Z',
    'from=2026-08-01T00:00:00Z&to=2026-10-09T00:00:00Z',
    `${dates}&provider=alpha&provider=beta`,
    `${dates}&status=unknown`,
    `${dates}&unknown=value`,
    `${dates}&limit=101`,
    `${dates}&cursor=malformed`,
  ])('returns a safe 400 for invalid query %s', async (query) => {
    const cookie = await fixture();
    const response = await read(`/v1/projects/project-one/traces?${query}`, cookie);
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain('SELECT');
  });
  it('rejects more than 20,000 matched analytics rows explicitly, rather than truncating percentile data', async () => {
    const cookie = await seedScope();
    await env.DB.prepare(
      `WITH RECURSIVE sequence(value) AS (SELECT 0 UNION ALL SELECT value + 1 FROM sequence WHERE value < 20000)
      INSERT INTO traces (id,project_id,trace_id,name,provider,model,status,started_at,ended_at,duration_ms,metadata_json,created_at)
      SELECT printf('overflow-%05d',value),'project-one',printf('overflow-%05d',value),'op','example','model','success',?,?,1,'{}',? FROM sequence`,
    )
      .bind(from, to, from)
      .run();
    for (const suffix of ['overview', 'metrics', 'models']) {
      const response = await read(`/v1/projects/project-one/${suffix}?${dates}`, cookie);
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({
        error: { code: 'analytics_window_too_large' },
      });
    }
    expect((await read(`/v1/projects/project-one/traces?${dates}&limit=1`, cookie)).status).toBe(
      200,
    );
  });
  it('sums authoritative nanodollars exactly even when the total exceeds JavaScript safe integers', async () => {
    const cookie = await fixture();
    await env.DB.prepare(
      'UPDATE traces SET estimated_cost_nano_usd = 9007199254740991 WHERE project_id = ?',
    )
      .bind('project-one')
      .run();
    const result = (await (
      await read(`/v1/projects/project-one/overview?${dates}`, cookie)
    ).json()) as Overview;
    expect(result.estimatedCostNanoUsd).toBe('180143985094819820');
    expect(result.pricedRequests).toBe(20);
  });
  it('uses the composite project/time index for trace pagination', async () => {
    await seedScope();
    const plan = await env.DB.prepare(
      'EXPLAIN QUERY PLAN SELECT trace_id FROM traces WHERE project_id = ? AND started_at >= ? AND started_at < ? ORDER BY started_at DESC, trace_id DESC LIMIT 51',
    )
      .bind('project-one', from, to)
      .all<{ detail: string }>();
    expect(
      plan.results.some(
        (row) => row.detail.includes('traces_project_time') && row.detail.includes('SEARCH'),
      ),
    ).toBe(true);
  });
});

describe('public read-only demo analytics', () => {
  it('exposes only the fixed simulated project and its actual seeded anchor without authentication', async () => {
    await fixture();
    const metadata = await (await read('/v1/demo')).json();
    expect(metadata).toMatchObject({
      simulated: true,
      anchor: timestamp(2),
      project: { id: 'demo', name: 'Simulated demo' },
    });
    expect(metadata).not.toHaveProperty('ownerId');
    const page = (await (await read('/v1/demo/traces')).json()) as TracePage;
    expect(page.items).toHaveLength(3);
    expect(page.items.every((trace) => trace.projectId === 'demo')).toBe(true);
    for (const suffix of ['overview', 'metrics', 'models', 'traces', 'traces/trace-00'])
      expect((await read(`/v1/demo/${suffix}`)).status).toBe(200);
    expect((await read('/v1/demo/traces?projectId=project-one')).status).toBe(400);
  });
  it('does not accept public demo mutations or generate ingestion keys', async () => {
    await fixture();
    for (const path of ['/v1/demo', '/v1/demo/api-keys', '/v1/demo/traces']) {
      for (const method of ['POST', 'PATCH', 'DELETE']) {
        const response = await exports.default.fetch(`https://traceai.test${path}`, {
          method,
          headers: { 'content-type': 'application/json' },
          body: '{}',
        });
        expect(response.status).toBeGreaterThanOrEqual(400);
      }
    }
    expect(
      await env.DB.prepare("SELECT COUNT(*) FROM traces WHERE project_id='demo'").first('COUNT(*)'),
    ).toBe(3);
    expect(
      await env.DB.prepare("SELECT COUNT(*) FROM api_keys WHERE project_id='demo'").first(
        'COUNT(*)',
      ),
    ).toBe(0);
  });
  it('returns a usable not-available response if demo seed has not been applied', async () => {
    expect((await read('/v1/demo')).status).toBe(404);
  });
});
