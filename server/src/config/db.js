import pg from 'pg';
import env from './env.js';

const { Pool } = pg;

/** Builds a pool configuration from the environment (or an override, used by tests). */
export function buildPoolConfig(dbName = env.db.name) {
  return {
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: dbName,
    ssl: env.db.ssl ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };
}

export const pool = new Pool(buildPoolConfig());

export async function query(text, params) {
  return pool.query(text, params);
}

/** Runs a function inside a transaction with a dedicated client. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore rollback failure */
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function checkDbConnection() {
  const { rows } = await pool.query('SELECT NOW() AS now');
  return rows[0];
}

export default pool;
