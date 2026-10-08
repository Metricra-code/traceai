import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import type { ApiKey, Project } from '@traceai/shared';
import { newSession } from '../src/services/auth-sessions';
import {
  KEY_HISTORY_LIMIT,
  MAX_ACTIVE_PROJECT_KEYS,
  MAX_OWNER_PROJECTS,
} from '../src/repositories/projects';

const origin = 'http://localhost:3000';

async function ownerCookie(id: string): Promise<string> {
  const now = new Date().toISOString();
  await env.DB.prepare('INSERT INTO users VALUES (?,?,?,?,?)')
    .bind(id, `${id}@example.test`, 'disabled:test-only', now, now)
    .run();
  const session = await newSession(id);
  await env.DB.prepare('INSERT INTO sessions VALUES (?,?,?,?)')
    .bind(session.record.id, id, session.record.expiresAt, session.record.createdAt)
    .run();
  return `traceai_session=${session.token}`;
}

function request(
  path: string,
  options: { method?: string; body?: unknown; cookie?: string; origin?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    origin: options.origin ?? origin,
    'content-type': 'application/json',
  };
  if (options.cookie) headers.cookie = options.cookie;
  return exports.default.fetch(`https://traceai.test/v1/projects${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function project(cookie: string, name = 'Owned project'): Promise<Project> {
  const response = await request('', {
    method: 'POST',
    cookie,
    body: { name, description: 'A real project' },
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<Project>;
}

async function key(cookie: string, projectId: string): Promise<{ apiKey: ApiKey; key: string }> {
  const response = await request(`/${projectId}/api-keys`, { method: 'POST', cookie });
  expect(response.status).toBe(201);
  return response.json() as Promise<{ apiKey: ApiKey; key: string }>;
}

function ingest(rawKey: string, traceId: string): Promise<Response> {
  return exports.default.fetch('https://traceai.test/v1/events/batch', {
    method: 'POST',
    headers: { authorization: `Bearer ${rawKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      events: [
        {
          traceId,
          name: 'chat',
          provider: 'local',
          model: 'unknown',
          status: 'success',
          startedAt: '2026-10-09T00:00:00.000Z',
          endedAt: '2026-10-09T00:00:01.000Z',
          durationMs: 1000,
        },
      ],
    }),
  });
}

async function seedProjects(ownerId: string, count: number): Promise<void> {
  const rows = Array.from({ length: count }, (_, index) => ({
    id: `cap-project-${index}`,
    name: `Seed ${index}`,
  }));
  await env.DB.prepare(
    `INSERT INTO projects (id,owner_id,name,description,created_at,updated_at)
    SELECT json_extract(value,'$.id'),?,json_extract(value,'$.name'),'','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z' FROM json_each(?)`,
  )
    .bind(ownerId, JSON.stringify(rows))
    .run();
}

async function seedKeys(
  projectId: string,
  options: { count: number; revoked?: boolean; offset?: number },
): Promise<void> {
  const rows = Array.from({ length: options.count }, (_, index) => ({
    id: (index + (options.offset ?? 0)).toString(16).padStart(32, '0'),
  }));
  await env.DB.prepare(
    `INSERT INTO api_keys (id,project_id,key_hash,key_salt,key_prefix,created_at,revoked_at)
    SELECT json_extract(value,'$.id'),?,?,?,'tai_fixture_','2026-10-09T00:00:00.000Z',? FROM json_each(?)`,
  )
    .bind(
      projectId,
      'a'.repeat(64),
      'a'.repeat(32),
      options.revoked ? '2026-10-09T00:00:00.000Z' : null,
      JSON.stringify(rows),
    )
    .run();
}

