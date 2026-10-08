import type { Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import type { Bindings } from '../index';
import {
  createSession,
  deleteSession,
  findSessionUser,
  type AuthUser,
  type SessionRecord,
} from '../repositories/auth';
import { RequestError } from './http-errors';

export type ApiContext = Context<{ Bindings: Bindings; Variables: { requestId: string } }>;
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

export async function requireSessionUser(context: ApiContext): Promise<AuthUser> {
  const token = getSessionToken(context);
  const user = token
    ? await findSessionUser(context.env.DB, await hashSessionToken(token), new Date().toISOString())
    : undefined;
  if (!user) throw new RequestError(401, 'unauthorized', 'Sign in to access this resource.');
  return user;
}

export function setSessionCookie(context: ApiContext, token: string): void {
  setCookie(context, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: context.env.ENVIRONMENT !== 'development',
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DURATION_MS / 1000,
  });
}

export async function startUserSession(context: ApiContext, userId: string): Promise<void> {
  const previous = getSessionToken(context);
  const session = await newSession(userId);
  await createSession(
    context.env.DB,
    session.record,
    previous ? await hashSessionToken(previous) : undefined,
  );
  setSessionCookie(context, session.token);
}

export async function endUserSession(context: ApiContext): Promise<void> {
  const token = getSessionToken(context);
  if (token) await deleteSession(context.env.DB, await hashSessionToken(token));
  setCookie(context, SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: context.env.ENVIRONMENT !== 'development',
    sameSite: 'Lax',
    path: '/',
    maxAge: 0,
  });
}

function getSessionToken(context: ApiContext): string | undefined {
  const token = getCookie(context, SESSION_COOKIE_NAME);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : undefined;
}
