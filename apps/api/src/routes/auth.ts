import { Hono } from 'hono';
import type { Bindings } from '../index';
import { login, register } from '../services/authentication';
import { assertMutationOrigin } from '../services/authorization';
import { endUserSession, requireSessionUser } from '../services/auth-sessions';

export const authRouter = new Hono<{ Bindings: Bindings; Variables: { requestId: string } }>();
authRouter.post('/register', async (context) =>
  context.json({ user: await register(context) }, 201),
);
authRouter.post('/login', async (context) => context.json({ user: await login(context) }));
authRouter.get('/session', async (context) =>
  context.json({ user: await requireSessionUser(context) }),
);
authRouter.post('/logout', async (context) => {
  assertMutationOrigin(context);
  await endUserSession(context);
  return context.body(null, 204);
});
export default authRouter;
