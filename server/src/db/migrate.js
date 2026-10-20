import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import env from '../config/env.js';
import { buildPoolConfig } from '../config/db.js';
import logger from '../config/logger.js';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/** Ensures the target database exists (connects to the maintenance DB). */
export async function ensureDatabase(dbName = env.db.name) {
  const client = new Client({ ...buildPoolConfig('postgres') });
  await client.connect();
  try {
    const { rows } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (rows.length === 0) {
      await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
      logger.info(`Created database ${dbName}`);
    }
  } finally {
    await client.end();
  }
}

export function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

function checksum(content) {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 32);
}

/**
 * Applies pending migrations in order inside a transaction per file.
 * Tracks applied migrations with their checksum to detect edited history.
 */
export async function runMigrations({ dbName = env.db.name, silent = false } = {}) {
  await ensureDatabase(dbName);
  const client = new Client({ ...buildPoolConfig(dbName) });
  await client.connect();
  const applied = [];
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

    const files = listMigrationFiles();
    for (const file of files) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const sum = checksum(sql);
      const { rows } = await client.query('SELECT checksum FROM schema_migrations WHERE name = $1', [file]);
      if (rows.length > 0) {
        if (rows[0].checksum !== sum) {
          throw new Error(`Migration "${file}" was modified after being applied. Create a new migration instead.`);
        }
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [file, sum]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Migration "${file}" failed: ${error.message}`);
      }
      applied.push(file);
      if (!silent) logger.info(`Applied migration ${file}`);
    }
    return applied;
  } finally {
    await client.end();
  }
}

export async function resetDatabase(dbName = env.db.name) {
  await ensureDatabase(dbName);
  const client = new Client({ ...buildPoolConfig(dbName) });
  await client.connect();
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  runMigrations()
    .then((applied) => {
      if (applied.length === 0) logger.info('No pending migrations — database is up to date.');
      else logger.info(`Applied ${applied.length} migration(s).`);
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration failed', { error: error.message });
      process.exit(1);
    });
}
