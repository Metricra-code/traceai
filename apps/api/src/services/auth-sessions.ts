import {
  createSession,
  deleteSession,
  findSessionUser,
  type AuthUser,
  type SessionRecord,
} from '../repositories/auth';
import { RequestError } from './http-errors';

export const SESSION_COOKIE_NAME = 'traceai_session';
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export async function hashSessionToken(token: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`traceai:session:v1:${token}`)),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function newSession(
  userId: string,
): Promise<{ token: string; record: SessionRecord }> {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const now = Date.now();
  return {
    token,
    record: {
      id: await hashSessionToken(token),
      userId,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + SESSION_DURATION_MS).toISOString(),
    },
  };
}

export async function requireSessionUser(
  database: D1Database,
  token: string | undefined,
): Promise<AuthUser> {
  const user = token
    ? await findSessionUser(database, await hashSessionToken(token), new Date().toISOString())
    : undefined;
  if (!user) throw new RequestError(401, 'unauthorized', 'Sign in to access this resource.');
  return user;
}

export async function startUserSession(
  database: D1Database,
  userId: string,
  previousToken: string | undefined,
): Promise<string> {
  const session = await newSession(userId);
  await createSession(
    database,
    session.record,
    previousToken ? await hashSessionToken(previousToken) : undefined,
  );
  return session.token;
}

export async function endUserSession(
  database: D1Database,
  token: string | undefined,
): Promise<void> {
  if (token) await deleteSession(database, await hashSessionToken(token));
}
