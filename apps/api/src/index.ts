import { Hono } from 'hono';
import type { ApiEnv } from './env';
import { analyticsRoutes } from './routes/analytics';
import { authRouter } from './routes/auth';
import { healthRoutes } from './routes/health';
import { ingestionRoutes } from './routes/ingestion';
import { projectRouter } from './routes/projects';
import { RateLimitError, RequestError } from './services/http-errors';
import { PasswordHasher } from './services/password-hasher';
import { runScheduledCleanup } from './services/cleanup';

export { PasswordHasher };

const app = new Hono<ApiEnv>();

app.use('*', async (context, next) => {
  const requestId = crypto.randomUUID();
  context.set('requestId', requestId);
  context.header('X-Request-Id', requestId);
  context.header('Cache-Control', 'no-store');
  context.header('X-Content-Type-Options', 'nosniff');
  await next();
});

app.route('/', healthRoutes);
app.route('/', ingestionRoutes);
app.route('/v1/auth', authRouter);
app.route('/v1/projects', projectRouter);
app.route('/', analyticsRoutes);

app.onError((error, context) => {
  if (error instanceof RateLimitError)
    context.header('Retry-After', String(error.retryAfterSeconds));
  if (error instanceof RequestError)
    return context.json(
      { error: { code: error.code, message: error.publicMessage } },
      error.status,
    );
  // Never log bodies, headers, SQL values or exception messages (which can contain API keys).
  console.error(
    JSON.stringify({
      event: 'request_failed',
      requestId: context.get('requestId'),
      category: 'internal_error',
    }),
  );
  return context.json(
    {
      error: {
        code: 'internal_error',
        message: 'The request could not be completed. Please try again.',
      },
    },
    500,
  );
});

app.notFound((context) =>
  context.json(
    { error: { code: 'not_found', message: 'The requested endpoint does not exist.' } },
    404,
  ),
);
export default {
  fetch: app.fetch,
  scheduled(
    controller: ScheduledController,
    environment: ApiEnv['Bindings'],
    context: ExecutionContext,
  ) {
    context.waitUntil(runScheduledCleanup(environment.DB, controller.scheduledTime));
  },
};
