import http from 'node:http';
import env from './config/env.js';
import logger from './config/logger.js';
import { createApp } from './app.js';
import { initWebSocket } from './websocket/index.js';
import { checkDbConnection } from './config/db.js';
import { purgeExpiredTokens } from './services/authService.js';

async function main() {
  const app = createApp();
  const server = http.createServer(app);
  initWebSocket(server);

  try {
    await checkDbConnection();
    logger.info('PostgreSQL connection established.');
  } catch (error) {
    logger.error('Cannot reach PostgreSQL', { error: error.message, db: `${env.db.host}:${env.db.port}/${env.db.name}` });
    process.exit(1);
  }

  await purgeExpiredTokens().catch(() => {});
  const tokenPurge = setInterval(() => purgeExpiredTokens().catch(() => {}), 60 * 60 * 1000);
  tokenPurge.unref();

  server.listen(env.port, () => {
    logger.info(`CyberITA+ API listening on http://localhost:${env.port}`, {
      env: env.nodeEnv,
      labProvider: env.labs.provider,
    });
  });

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
