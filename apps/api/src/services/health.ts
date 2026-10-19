import { isDatabaseConnected } from '../repositories/health';

export const checkDatabaseHealth = (database: D1Database): Promise<boolean> =>
  isDatabaseConnected(database);
