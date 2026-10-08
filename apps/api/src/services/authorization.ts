import type { Project } from '@traceai/shared';
import { findOwnedProject } from '../repositories/projects';
import { requireSessionUser, type ApiContext } from './auth-sessions';
import { RequestError } from './http-errors';

export { requireSessionUser } from './auth-sessions';

export function assertMutationOrigin(context: ApiContext): void {
  const expected = context.env.WEB_ORIGIN;
  const origin = context.req.header('origin');
  if (!expected || !origin || origin !== expected)
    throw new RequestError(403, 'invalid_origin', 'This request origin is not permitted.');
}

export async function requireProjectOwner(
  context: ApiContext,
  projectId: string,
): Promise<Project> {
  const user = await requireSessionUser(context);
  const project = /^[a-zA-Z0-9_-]{1,128}$/.test(projectId)
    ? await findOwnedProject(context.env.DB, { projectId, ownerId: user.id })
    : undefined;
  if (!project) throw new RequestError(404, 'not_found', 'The requested project does not exist.');
  return project;
}
