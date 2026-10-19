import { Hono } from 'hono';
import type { ApiContext, ApiEnv } from '../env';
import { trustedClientIp } from '../services/auth-rate';
import { endUserSession } from '../services/auth-sessions';
import { login, register } from '../services/authentication';
import {
  assertMutationOrigin,
  clearSessionCookie,
  currentUser,
  sessionToken,
  setSessionCookie,
} from './session';

export const authRouter = new Hono<ApiEnv>();

function authenticationRequest(context: ApiContext) {
  assertMutationOrigin(context);
  const clientIp = trustedClientIp(context.req.header('cf-connecting-ip'), context.env.ENVIRONMENT);
  // Stable shards bound each DO's memory; every request is rate-limited before reaching expensive crypto.
  const shard = clientIp
    .split('')
    .reduce((total, character) => (total + character.charCodeAt(0)) % 16, 0);
  return {
    database: context.env.DB,
    hasher: context.env.PASSWORD_HASHER.getByName(`password-hasher-${shard}`),
    clientIp,
    request: context.req.raw,
  };
}

authRouter.post('/register', async (context) => {
  const { user, sessionToken: token } = await register(authenticationRequest(context));
  setSessionCookie(context, token);
  return context.json({ user }, 201);
});
authRouter.post('/login', async (context) => {
  const { user, sessionToken: token } = await login({
    ...authenticationRequest(context),
    previousSessionToken: sessionToken(context),
  });
  setSessionCookie(context, token);
  return context.json({ user });
});
authRouter.get('/session', async (context) => context.json({ user: await currentUser(context) }));
authRouter.post('/logout', async (context) => {
  assertMutationOrigin(context);
  await endUserSession(context.env.DB, sessionToken(context));
  clearSessionCookie(context);
  return context.body(null, 204);
});