describe('owner-scoped project and key management', () => {
  it('creates, lists, reads and edits only owned projects', async () => {
    const first = await ownerCookie('owner-one');
    const second = await ownerCookie('owner-two');
    const created = await project(first);
    expect(await (await request('', { cookie: first })).json()).toEqual({ items: [created] });
    expect(await (await request('', { cookie: second })).json()).toEqual({ items: [] });
    expect((await request(`/${created.id}`, { cookie: second })).status).toBe(404);
    expect((await request(`/${created.id}`)).status).toBe(401);
    const edited = await request(`/${created.id}`, {
      method: 'PATCH',
      cookie: first,
      body: { name: 'Renamed' },
    });
    expect(edited.status).toBe(200);
    expect(await edited.json()).toMatchObject({ name: 'Renamed', description: 'A real project' });
    expect(
      (
        await request(`/${created.id}`, {
          method: 'PATCH',
          cookie: second,
          body: { name: 'Taken' },
        })
      ).status,
    ).toBe(404);
    expect(
      (await request(`/${created.id}`, { method: 'PATCH', cookie: first, body: {} })).status,
    ).toBe(400);
  });

  it('preserves omitted fields across concurrent disjoint PATCH requests', async () => {
    const cookie = await ownerCookie('owner');
    const created = await project(cookie);
    const results = await Promise.all([
      request(`/${created.id}`, { method: 'PATCH', cookie, body: { name: 'Concurrent name' } }),
      request(`/${created.id}`, {
        method: 'PATCH',
        cookie,
        body: { description: 'Concurrent description' },
      }),
    ]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(await (await request(`/${created.id}`, { cookie })).json()).toMatchObject({
      name: 'Concurrent name',
      description: 'Concurrent description',
    });
  });

  it('enforces exact Origin for every mutation', async () => {
    const cookie = await ownerCookie('owner');
    const created = await project(cookie);
    const createdKey = await key(cookie, created.id);
    for (const [path, method, body] of [
      ['', 'POST', { name: 'Blocked' }],
      [`/${created.id}`, 'PATCH', { name: 'Blocked' }],
      [`/${created.id}`, 'DELETE', { confirmName: created.name }],
      [`/${created.id}/api-keys`, 'POST', undefined],
      [`/${created.id}/api-keys/${createdKey.apiKey.id}`, 'DELETE', undefined],
      [`/${created.id}/api-keys/${createdKey.apiKey.id}/rotate`, 'POST', undefined],
    ] as const)
      expect(
        (await request(path, { method, body, cookie, origin: 'https://attacker.example' })).status,
      ).toBe(403);
  });

  it('returns raw keys only once and never lists hashes, salts or secrets', async () => {
    const cookie = await ownerCookie('owner');
    const created = await project(cookie);
    const createdKey = await key(cookie, created.id);
    expect(createdKey.key).toMatch(/^tai_[a-f0-9]{32}_[a-f0-9]{64}$/);
    expect((await ingest(createdKey.key, 'management-created-key')).status).toBe(202);
    const response = await request(`/${created.id}/api-keys`, { cookie });
    const body = await response.text();
    expect(JSON.parse(body)).toMatchObject({ items: [{ id: createdKey.apiKey.id }] });
    expect(body).not.toContain(createdKey.key);
    expect(body).not.toContain('keyHash');
    expect(body).not.toContain('keySalt');
    const other = await ownerCookie('other');
    expect((await request(`/${created.id}/api-keys`, { cookie: other })).status).toBe(404);
    expect(
      (
        await request(`/${created.id}/api-keys/${createdKey.apiKey.id}`, {
          method: 'DELETE',
          cookie: other,
        })
      ).status,
    ).toBe(404);
  });

  it('rotates a key atomically, revokes the old credential and rejects repeated rotation', async () => {
    const cookie = await ownerCookie('owner');
    const created = await project(cookie);
    const createdKey = await key(cookie, created.id);
    const response = await request(`/${created.id}/api-keys/${createdKey.apiKey.id}/rotate`, {
      method: 'POST',
      cookie,
    });
    expect(response.status).toBe(201);
    const rotated = (await response.json()) as { apiKey: ApiKey; key: string };
    expect((await ingest(createdKey.key, 'old-key')).status).toBe(401);
    expect((await ingest(rotated.key, 'new-key')).status).toBe(202);
    expect(
      (
        await request(`/${created.id}/api-keys/${createdKey.apiKey.id}/rotate`, {
          method: 'POST',
          cookie,
        })
      ).status,
    ).toBe(404);
    expect(
      await env.DB.prepare('SELECT count(*) AS count FROM api_keys WHERE project_id = ?')
        .bind(created.id)
        .first('count'),
    ).toBe(2);
    expect(
      (await request(`/${created.id}/api-keys/${rotated.apiKey.id}`, { method: 'DELETE', cookie }))
        .status,
    ).toBe(204);
    expect((await ingest(rotated.key, 'revoked-new-key')).status).toBe(401);
  });

  it('allows only one concurrent rotation of an active key', async () => {
    const cookie = await ownerCookie('owner');
    const created = await project(cookie);
    const createdKey = await key(cookie, created.id);
    const results = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(`/${created.id}/api-keys/${createdKey.apiKey.id}/rotate`, {
          method: 'POST',
          cookie,
        }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([201, 404]);
    expect(
      await env.DB.prepare('SELECT count(*) AS count FROM api_keys WHERE project_id = ?')
        .bind(created.id)
        .first('count'),
    ).toBe(2);
  });

  it('rolls back revocation when replacement key insertion fails', async () => {
    const cookie = await ownerCookie('owner');
    const created = await project(cookie);
    const createdKey = await key(cookie, created.id);
    await env.DB.prepare(
      "CREATE TRIGGER prevent_new_key BEFORE INSERT ON api_keys BEGIN SELECT RAISE(ABORT,'private key diagnostic'); END",
    ).run();
    const response = await request(`/${created.id}/api-keys/${createdKey.apiKey.id}/rotate`, {
      method: 'POST',
      cookie,
    });
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('private key diagnostic');
    expect((await ingest(createdKey.key, 'not-revoked-on-failure')).status).toBe(202);
  });

  it('enforces the project cap atomically at a concurrent creation boundary', async () => {
    const cookie = await ownerCookie('owner');
    await seedProjects('owner', MAX_OWNER_PROJECTS - 1);
    const responses = await Promise.all([
      request('', { method: 'POST', cookie, body: { name: 'Boundary one' } }),
      request('', { method: 'POST', cookie, body: { name: 'Boundary two' } }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const blocked = responses.find((response) => response.status === 409)!;
    expect(await blocked.json()).toMatchObject({ error: { code: 'resource_limit' } });
    expect(
      ((await (await request('', { cookie })).json()) as { items: Project[] }).items,
    ).toHaveLength(MAX_OWNER_PROJECTS);
    const other = await ownerCookie('other-owner');
    expect(
      (await request('', { method: 'POST', cookie: other, body: { name: 'Separate quota' } }))
        .status,
    ).toBe(201);
  });

  it('enforces active key cap atomically but permits replacement rotation at the cap', async () => {
    const cookie = await ownerCookie('owner');
    const created = await project(cookie);
    await seedKeys(created.id, { count: MAX_ACTIVE_PROJECT_KEYS - 1 });
    const responses = await Promise.all(
      Array.from({ length: 2 }, () =>
        request(`/${created.id}/api-keys`, { method: 'POST', cookie }),
      ),
    );
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const minted = (await responses.find((response) => response.status === 201)!.json()) as {
      apiKey: ApiKey;
      key: string;
    };
    const blocked = responses.find((response) => response.status === 409)!;
    expect(await blocked.json()).toMatchObject({ error: { code: 'resource_limit' } });
    const rotatedResponse = await request(`/${created.id}/api-keys/${minted.apiKey.id}/rotate`, {
      method: 'POST',
      cookie,
    });
    expect(rotatedResponse.status).toBe(201);
    const rotated = (await rotatedResponse.json()) as { apiKey: ApiKey; key: string };
    expect(
      await env.DB.prepare(
        'SELECT count(*) AS count FROM api_keys WHERE project_id = ? AND revoked_at IS NULL',
      )
        .bind(created.id)
        .first('count'),
    ).toBe(MAX_ACTIVE_PROJECT_KEYS);
    expect((await ingest(minted.key, 'old-at-cap')).status).toBe(401);
    expect((await ingest(rotated.key, 'replacement-at-cap')).status).toBe(202);
  });

  it('always lists older active keys before bounded recent revoked history', async () => {
    const cookie = await ownerCookie('owner');
    const created = await project(cookie);
    const active = await key(cookie, created.id);
    await env.DB.prepare("UPDATE api_keys SET created_at = '2000-01-01T00:00:00.000Z' WHERE id = ?")
      .bind(active.apiKey.id)
      .run();
    await seedKeys(created.id, { count: 120, revoked: true });
    const body = (await (await request(`/${created.id}/api-keys`, { cookie })).json()) as {
      items: ApiKey[];
      historyLimit: number;
    };
    expect(body.historyLimit).toBe(KEY_HISTORY_LIMIT);
    expect(body.items).toHaveLength(KEY_HISTORY_LIMIT);
    expect(body.items[0]?.id).toBe(active.apiKey.id);
    expect(body.items.slice(1).every((item) => item.revokedAt !== null)).toBe(true);
  });

  it('requires deletion confirmation and cascades traces and API keys', async () => {
    const cookie = await ownerCookie('owner');
    const created = await project(cookie);
    const createdKey = await key(cookie, created.id);
    await ingest(createdKey.key, 'to-be-deleted');
    expect(
      (
        await request(`/${created.id}`, {
          method: 'DELETE',
          cookie,
          body: { confirmName: 'wrong' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(`/${created.id}`, {
          method: 'DELETE',
          cookie,
          body: { confirmName: created.name },
        })
      ).status,
    ).toBe(204);
    expect(
      await env.DB.prepare('SELECT count(*) AS count FROM traces WHERE project_id = ?')
        .bind(created.id)
        .first('count'),
    ).toBe(0);
    expect(
      await env.DB.prepare('SELECT count(*) AS count FROM api_keys WHERE project_id = ?')
        .bind(created.id)
        .first('count'),
    ).toBe(0);
    expect((await ingest(createdKey.key, 'deleted-project')).status).toBe(401);
  });
});
