import { Hono, type Context } from 'hono';
import type { Bindings } from '../index';
import { requireProjectOwner } from '../services/authorization';
import { parseAggregateQuery, parseTraceId, parseTraceQuery } from '../services/analytics-query';
import {
  getDemo,
  getMetrics,
  getModels,
  getOverview,
  getTrace,
  getTraces,
  publicDemoProjectId,
} from '../services/analytics';
import { RequestError } from '../services/http-errors';

type ApiEnvironment = { Bindings: Bindings; Variables: { requestId: string } };
interface ReadScope {
  projectId: string;
  defaultTo: string;
}
export const analyticsRoutes = new Hono<ApiEnvironment>();

async function resolveScope(context: Context<ApiEnvironment>): Promise<ReadScope> {
  const projectId = context.req.param('projectId');
  if (projectId !== undefined) {
    await requireProjectOwner(context, projectId);
    return { projectId, defaultTo: new Date().toISOString() };
  }
  const demo = await getDemo(context.env.DB);
  // Windows are [from,to); add 1ms so a default window includes the latest seeded trace.
  return {
    projectId: publicDemoProjectId,
    defaultTo: new Date(Date.parse(demo.anchor) + 1).toISOString(),
  };
}
const parameters = (context: Context<ApiEnvironment>) => new URL(context.req.url).searchParams;

analyticsRoutes.get('/v1/demo', async (context) => {
  if ([...parameters(context)].length)
    throw new RequestError(
      400,
      'invalid_query',
      'The demo metadata endpoint does not accept query parameters.',
    );
  return context.json(await getDemo(context.env.DB));
});

for (const base of ['/v1/demo', '/v1/projects/:projectId']) {
  analyticsRoutes.get(`${base}/overview`, async (context) => {
    const scope = await resolveScope(context);
    const query = parseAggregateQuery(parameters(context), scope);
    return context.json(await getOverview(context.env.DB, scope.projectId, query));
  });
  analyticsRoutes.get(`${base}/metrics`, async (context) => {
    const scope = await resolveScope(context);
    const query = parseAggregateQuery(parameters(context), scope);
    return context.json(await getMetrics(context.env.DB, scope.projectId, query));
  });
  analyticsRoutes.get(`${base}/models`, async (context) => {
    const scope = await resolveScope(context);
    const query = parseAggregateQuery(parameters(context), scope);
    return context.json(await getModels(context.env.DB, scope.projectId, query));
  });
  analyticsRoutes.get(`${base}/traces`, async (context) => {
    const scope = await resolveScope(context);
    const query = parseTraceQuery(parameters(context), scope);
    return context.json(await getTraces(context.env.DB, scope.projectId, query));
  });
  analyticsRoutes.get(`${base}/traces/:traceId`, async (context) => {
    const scope = await resolveScope(context);
    if ([...parameters(context)].length)
      throw new RequestError(400, 'invalid_query', 'Trace details do not accept query parameters.');
    const traceId = parseTraceId(context.req.param('traceId'));
    return context.json(await getTrace(context.env.DB, scope.projectId, traceId));
  });
}
