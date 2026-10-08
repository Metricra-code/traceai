import { credentialsSchema } from '@traceai/shared';
import { findCredentialsUser, registerUserSession, type AuthUser } from '../repositories/auth';
import { readBoundedJson } from './bounded-json';
import { enforceAuthEmailRate, enforceAuthIpRate, trustedClientIp } from './auth-rate';
import { assertMutationOrigin } from './authorization';
import { newSession, setSessionCookie, startUserSession, type ApiContext } from './auth-sessions';
import { RequestError } from './http-errors';
import { DUMMY_PASSWORD_HASH, isPasswordHash } from './passwords';

export async function register(context: ApiContext): Promise<AuthUser> {
  const credentials = await authenticationInput(context);
  const hasher = passwordHasher(context);
  const passwordHash = await hasher.hash(credentials.password);
  const user = { id: crypto.randomUUID(), email: credentials.email, passwordHash };
  const session = await newSession(user.id);
  if (!(await registerUserSession(context.env.DB, user, session.record)))
    throw new RequestError(
      409,
      'registration_failed',
      'Registration could not be completed. Try signing in or use different credentials.',
    );
  setSessionCookie(context, session.token);
  return { id: user.id, email: user.email };
}

export async function login(context: ApiContext): Promise<AuthUser> {
  const credentials = await authenticationInput(context);
  const user = await findCredentialsUser(context.env.DB, credentials.email);
  const encoded =
    user && isPasswordHash(user.passwordHash) ? user.passwordHash : DUMMY_PASSWORD_HASH;
  const valid = await passwordHasher(context).verify(credentials.password, encoded);
  if (!user || !valid || !isPasswordHash(user.passwordHash))
    throw new RequestError(401, 'invalid_credentials', 'The email or password is incorrect.');
  await startUserSession(context, user.id);
  return { id: user.id, email: user.email };
}

async function authenticationInput(
  context: ApiContext,
): Promise<{ email: string; password: string }> {
  assertMutationOrigin(context);
  await enforceAuthIpRate(context);
  const parsed = credentialsSchema.safeParse(await readBoundedJson(context.req.raw));
  if (!parsed.success)
    throw new RequestError(
      400,
      'invalid_credentials',
      'Enter a valid email and a password between 12 and 128 characters.',
    );
  await enforceAuthEmailRate(context, parsed.data.email);
  return parsed.data;
}

function passwordHasher(context: ApiContext) {
  // Stable shards bound each DO's memory; every request is rate-limited before reaching expensive crypto.
  const ip = trustedClientIp(context);
  const shard = ip
    .split('')
    .reduce((total, character) => (total + character.charCodeAt(0)) % 16, 0);
  return context.env.PASSWORD_HASHER.getByName(`password-hasher-${shard}`);
}
