import { credentialsSchema } from '@traceai/shared';
import { findCredentialsUser, registerUserSession, type AuthUser } from '../repositories/auth';
import { readBoundedJson } from './bounded-json';
import { enforceAuthEmailRate, enforceAuthIpRate } from './auth-rate';
import { newSession, startUserSession } from './auth-sessions';
import { RequestError } from './http-errors';
import { DUMMY_PASSWORD_HASH, isPasswordHash } from './passwords';
import type { PasswordHasher } from './password-hasher';

interface AuthenticationRequest {
  database: D1Database;
  hasher: DurableObjectStub<PasswordHasher>;
  clientIp: string;
  request: Request;
}
interface Authenticated {
  user: AuthUser;
  sessionToken: string;
}

export async function register(input: AuthenticationRequest): Promise<Authenticated> {
  const credentials = await authenticationInput(input);
  const passwordHash = await input.hasher.hash(credentials.password);
  const user = { id: crypto.randomUUID(), email: credentials.email, passwordHash };
  const session = await newSession(user.id);
  if (!(await registerUserSession(input.database, user, session.record)))
    throw new RequestError(
      409,
      'registration_failed',
      'Registration could not be completed. Try signing in or use different credentials.',
    );
  return { user: { id: user.id, email: user.email }, sessionToken: session.token };
}

export async function login(
  input: AuthenticationRequest & { previousSessionToken: string | undefined },
): Promise<Authenticated> {
  const credentials = await authenticationInput(input);
  const user = await findCredentialsUser(input.database, credentials.email);
  const encoded =
    user && isPasswordHash(user.passwordHash) ? user.passwordHash : DUMMY_PASSWORD_HASH;
  const valid = await input.hasher.verify(credentials.password, encoded);
  if (!user || !valid || !isPasswordHash(user.passwordHash))
    throw new RequestError(401, 'invalid_credentials', 'The email or password is incorrect.');
  const sessionToken = await startUserSession(input.database, user.id, input.previousSessionToken);
  return { user: { id: user.id, email: user.email }, sessionToken };
}

async function authenticationInput(
  input: AuthenticationRequest,
): Promise<{ email: string; password: string }> {
  await enforceAuthIpRate(input.database, input.clientIp);
  const parsed = credentialsSchema.safeParse(await readBoundedJson(input.request));
  if (!parsed.success)
    throw new RequestError(
      400,
      'invalid_credentials',
      'Enter a valid email and a password between 12 and 128 characters.',
    );
  await enforceAuthEmailRate(input.database, parsed.data.email);
  return parsed.data;
}
