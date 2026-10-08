export const CLEANUP_ROW_LIMIT = 250;

/** Only expired authentication state; no users, projects, keys, pricing or telemetry are deleted. */
export async function pruneExpiredAuthState(database: D1Database, now: number) {
  const result = await database.batch([
    database
      .prepare(
        `DELETE FROM sessions WHERE id IN (
      SELECT id FROM sessions WHERE expires_at <= ? ORDER BY expires_at LIMIT ?
    )`,
      )
      .bind(new Date(now).toISOString(), CLEANUP_ROW_LIMIT),
    database
      .prepare(
        `DELETE FROM rate_limits WHERE key IN (
      SELECT key FROM rate_limits WHERE expires_at <= ? ORDER BY expires_at LIMIT ?
    )`,
      )
      .bind(now, CLEANUP_ROW_LIMIT),
  ]);
  return {
    sessionsDeleted: result[0]?.meta.changes ?? 0,
    countersDeleted: result[1]?.meta.changes ?? 0,
  };
}

export async function runScheduledCleanup(
  database: D1Database,
  scheduledTime: number,
): Promise<void> {
  try {
    const counts = await pruneExpiredAuthState(database, scheduledTime);
    console.log(
      JSON.stringify({
        event: 'expired_auth_state_cleanup',
        ...counts,
        limitPerTable: CLEANUP_ROW_LIMIT,
      }),
    );
  } catch {
    // Exception strings, SQL values, session IDs and rate-counter identities are intentionally omitted.
    console.error(
      JSON.stringify({ event: 'expired_auth_state_cleanup_failed', category: 'storage_error' }),
    );
    throw new Error('Scheduled authentication-state cleanup failed.');
  }
}
