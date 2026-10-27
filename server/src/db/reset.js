import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { resetDatabase, runMigrations } from './migrate.js';
import env from '../config/env.js';
import logger from '../config/logger.js';

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const dbName = env.db.name;
  resetDatabase(dbName)
    .then(() => runMigrations({ dbName, silent: true }))
    .then(() => {
      logger.info(`Database "${dbName}" reset and migrated.`);
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Reset failed', { error: error.message });
      process.exit(1);
    });
}
