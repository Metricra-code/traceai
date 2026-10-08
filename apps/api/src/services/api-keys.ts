import { timingSafeEqual } from 'node:crypto';

interface IngestionSecretHash {
  keyHash: string;
  keySalt: string;
}

export interface CreatedIngestionKey extends IngestionSecretHash {
  id: string;
  rawKey: string;
  keyPrefix: string;
}

export function parseIngestionKey(rawKey: string): { id: string; secret: string } | undefined {
  const match = /^tai_([a-f0-9]{32})_([a-f0-9]{64})$/.exec(rawKey);
  return match?.[1] && match[2] ? { id: match[1], secret: match[2] } : undefined;
}

export async function createIngestionKey(): Promise<CreatedIngestionKey> {
  const id = randomHex(16);
  const secret = randomHex(32);
  const keySalt = randomHex(16);
  return {
    id,
    rawKey: `tai_${id}_${secret}`,
    keyPrefix: `tai_${id}_`,
    keySalt,
    keyHash: await hashSecret(secret, keySalt),
  };
}

export async function verifyIngestionSecret(
  secret: string,
  stored: IngestionSecretHash,
): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(stored.keyHash) || !/^[a-f0-9]{32}$/.test(stored.keySalt))
    return false;
  const candidate = await hashSecret(secret, stored.keySalt);
  return timingSafeEqual(
    new TextEncoder().encode(candidate),
    new TextEncoder().encode(stored.keyHash),
  );
}

async function hashSecret(secret: string, salt: string): Promise<string> {
  // A fast hash is appropriate only for randomly generated 256-bit secrets, never passwords.
  const bytes = new TextEncoder().encode(`traceai:ingestion:v1:${salt}:${secret}`);
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)));
}

function randomHex(length: number): string {
  return toHex(crypto.getRandomValues(new Uint8Array(length)));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
