import { Hono } from 'hono';
import type { ApiEnv } from '../env';
import { checkDatabaseHealth } from '../services/health';

export const healthRoutes = new Hono<ApiEnv>();

healthRoutes.get('/health', async (context) => {
  const healthy = await checkDatabaseHealth(context.env.DB);
  return context.json(
    { status: healthy ? 'ok' : 'error', service: 'traceai-api' },
    healthy ? 200 : 503,
  );
});
