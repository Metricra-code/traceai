import { Hono } from 'hono';
import type { ApiEnv } from '../env';
import { requireProjectOwner } from '../services/authorization';
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
import { assertMutationOrigin, currentUser } from './session';

export const projectRouter = new Hono<ApiEnv>();
projectRouter.get('/', async (context) => {
  const user = await currentUser(context);
  return context.json({ items: await getProjects(context.env.DB, user.id) });
});
projectRouter.post('/', async (context) => {
  assertMutationOrigin(context);
  const user = await currentUser(context);
  return context.json(await createProject(context.env.DB, user.id, context.req.raw), 201);
});
projectRouter.get('/:id', async (context) => {
  const user = await currentUser(context);
  return context.json(await requireProjectOwner(context.env.DB, user.id, context.req.param('id')));
});
projectRouter.patch('/:id', async (context) => {
  assertMutationOrigin(context);
  const user = await currentUser(context);
  return context.json(
    await editProject(context.env.DB, user.id, context.req.param('id'), context.req.raw),
  );
});
projectRouter.delete('/:id', async (context) => {
  assertMutationOrigin(context);
  const user = await currentUser(context);
  await removeProject(context.env.DB, user.id, context.req.param('id'), context.req.raw);
  return context.body(null, 204);
});
projectRouter.get('/:id/api-keys', async (context) => {
  const user = await currentUser(context);
  return context.json(await getProjectKeys(context.env.DB, user.id, context.req.param('id')));
});
projectRouter.post('/:id/api-keys', async (context) => {
  assertMutationOrigin(context);
  const user = await currentUser(context);
  return context.json(
    await createProjectApiKey(context.env.DB, user.id, context.req.param('id')),
    201,
  );
});
projectRouter.delete('/:id/api-keys/:keyId', async (context) => {
  assertMutationOrigin(context);
  const user = await currentUser(context);
  await revokeProjectApiKey(context.env.DB, user.id, {
    projectId: context.req.param('id'),
    keyId: context.req.param('keyId'),
  });
  return context.body(null, 204);
});
projectRouter.post('/:id/api-keys/:keyId/rotate', async (context) => {
  assertMutationOrigin(context);
  const user = await currentUser(context);
  return context.json(
    await rotateProjectApiKey(context.env.DB, user.id, {
      projectId: context.req.param('id'),
      keyId: context.req.param('keyId'),
    }),
    201,
  );
});
