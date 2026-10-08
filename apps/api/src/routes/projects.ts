import { Hono } from 'hono';
import type { Bindings } from '../index';
import {
  createProject,
  createProjectApiKey,
  editProject,
  getProjectKeys,
  getProjects,
  removeProject,
  revokeProjectApiKey,
  rotateProjectApiKey,
} from '../services/project-management';
import { requireProjectOwner } from '../services/authorization';
import { KEY_HISTORY_LIMIT } from '../repositories/projects';

export const projectRouter = new Hono<{ Bindings: Bindings; Variables: { requestId: string } }>();
projectRouter.get('/', async (context) => context.json({ items: await getProjects(context) }));
projectRouter.post('/', async (context) => context.json(await createProject(context), 201));
projectRouter.get('/:id', async (context) =>
  context.json(await requireProjectOwner(context, context.req.param('id'))),
);
projectRouter.patch('/:id', async (context) =>
  context.json(await editProject(context, context.req.param('id'))),
);
projectRouter.delete('/:id', async (context) => {
  await removeProject(context, context.req.param('id'));
  return context.body(null, 204);
});
projectRouter.get('/:id/api-keys', async (context) =>
  context.json({
    items: await getProjectKeys(context, context.req.param('id')),
    historyLimit: KEY_HISTORY_LIMIT,
  }),
);
projectRouter.post('/:id/api-keys', async (context) =>
  context.json(await createProjectApiKey(context, context.req.param('id')), 201),
);
projectRouter.delete('/:id/api-keys/:keyId', async (context) => {
  await revokeProjectApiKey(context, {
    projectId: context.req.param('id'),
    keyId: context.req.param('keyId'),
  });
  return context.body(null, 204);
});
projectRouter.post('/:id/api-keys/:keyId/rotate', async (context) =>
  context.json(
    await rotateProjectApiKey(context, {
      projectId: context.req.param('id'),
      keyId: context.req.param('keyId'),
    }),
    201,
  ),
);
export default projectRouter;
