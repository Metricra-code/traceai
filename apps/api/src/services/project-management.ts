import { projectSchema, type ApiKey, type Project } from '@traceai/shared';
import { z } from 'zod';
import {
  MAX_ACTIVE_PROJECT_KEYS,
  KEY_HISTORY_LIMIT,
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
import { requireProjectOwner } from './authorization';
import { readBoundedJson } from './bounded-json';
import { RequestError } from './http-errors';

const editSchema = z
  .object({
    name: projectSchema.shape.name.optional(),
    description: projectSchema.shape.description.removeDefault().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const deletionSchema = z.object({ confirmName: z.string().min(1).max(80) }).strict();

export async function getProjects(database: D1Database, userId: string): Promise<Project[]> {
  return listOwnedProjects(database, userId);
}

export async function createProject(
  database: D1Database,
  userId: string,
  request: Request,
): Promise<Project> {
  const values = projectSchema.safeParse(await readBoundedJson(request));
  if (!values.success) throw invalidProject();
  const now = new Date().toISOString();
  const project = { id: crypto.randomUUID(), ...values.data, createdAt: now, updatedAt: now };
  if (!(await insertProject(database, { ...project, ownerId: userId })))
    throw new RequestError(
      409,
      'resource_limit',
      `You can have at most ${MAX_OWNER_PROJECTS} projects. Delete an unused project before creating another.`,
    );
  return project;
}

export async function editProject(
  database: D1Database,
  userId: string,
  projectId: string,
  request: Request,
): Promise<Project> {
  await requireProjectOwner(database, userId, projectId);
  const values = editSchema.safeParse(await readBoundedJson(request));
  if (!values.success) throw invalidProject();
  const updated = await updateOwnedProject(database, {
    projectId,
    ownerId: userId,
    name: values.data.name,
    description: values.data.description,
    updatedAt: new Date().toISOString(),
  });
  if (!updated) throw missingKeyOrProject();
  return updated;
}

export async function removeProject(
  database: D1Database,
  userId: string,
  projectId: string,
  request: Request,
): Promise<void> {
  const project = await requireProjectOwner(database, userId, projectId);
  const body = deletionSchema.safeParse(await readBoundedJson(request));
  if (!body.success || body.data.confirmName !== project.name)
    throw new RequestError(
      400,
      'confirmation_required',
      'Enter the current project name to confirm deletion.',
    );
  if (
    !(await deleteOwnedProject(database, {
      projectId,
      ownerId: userId,
      confirmName: body.data.confirmName,
    }))
  )
    throw missingKeyOrProject();
}

export async function getProjectKeys(
  database: D1Database,
  userId: string,
  projectId: string,
): Promise<{ items: ApiKey[]; historyLimit: number }> {
  await requireProjectOwner(database, userId, projectId);
  return { items: await listProjectKeys(database, projectId), historyLimit: KEY_HISTORY_LIMIT };
}

export async function createProjectApiKey(
  database: D1Database,
  userId: string,
  projectId: string,
): Promise<{ apiKey: ApiKey; key: string }> {
  await requireProjectOwner(database, userId, projectId);
  const key = await createIngestionKey();
  const apiKey = await insertProjectKey(database, {
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
  database: D1Database,
  userId: string,
  input: { projectId: string; keyId: string },
): Promise<void> {
  await requireProjectOwner(database, userId, input.projectId);
  const key = await revokeProjectKey(database, {
    ...input,
    revokedAt: new Date().toISOString(),
  });
  if (!key) throw missingKeyOrProject();
}

export async function rotateProjectApiKey(
  database: D1Database,
  userId: string,
  input: { projectId: string; keyId: string },
): Promise<{ apiKey: ApiKey; key: string }> {
  await requireProjectOwner(database, userId, input.projectId);
  const key = await createIngestionKey();
  const apiKey = await rotateProjectKey(database, {
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
