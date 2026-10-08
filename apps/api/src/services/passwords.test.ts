import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './passwords';

describe('password hashing', () => {
  it('generates salted work-factor encoded hashes and verifies without storing plaintext', async () => {
    const first = await hashPassword('correct horse battery staple');
    const second = await hashPassword('correct horse battery staple');
    expect(first).not.toEqual(second);
    expect(first).not.toContain('correct horse');
    expect(await verifyPassword('correct horse battery staple', first)).toBe(true);
    expect(await verifyPassword('wrong password', first)).toBe(false);
  }, 20_000);
  it('matches a fixed UTF-8 known-answer vector at the deployed work factor', async () => {
    const encoded =
      'scrypt$v1$32768$8$3$000102030405060708090a0b0c0d0e0f$82bca8b51e607e9f929042de27e7b1dfae8ce6a70731d0003499b79eeb8a9131';
    expect(await verifyPassword('unicode fixture 密碼 🐴', encoded)).toBe(true);
  }, 20_000);
  it('does not authenticate malformed or disabled hashes', async () => {
    expect(await verifyPassword('correct horse battery staple', 'disabled:local-only')).toBe(false);
  }, 20_000);
});
