import { Hono } from 'hono';
import type { ApiEnv } from '../env';
import { authenticateIngestion, enforceIngestionRate, ingestBatch } from '../services/ingestion';

export const ingestionRoutes = new Hono<ApiEnv>();

ingestionRoutes.post('/v1/events/batch', async (context) => {
  const principal = await authenticateIngestion(
    context.env.DB,
    context.req.header('authorization'),
  );
  await enforceIngestionRate(context.env.DB, principal.id);
  return context.json(await ingestBatch(context.env.DB, principal, context.req.raw), 202);
});
