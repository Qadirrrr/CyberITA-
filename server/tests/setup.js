/**
 * Test bootstrap: every test file runs against a freshly migrated
 * dedicated PostgreSQL database (TEST_DB_NAME, default cyberita_test).
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'cyberita_test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';

const { resetDatabase, runMigrations } = await import('../src/db/migrate.js');

await resetDatabase(process.env.DB_NAME);
await runMigrations({ dbName: process.env.DB_NAME, silent: true });
