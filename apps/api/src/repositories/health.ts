export async function isDatabaseConnected(database: D1Database): Promise<boolean> {
  return Boolean(await database.prepare('SELECT 1 AS connected').first());
}
