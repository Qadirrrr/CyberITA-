import http from 'node:http';
import env from './config/env.js';
import logger from './config/logger.js';
import { createApp } from './app.js';
import { initWebSocket } from './websocket/index.js';
import { checkDbConnection } from './config/db.js';
import { runMigrations } from './db/migrate.js';
import { purgeExpiredTokens } from './services/authService.js';
import { cleanupExpiredLabSessions } from './services/labService.js';
import { getProvider } from './labs/providers/index.js';

async function main() {
  const app = createApp();
  const server = http.createServer(app);
  initWebSocket(server);

  try {
    await checkDbConnection();
    logger.info('PostgreSQL connection established.');

    // Automatically apply any pending migrations on startup
    await runMigrations({ silent: false }).catch((err) => {
      logger.warn('Auto-migration note:', { error: err.message });
    });
  } catch (error) {
    logger.error('Cannot reach PostgreSQL', { error: error.message, db: `${env.db.host}:${env.db.port}/${env.db.name}` });
    process.exit(1);
  }

  await purgeExpiredTokens().catch(() => {});
  const tokenPurge = setInterval(() => purgeExpiredTokens().catch(() => {}), 60 * 60 * 1000);
  tokenPurge.unref();

  const runLabCleanup = () =>
    cleanupExpiredLabSessions().catch((error) => logger.warn('Lab cleanup failed', { error: error.message }));
  runLabCleanup();
  const labCleanup = setInterval(runLabCleanup, Math.max(1, env.labs.cleanupIntervalMinutes) * 60 * 1000);
  labCleanup.unref();

  server.listen(env.port, () => {
    logger.info(`CyberITA+ API listening on http://localhost:${env.port}`, {
      env: env.nodeEnv,
      labProvider: env.labs.provider,
    });
  });

  // Non-blocking preflight: tell operators immediately when the lab runtime is
  // unreachable (missing Docker CLI, daemon down, ...) instead of letting
  // students hit a 503 later.
  void (async () => {
    try {
      const provider = getProvider();
      const availability = await provider.isAvailable();
      if (availability.ok) {
        logger.info(`Lab provider "${provider.name}" ready`, {
          detail: availability.reason,
          binary: availability.binary || null,
        });
      } else {
        logger.warn(`Lab provider "${provider.name}" unavailable`, {
          reason: availability.reason,
          binary: availability.binary || null,
          binarySource: availability.binarySource || null,
        });
      }
    } catch (error) {
      logger.warn('Lab provider preflight failed', { error: error.message });
    }
  })();

  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  logger.error('Fatal startup error', { error: error.message, stack: error.stack });
  process.exit(1);
});
