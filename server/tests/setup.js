/**
 * Test bootstrap: every test file runs against a freshly migrated
 * dedicated PostgreSQL database (TEST_DB_NAME, default cyberita_test).
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.TEST_DB_NAME || 'cyberita_test';
process.env.LAB_PROVIDER = 'mock';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';

const { resetDatabase, runMigrations } = await import('../src/db/migrate.js');

await resetDatabase(process.env.DB_NAME);
await runMigrations({ dbName: process.env.DB_NAME, silent: true });

// Register the in-process lab simulator for automated tests. Production code
// only ever ships the Docker provider; this keeps lab tests hermetic.
const { registerProvider } = await import('../src/labs/providers/index.js');
const { MockLabProvider } = await import('./support/lab-mock/mockProvider.js');
registerProvider(MockLabProvider);
