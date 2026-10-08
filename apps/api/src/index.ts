import { Hono } from 'hono';
import {
  authenticateIngestion,
  enforceIngestionRate,
  ingestBatch,
  IngestionRateError,
} from './services/ingestion';
import { RequestError } from './services/http-errors';
import { analyticsRoutes } from './routes/analytics';
import { authRouter } from './routes/auth';
import { projectRouter } from './routes/projects';
import { PasswordHasher } from './services/password-hasher';
import { runScheduledCleanup } from './services/cleanup';

export { PasswordHasher };

export interface Bindings {
  DB: D1Database;
  PASSWORD_HASHER: DurableObjectNamespace<PasswordHasher>;
  ENVIRONMENT?: string;
  WEB_ORIGIN?: string;
}
const app = new Hono<{ Bindings: Bindings; Variables: { requestId: string } }>();

app.use('*', async (context, next) => {
  const requestId = crypto.randomUUID();
  context.set('requestId', requestId);
  context.header('X-Request-Id', requestId);
  context.header('Cache-Control', 'no-store');
  context.header('X-Content-Type-Options', 'nosniff');
  await next();
});

app.get('/health', async (context) => {
  const result = await context.env.DB.prepare('SELECT 1 AS connected').first();
  return context.json(
    { status: result ? 'ok' : 'error', service: 'traceai-api' },
    result ? 200 : 503,
  );
});

app.post('/v1/events/batch', async (context) => {
  const principal = await authenticateIngestion(
    context.env.DB,
    context.req.header('authorization'),
  );
  await enforceIngestionRate(context.env.DB, principal.id);
  return context.json(await ingestBatch(context.env.DB, principal, context.req.raw), 202);
});

app.route('/v1/auth', authRouter);
app.route('/v1/projects', projectRouter);
app.route('/', analyticsRoutes);

app.onError((error, context) => {
  if (error instanceof IngestionRateError)
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
  scheduled(controller: ScheduledController, environment: Bindings, context: ExecutionContext) {
    context.waitUntil(runScheduledCleanup(environment.DB, controller.scheduledTime));
  },
};
