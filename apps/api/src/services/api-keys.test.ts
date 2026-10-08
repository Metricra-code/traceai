import { describe, expect, it } from 'vitest';
import { createIngestionKey, parseIngestionKey, verifyIngestionSecret } from './api-keys';

describe('ingestion API keys', () => {
  it('creates unpredictable keys and stores only a salted hash', async () => {
    const first = await createIngestionKey();
    const second = await createIngestionKey();
    expect(first.rawKey).toMatch(/^tai_[a-f0-9]{32}_[a-f0-9]{64}$/);
    expect(first.rawKey).not.toEqual(second.rawKey);
    expect(first.keySalt).not.toEqual(second.keySalt);
    expect(first.keyHash).not.toContain(parseIngestionKey(first.rawKey)?.secret);
    const parsed = parseIngestionKey(first.rawKey);
    expect(parsed).toBeDefined();
    expect(await verifyIngestionSecret(parsed!.secret, first)).toBe(true);
    expect(await verifyIngestionSecret('0'.repeat(64), first)).toBe(false);
  });

  it('rejects ambiguous and malformed credentials', () => {
    expect(parseIngestionKey('tai_bad_secret')).toBeUndefined();
    expect(parseIngestionKey(`tai_${'a'.repeat(32)}_${'b'.repeat(64)} trailing`)).toBeUndefined();
  });
});
