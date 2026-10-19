import { CLEANUP_ROW_LIMIT, pruneExpiredAuthState } from '../repositories/cleanup';

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
