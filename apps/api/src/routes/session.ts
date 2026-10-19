import { getCookie, setCookie } from 'hono/cookie';
import type { ApiContext } from '../env';
import { assertMutationOrigin as assertAllowedOrigin } from '../services/authorization';
import {
  requireSessionUser,
  SESSION_COOKIE_NAME,
  SESSION_DURATION_MS,
} from '../services/auth-sessions';

export function assertMutationOrigin(context: ApiContext): void {
  assertAllowedOrigin(context.env.WEB_ORIGIN, context.req.header('origin'));
}

export function sessionToken(context: ApiContext): string | undefined {
  const token = getCookie(context, SESSION_COOKIE_NAME);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : undefined;
}

export function currentUser(context: ApiContext) {
  return requireSessionUser(context.env.DB, sessionToken(context));
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

export function clearSessionCookie(context: ApiContext): void {
  setCookie(context, SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    secure: context.env.ENVIRONMENT !== 'development',
    sameSite: 'Lax',
    path: '/',
    maxAge: 0,
  });
}
