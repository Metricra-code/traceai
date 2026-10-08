import { sessions, users } from '@traceai/database';
import { and, eq, gt } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';

export interface AuthUser {
  id: string;
  email: string;
}
interface CredentialsUser extends AuthUser {
  passwordHash: string;
}
export interface SessionRecord {
  id: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
}

export async function findCredentialsUser(
  database: D1Database,
  email: string,
): Promise<CredentialsUser | undefined> {
  return (
    await drizzle(database)
      .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
  )[0];
}

export async function findSessionUser(
  database: D1Database,
  sessionHash: string,
  now: string,
): Promise<AuthUser | undefined> {
  return (
    await drizzle(database)
      .select({ id: users.id, email: users.email })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(and(eq(sessions.id, sessionHash), gt(sessions.expiresAt, now)))
      .limit(1)
  )[0];
}

export async function registerUserSession(
  database: D1Database,
  user: CredentialsUser,
  session: SessionRecord,
): Promise<boolean> {
  const result = await database.batch([
    database
      .prepare(
        'INSERT INTO users (id,email,password_hash,created_at,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(email) DO NOTHING',
      )
      .bind(user.id, user.email, user.passwordHash, session.createdAt, session.createdAt),
    database
      .prepare(
        'INSERT INTO sessions (id,user_id,expires_at,created_at) SELECT ?,id,?,? FROM users WHERE id = ?',
      )
      .bind(session.id, session.expiresAt, session.createdAt, user.id),
  ]);
  return result[0]?.meta.changes === 1;
}

export async function createSession(
  database: D1Database,
  session: SessionRecord,
  previousHash?: string,
): Promise<void> {
  const insert = database
    .prepare('INSERT INTO sessions (id,user_id,expires_at,created_at) VALUES (?,?,?,?)')
    .bind(session.id, session.userId, session.expiresAt, session.createdAt);
  const queries = previousHash
    ? [database.prepare('DELETE FROM sessions WHERE id = ?').bind(previousHash), insert]
    : [insert];
  await database.batch(queries);
}

export async function deleteSession(database: D1Database, sessionHash: string): Promise<void> {
  await drizzle(database).delete(sessions).where(eq(sessions.id, sessionHash));
}

export async function countAuthRequest(
  database: D1Database,
  counter: { key: string; limit: number; windowMs: number; now: number },
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const expiresAt = (Math.floor(counter.now / counter.windowMs) + 1) * counter.windowMs;
  const row = await database
    .prepare(
      `INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN expires_at <= ? THEN 1 ELSE MIN(count + 1, ?) END,
      expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
    RETURNING count, expires_at AS expiresAt`,
    )
    .bind(counter.key, expiresAt, counter.now, counter.limit + 1, counter.now)
    .first<{ count: number; expiresAt: number }>();
  if (!row) throw new Error('Authentication rate-limit storage did not return a counter');
  return {
    allowed: row.count <= counter.limit,
    retryAfterSeconds: Math.max(1, Math.ceil((row.expiresAt - counter.now) / 1000)),
  };
}
