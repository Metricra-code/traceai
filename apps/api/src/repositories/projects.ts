import { apiKeys, projects } from '@traceai/database';
import type { ApiKey, Project } from '@traceai/shared';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { CreatedIngestionKey } from '../services/api-keys';

export const MAX_OWNER_PROJECTS = 100;
export const MAX_ACTIVE_PROJECT_KEYS = 20;
export const KEY_HISTORY_LIMIT = 100;

const projectColumns = {
  id: projects.id,
  name: projects.name,
  description: projects.description,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
};
const keyColumns = {
  id: apiKeys.id,
  keyPrefix: apiKeys.keyPrefix,
  createdAt: apiKeys.createdAt,
  lastUsedAt: apiKeys.lastUsedAt,
  revokedAt: apiKeys.revokedAt,
};

export async function findOwnedProject(
  database: D1Database,
  scope: { projectId: string; ownerId: string },
): Promise<Project | undefined> {
  return (
    await drizzle(database)
      .select(projectColumns)
      .from(projects)
      .where(and(eq(projects.id, scope.projectId), eq(projects.ownerId, scope.ownerId)))
      .limit(1)
  )[0];
}
export async function listOwnedProjects(database: D1Database, ownerId: string): Promise<Project[]> {
  return drizzle(database)
    .select(projectColumns)
    .from(projects)
    .where(eq(projects.ownerId, ownerId))
    .orderBy(desc(projects.createdAt), desc(projects.id))
    .limit(MAX_OWNER_PROJECTS);
}
export async function insertProject(
  database: D1Database,
  project: Project & { ownerId: string },
): Promise<boolean> {
  const result = await database
    .prepare(
      `INSERT INTO projects (id,owner_id,name,description,created_at,updated_at)
    SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM projects WHERE owner_id = ?) < ?`,
    )
    .bind(
      project.id,
      project.ownerId,
      project.name,
      project.description,
      project.createdAt,
      project.updatedAt,
      project.ownerId,
      MAX_OWNER_PROJECTS,
    )
    .run();
  return result.meta.changes === 1;
}

export async function updateOwnedProject(
  database: D1Database,
  input: {
    projectId: string;
    ownerId: string;
    name?: string;
    description?: string;
    updatedAt: string;
  },
): Promise<Project | undefined> {
  return (
    await drizzle(database)
      .update(projects)
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined ? {} : { description: input.description }),
        updatedAt: input.updatedAt,
      })
      .where(and(eq(projects.id, input.projectId), eq(projects.ownerId, input.ownerId)))
      .returning(projectColumns)
  )[0];
}
export async function deleteOwnedProject(
  database: D1Database,
  scope: { projectId: string; ownerId: string; confirmName: string },
): Promise<boolean> {
  const rows = await drizzle(database)
    .delete(projects)
    .where(
      and(
        eq(projects.id, scope.projectId),
        eq(projects.ownerId, scope.ownerId),
        eq(projects.name, scope.confirmName),
      ),
    )
    .returning({ id: projects.id });
  return rows.length === 1;
}
export async function listProjectKeys(database: D1Database, projectId: string): Promise<ApiKey[]> {
  return drizzle(database)
    .select(keyColumns)
    .from(apiKeys)
    .where(eq(apiKeys.projectId, projectId))
    .orderBy(asc(sql`${apiKeys.revokedAt} IS NOT NULL`), desc(apiKeys.createdAt), desc(apiKeys.id))
    .limit(KEY_HISTORY_LIMIT);
}
export async function insertProjectKey(
  database: D1Database,
  input: { projectId: string; key: CreatedIngestionKey; createdAt: string },
): Promise<ApiKey | undefined> {
  const row = await database
    .prepare(
      `INSERT INTO api_keys (id,project_id,key_hash,key_salt,key_prefix,created_at)
    SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM api_keys WHERE project_id = ? AND revoked_at IS NULL) < ?
    RETURNING id, key_prefix AS keyPrefix, created_at AS createdAt, last_used_at AS lastUsedAt, revoked_at AS revokedAt`,
    )
    .bind(
      input.key.id,
      input.projectId,
      input.key.keyHash,
      input.key.keySalt,
      input.key.keyPrefix,
      input.createdAt,
      input.projectId,
      MAX_ACTIVE_PROJECT_KEYS,
    )
    .first<ApiKey>();
  return row ?? undefined;
}

export async function revokeProjectKey(
  database: D1Database,
  input: { projectId: string; keyId: string; revokedAt: string },
): Promise<ApiKey | undefined> {
  return (
    await drizzle(database)
      .update(apiKeys)
      .set({ revokedAt: sql`COALESCE(${apiKeys.revokedAt}, ${input.revokedAt})` })
      .where(and(eq(apiKeys.id, input.keyId), eq(apiKeys.projectId, input.projectId)))
      .returning(keyColumns)
  )[0];
}
export async function rotateProjectKey(
  database: D1Database,
  input: { projectId: string; previousKeyId: string; key: CreatedIngestionKey; createdAt: string },
): Promise<ApiKey | undefined> {
  // Both statements share a transaction; insert only if this request won the active-key revoke.
  const result = await database.batch([
    database
      .prepare(
        'UPDATE api_keys SET revoked_at = ? WHERE id = ? AND project_id = ? AND revoked_at IS NULL',
      )
      .bind(input.createdAt, input.previousKeyId, input.projectId),
    database
      .prepare(
        'INSERT INTO api_keys (id,project_id,key_hash,key_salt,key_prefix,created_at) SELECT ?,?,?,?,?,? WHERE changes() = 1',
      )
      .bind(
        input.key.id,
        input.projectId,
        input.key.keyHash,
        input.key.keySalt,
        input.key.keyPrefix,
        input.createdAt,
      ),
  ]);
  return result[0]?.meta.changes === 1
    ? {
        id: input.key.id,
        keyPrefix: input.key.keyPrefix,
        createdAt: input.createdAt,
        lastUsedAt: null,
        revokedAt: null,
      }
    : undefined;
}
