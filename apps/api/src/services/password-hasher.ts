import { DurableObject } from 'cloudflare:workers';
import { z } from 'zod';
import type { Bindings } from '../index';
import { hashPassword, verifyPassword } from './passwords';

const passwordSchema = z.string().min(12).max(128);

/** Private SQLite-backed Durable Object: Free CPU allowance is 30 s instead of the edge's 10 ms. */
export class PasswordHasher extends DurableObject<Bindings> {
  async hash(password: string): Promise<string> {
    return hashPassword(passwordSchema.parse(password));
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    return verifyPassword(passwordSchema.parse(password), z.string().max(200).parse(encoded));
  }
}
