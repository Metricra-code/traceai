import { countAuthRequest } from '../repositories/auth';
import { RateLimitError, RequestError } from './http-errors';

export const AUTH_IP_LIMIT = 20;
export const AUTH_EMAIL_LIMIT = 10;

export async function enforceAuthIpRate(database: D1Database, clientIp: string): Promise<void> {
  await enforceCounter(database, {
    key: `auth:ip:${await identifierHash(clientIp)}`,
    limit: AUTH_IP_LIMIT,
    windowMs: 60_000,
    now: Date.now(),
  });
}

export async function enforceAuthEmailRate(database: D1Database, email: string): Promise<void> {
  await enforceCounter(database, {
    key: `auth:email:${await identifierHash(email.toLowerCase())}`,
    limit: AUTH_EMAIL_LIMIT,
    windowMs: 15 * 60_000,
    now: Date.now(),
  });
}

export function trustedClientIp(
  connectingIp: string | undefined,
  environment: string | undefined,
): string {
  if (connectingIp && /^[a-f0-9:.]{3,64}$/i.test(connectingIp)) return connectingIp;
  if (environment === 'development') return '127.0.0.1';
  throw new RequestError(403, 'untrusted_request', 'The request could not be verified.');
}

async function enforceCounter(
  database: D1Database,
  counter: { key: string; limit: number; windowMs: number; now: number },
): Promise<void> {
  const result = await countAuthRequest(database, counter);
  if (!result.allowed)
    throw new RateLimitError(
      result.retryAfterSeconds,
      'Too many authentication attempts. Please try again later.',
    );
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
