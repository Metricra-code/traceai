import type { Context } from 'hono';
import type { PasswordHasher } from './services/password-hasher';

export interface Bindings {
  DB: D1Database;
  PASSWORD_HASHER: DurableObjectNamespace<PasswordHasher>;
  ENVIRONMENT?: string;
  WEB_ORIGIN?: string;
}
export type ApiEnv = { Bindings: Bindings; Variables: { requestId: string } };
export type ApiContext = Context<ApiEnv>;
