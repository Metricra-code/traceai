import { projectSchema, type ApiKey, type Project } from '@traceai/shared';
import { z } from 'zod';
import {
  MAX_ACTIVE_PROJECT_KEYS,
  MAX_OWNER_PROJECTS,
  deleteOwnedProject,
  insertProject,
  insertProjectKey,
  listOwnedProjects,
  listProjectKeys,
  revokeProjectKey,
  rotateProjectKey,
  updateOwnedProject,
} from '../repositories/projects';
import { createIngestionKey } from './api-keys';
import { assertMutationOrigin, requireProjectOwner, requireSessionUser } from './authorization';
import { readBoundedJson } from './bounded-json';
import type { ApiContext } from './auth-sessions';
import { RequestError } from './http-errors';

const editSchema = z
  .object({
    name: projectSchema.shape.name.optional(),
    description: projectSchema.shape.description.removeDefault().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const deletionSchema = z.object({ confirmName: z.string().min(1).max(80) }).strict();

export async function getProjects(context: ApiContext): Promise<Project[]> {
  return listOwnedProjects(context.env.DB, (await requireSessionUser(context)).id);
}

export async function createProject(context: ApiContext): Promise<Project> {
  assertMutationOrigin(context);
  const user = await requireSessionUser(context);
  const values = projectSchema.safeParse(await readBoundedJson(context.req.raw));
  if (!values.success) throw invalidProject();
  const now = new Date().toISOString();
  const project = { id: crypto.randomUUID(), ...values.data, createdAt: now, updatedAt: now };
  if (!(await insertProject(context.env.DB, { ...project, ownerId: user.id })))
    throw new RequestError(
      409,
      'resource_limit',
      `You can have at most ${MAX_OWNER_PROJECTS} projects. Delete an unused project before creating another.`,
    );
  return project;
}

export async function editProject(context: ApiContext, projectId: string): Promise<Project> {
  assertMutationOrigin(context);
  await requireProjectOwner(context, projectId);
  const values = editSchema.safeParse(await readBoundedJson(context.req.raw));
  if (!values.success) throw invalidProject();
  const user = await requireSessionUser(context);
  const updated = await updateOwnedProject(context.env.DB, {
    projectId,
    ownerId: user.id,
    name: values.data.name,
    description: values.data.description,
    updatedAt: new Date().toISOString(),
  });
  if (!updated) throw missingKeyOrProject();
  return updated;
}

export async function removeProject(context: ApiContext, projectId: string): Promise<void> {
  assertMutationOrigin(context);
  const project = await requireProjectOwner(context, projectId);
  const body = deletionSchema.safeParse(await readBoundedJson(context.req.raw));
  if (!body.success || body.data.confirmName !== project.name)
    throw new RequestError(
      400,
      'confirmation_required',
      'Enter the current project name to confirm deletion.',
    );
  const user = await requireSessionUser(context);
  if (
    !(await deleteOwnedProject(context.env.DB, {
      projectId,
      ownerId: user.id,
      confirmName: body.data.confirmName,
    }))
  )
    throw missingKeyOrProject();
}

export async function getProjectKeys(context: ApiContext, projectId: string): Promise<ApiKey[]> {
  await requireProjectOwner(context, projectId);
  return listProjectKeys(context.env.DB, projectId);
}

export async function createProjectApiKey(
  context: ApiContext,
  projectId: string,
): Promise<{ apiKey: ApiKey; key: string }> {
  assertMutationOrigin(context);
  await requireProjectOwner(context, projectId);
  const key = await createIngestionKey();
  const apiKey = await insertProjectKey(context.env.DB, {
    projectId,
    key,
    createdAt: new Date().toISOString(),
  });
  if (!apiKey)
    throw new RequestError(
      409,
      'resource_limit',
      `A project can have at most ${MAX_ACTIVE_PROJECT_KEYS} active API keys. Revoke an unused key before creating another.`,
    );
  return { apiKey, key: key.rawKey };
}

export async function revokeProjectApiKey(
  context: ApiContext,
  input: { projectId: string; keyId: string },
): Promise<void> {
  assertMutationOrigin(context);
  await requireProjectOwner(context, input.projectId);
  const key = await revokeProjectKey(context.env.DB, {
    ...input,
    revokedAt: new Date().toISOString(),
  });
  if (!key) throw missingKeyOrProject();
}

export async function rotateProjectApiKey(
  context: ApiContext,
  input: { projectId: string; keyId: string },
): Promise<{ apiKey: ApiKey; key: string }> {
  assertMutationOrigin(context);
  await requireProjectOwner(context, input.projectId);
  const key = await createIngestionKey();
  const apiKey = await rotateProjectKey(context.env.DB, {
    projectId: input.projectId,
    previousKeyId: input.keyId,
    key,
    createdAt: new Date().toISOString(),
  });
  if (!apiKey) throw missingKeyOrProject();
  return { apiKey, key: key.rawKey };
}

function invalidProject(): RequestError {
  return new RequestError(
    400,
    'invalid_project',
    'Provide a project name between 1 and 80 characters and a description up to 500 characters.',
  );
}
function missingKeyOrProject(): RequestError {
  return new RequestError(404, 'not_found', 'The requested resource does not exist.');
}
