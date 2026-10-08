import { countAuthRequest } from '../repositories/auth';
import type { ApiContext } from './auth-sessions';
import { RequestError } from './http-errors';

export const AUTH_IP_LIMIT = 20;
export const AUTH_EMAIL_LIMIT = 10;

export async function enforceAuthIpRate(context: ApiContext): Promise<void> {
  await enforceCounter(context, {
    key: `auth:ip:${await identifierHash(trustedClientIp(context))}`,
    limit: AUTH_IP_LIMIT,
    windowMs: 60_000,
    now: Date.now(),
  });
}

export async function enforceAuthEmailRate(context: ApiContext, email: string): Promise<void> {
  await enforceCounter(context, {
    key: `auth:email:${await identifierHash(email.toLowerCase())}`,
    limit: AUTH_EMAIL_LIMIT,
    windowMs: 15 * 60_000,
    now: Date.now(),
  });
}

export function trustedClientIp(context: ApiContext): string {
  const ip = context.req.header('cf-connecting-ip');
  if (ip && /^[a-f0-9:.]{3,64}$/i.test(ip)) return ip;
  if (context.env.ENVIRONMENT === 'development') return '127.0.0.1';
  throw new RequestError(403, 'untrusted_request', 'The request could not be verified.');
}

async function enforceCounter(
  context: ApiContext,
  counter: { key: string; limit: number; windowMs: number; now: number },
): Promise<void> {
  const result = await countAuthRequest(context.env.DB, counter);
  if (!result.allowed) {
    context.header('Retry-After', String(result.retryAfterSeconds));
    throw new RequestError(
      429,
      'rate_limited',
      'Too many authentication attempts. Please try again later.',
    );
  }
}

async function identifierHash(value: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`traceai:auth-rate:v1:${value}`),
    ),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
