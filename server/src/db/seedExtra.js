import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { query, withTransaction, pool } from '../config/db.js';
import { runMigrations, ensureDatabase } from './migrate.js';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { seedExtraCatalog } from './seedCatalog.js';

const INSTRUCTOR_EMAILS = ['sarah.chen@cyberita.plus', 'marcus.reid@cyberita.plus'];

export async function seedExtra() {
  await ensureDatabase(env.db.name);
  await runMigrations({ silent: true });

  const { rows } = await query(
    'SELECT id, email FROM users WHERE email = ANY($1::text[])',
    [INSTRUCTOR_EMAILS]
  );
  const byEmail = Object.fromEntries(rows.map((row) => [row.email, row.id]));

  const linux = byEmail['sarah.chen@cyberita.plus'];
  const net = byEmail['marcus.reid@cyberita.plus'];
  if (!linux || !net) {
    throw new Error('Base seed users not found. Run npm run db:seed first.');
  }

  await withTransaction((client) => seedExtraCatalog(client, { linux, net }));
  logger.info('Extra catalog seeded: 8 courses with lessons, quizzes and labs.');
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  seedExtra()
    .then(async () => {
      await pool.end();
      process.exit(0);
    })
    .catch(async (error) => {
      logger.error('Extra catalog seed failed', { error: error.message, stack: error.stack });
      await pool.end();
      process.exit(1);
    });
}
