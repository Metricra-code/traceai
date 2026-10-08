import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { SESSION_COOKIE_NAME, hashSessionToken } from '../src/services/auth-sessions';
import { AUTH_EMAIL_LIMIT, AUTH_IP_LIMIT } from '../src/services/auth-rate';
import app from '../src';

const origin = 'http://localhost:3000';

function createCredentials(): { email: string; password: string } {
  return { email: 'owner@example.test', password: crypto.randomUUID() };
}

function auth(
  path: string,
  options: { method?: string; body?: unknown; cookie?: string; origin?: string; ip?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = {
    origin: options.origin ?? origin,
    'content-type': 'application/json',
    'cf-connecting-ip': options.ip ?? '203.0.113.1',
  };
  if (options.cookie) headers.cookie = options.cookie;
  return exports.default.fetch(`https://traceai.test/v1/auth/${path}`, {
    method: options.method ?? 'POST',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}
function cookieFrom(response: Response): string {
  return response.headers.get('set-cookie')?.split(';')[0] ?? '';
}

async function identifierHash(value: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`traceai:auth-rate:v1:${value}`),
      ),
    ),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
}

describe('authentication with private password Durable Object and migrated D1', () => {
  it('registers with a secure scrypt hash and hashed expiring session ID', async () => {
    const credentials = createCredentials();
    const response = await auth('register', {
      body: { ...credentials, email: 'OWNER@example.test' },
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ user: { email: credentials.email } });
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    const rawToken = cookieFrom(response).split('=')[1] ?? '';
    expect(rawToken).toMatch(/^[a-f0-9]{64}$/);
    const stored = await env.DB.prepare('SELECT id, expires_at FROM sessions').first<{
      id: string;
      expires_at: string;
    }>();
    expect(stored?.id).toBe(await hashSessionToken(rawToken));
    expect(stored?.id).not.toBe(rawToken);
    expect(Date.parse(stored?.expires_at ?? '')).toBeGreaterThan(Date.now());
    const hash = await env.DB.prepare('SELECT password_hash FROM users').first<string>(
      'password_hash',
    );
    expect(hash).toMatch(/^scrypt\$v1\$32768\$8\$3\$/);
    expect(hash).not.toContain(credentials.password);
    const session = await auth('session', { method: 'GET', cookie: cookieFrom(response) });
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ user: { email: credentials.email } });
  });

  it('logs in correctly, rotates the presented session and returns identical failures for unknown/wrong passwords', async () => {
    const credentials = createCredentials();
    const registered = await auth('register', { body: credentials });
    const previousCookie = cookieFrom(registered);
    const loggedIn = await auth('login', { body: credentials, cookie: previousCookie });
    expect(loggedIn.status).toBe(200);
    expect(cookieFrom(loggedIn)).not.toEqual(previousCookie);
    expect((await auth('session', { method: 'GET', cookie: previousCookie })).status).toBe(401);
    const wrong = await auth('login', {
      body: { ...credentials, password: crypto.randomUUID() },
    });
    const unknown = await auth('login', {
      body: { ...credentials, email: 'unknown@example.test' },
    });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  it('requires exact Origin on login, registration and logout', async () => {
    const credentials = createCredentials();
    for (const path of ['register', 'login', 'logout']) {
      const response = await auth(path, { body: credentials, origin: 'https://attacker.example' });
      expect(response.status).toBe(403);
    }
    const missing = await exports.default.fetch('https://traceai.test/v1/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    expect(missing.status).toBe(403);
    expect(await env.DB.prepare('SELECT count(*) AS count FROM users').first('count')).toBe(0);
  });

  it('rejects malformed credentials, duplicate registration and expired sessions', async () => {
    const credentials = createCredentials();
    expect(
      (
        await auth('register', {
          body: { ...credentials, password: crypto.randomUUID().slice(0, 5) },
        })
      ).status,
    ).toBe(400);
    const registered = await auth('register', { body: credentials });
    const repeated = await auth('register', { body: credentials });
    expect(repeated.status).toBe(409);
    expect(await repeated.text()).not.toContain('already exists');
    expect(await env.DB.prepare('SELECT count(*) AS count FROM users').first('count')).toBe(1);
    await env.DB.prepare("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z'").run();
    expect((await auth('session', { method: 'GET', cookie: cookieFrom(registered) })).status).toBe(
      401,
    );
    expect(
      (await auth('session', { method: 'GET', cookie: `${SESSION_COOKIE_NAME}=malformed` })).status,
    ).toBe(401);
  });

  it('logs out by deleting the session and clearing the cookie', async () => {
    const credentials = createCredentials();
    const registered = await auth('register', { body: credentials });
    const cookie = cookieFrom(registered);
    const response = await auth('logout', { cookie });
    expect(response.status).toBe(204);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await auth('session', { method: 'GET', cookie })).status).toBe(401);
  });

  it('blocks IP and normalized-email rate limits before expensive crypto', async () => {
    const credentials = createCredentials();
    const now = Date.now();
    await env.DB.prepare('INSERT INTO rate_limits VALUES (?,?,?)')
      .bind(`auth:ip:${await identifierHash('203.0.113.1')}`, AUTH_IP_LIMIT, now + 60000)
      .run();
    const blockedIp = await auth('register', { body: credentials });
    expect(blockedIp.status).toBe(429);
    expect(Number(blockedIp.headers.get('retry-after'))).toBeGreaterThan(0);
    expect(await env.DB.prepare('SELECT count(*) AS count FROM users').first('count')).toBe(0);
    await env.DB.prepare('DELETE FROM rate_limits').run();
    await env.DB.prepare('INSERT INTO rate_limits VALUES (?,?,?)')
      .bind(`auth:email:${await identifierHash(credentials.email)}`, AUTH_EMAIL_LIMIT, now + 900000)
      .run();
    expect(
      (
        await auth('login', {
          body: { ...credentials, email: 'OWNER@example.test' },
          ip: '203.0.113.2',
        })
      ).status,
    ).toBe(429);
  });

  it('sets Secure cookies in production and refuses untrusted IP fallback', async () => {
    const credentials = createCredentials();
    const init = {
      method: 'POST',
      headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.1' },
      body: JSON.stringify(credentials),
    };
    const registered = await app.fetch(new Request('https://traceai.test/v1/auth/register', init), {
      ...env,
      ENVIRONMENT: 'production',
    });
    expect(registered.status).toBe(201);
    expect(registered.headers.get('set-cookie')).toContain('Secure');
    const untrusted = await app.fetch(
      new Request('https://traceai.test/v1/auth/login', {
        ...init,
        headers: { origin, 'content-type': 'application/json' },
      }),
      { ...env, ENVIRONMENT: 'production' },
    );
    expect(untrusted.status).toBe(403);
  });

  it('counts malformed authentication requests toward the IP limit', async () => {
    const credentials = createCredentials();
    const now = Date.now();
    const key = `auth:ip:${await identifierHash('203.0.113.1')}`;
    await env.DB.prepare('INSERT INTO rate_limits VALUES (?,?,?)')
      .bind(key, AUTH_IP_LIMIT - 1, now + 60000)
      .run();
    expect((await auth('login', { body: { email: 'invalid' } })).status).toBe(400);
    expect((await auth('login', { body: credentials })).status).toBe(429);
  });

  // Four sequential scrypt RPCs can contend for local workerd CPU; this is not a production SLA.
  it('runs native hashing solely through a private SQLite DO binding', async () => {
    const credentials = createCredentials();
    const hasher = env.PASSWORD_HASHER.getByName('integration-vector');
    const hash = await hasher.hash(credentials.password);
    expect(await hasher.verify(credentials.password, hash)).toBe(true);
    expect(await hasher.verify(crypto.randomUUID(), hash)).toBe(false);
    const encoded =
      'scrypt$v1$32768$8$3$000102030405060708090a0b0c0d0e0f$82bca8b51e607e9f929042de27e7b1dfae8ce6a70731d0003499b79eeb8a9131';
    expect(await hasher.verify('unicode fixture 密碼 🐴', encoded)).toBe(true);
    expect((await exports.default.fetch('https://traceai.test/password-hasher')).status).toBe(404);
  }, 20_000);
});
