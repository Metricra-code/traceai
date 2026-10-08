import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';

const parameters = { N: 32768, r: 8, p: 3, maxmem: 40 * 1024 * 1024 };
const format = /^scrypt\$v1\$32768\$8\$3\$([a-f0-9]{32})\$([a-f0-9]{64})$/;
const prefix = 'scrypt$v1$32768$8$3$';
export const DUMMY_PASSWORD_HASH = `${prefix}${'0'.repeat(32)}$${'0'.repeat(64)}`;

/** Only execute inside the password Durable Object; scrypt exceeds the edge Worker's Free CPU budget. */
export async function hashPassword(password: string): Promise<string> {
  const salt = Buffer.from(randomBytes(16));
  const digest = Buffer.from(derive(password, salt));
  return `${prefix}${salt.toString('hex')}$${digest.toString('hex')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const fields = format.exec(encoded);
  if (!fields?.[1] || !fields[2] || Buffer.byteLength(password, 'utf8') > 1024) return false;
  const actual = derive(password, Buffer.from(fields[1], 'hex'));
  return timingSafeEqual(actual, Buffer.from(fields[2], 'hex'));
}

export function isPasswordHash(encoded: string): boolean {
  return format.test(encoded);
}

function derive(password: string, salt: Buffer): Buffer {
  if (Buffer.byteLength(password, 'utf8') > 1024)
    throw new RangeError('Password exceeds maximum byte length');
  // OWASP's equivalent 32 MiB profile; fixed parameters reject attacker-controlled work factors.
  return scryptSync(password, salt, 32, parameters);
}
