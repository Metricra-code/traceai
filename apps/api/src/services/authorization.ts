import type { Project } from '@traceai/shared';
import { findOwnedProject } from '../repositories/projects';
import { RequestError } from './http-errors';

export function assertMutationOrigin(
  expectedOrigin: string | undefined,
  origin: string | undefined,
): void {
  if (!expectedOrigin || !origin || origin !== expectedOrigin)
    throw new RequestError(403, 'invalid_origin', 'This request origin is not permitted.');
}

export async function requireProjectOwner(
  database: D1Database,
  ownerId: string,
  projectId: string,
): Promise<Project> {
  const project = /^[a-zA-Z0-9_-]{1,128}$/.test(projectId)
    ? await findOwnedProject(database, { projectId, ownerId })
    : undefined;
  if (!project) throw new RequestError(404, 'not_found', 'The requested project does not exist.');
  return project;
}
