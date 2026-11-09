import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(configDir, '../..');
const repoRoot = path.resolve(serverDir, '..');
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(serverDir, '.env'), override: process.env.NODE_ENV !== 'test' });

const parseTtl = (value, fallback) => (value ? String(value) : fallback);
const parseBool = (value, fallback = false) => {
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};
const parsePositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isTest: process.env.NODE_ENV === 'test',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 4000),
  db: {
    url: process.env.DATABASE_URL || '',
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'CyberITA',
    ssl: String(process.env.DB_SSL || 'false').toLowerCase() === 'true',
  },
  auth: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
    accessTtl: parseTtl(process.env.ACCESS_TOKEN_TTL, '12h'),
    refreshTtl: parseTtl(process.env.REFRESH_TOKEN_TTL, '24h'),
    accessTtlSeconds: parseTtl(process.env.ACCESS_TOKEN_TTL, '12h'),
    cookieSecure: String(process.env.COOKIE_SECURE || 'false').toLowerCase() === 'true',
  },
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  labs: {
    provider: (process.env.LAB_PROVIDER || 'docker').toLowerCase(),
    sessionTtlMinutes: Number(process.env.LAB_SESSION_TTL_MINUTES || 120),
    cleanupIntervalMinutes: Number(process.env.LAB_CLEANUP_INTERVAL_MINUTES || 5),
    docker: {
      binary: process.env.LAB_DOCKER_BINARY || 'docker',
      host: process.env.LAB_DOCKER_HOST || '',
      image: process.env.LAB_DOCKER_IMAGE || 'ubuntu:22.04',
      networkEnabled: parseBool(process.env.LAB_DOCKER_NETWORK, true),
      pull: parseBool(process.env.LAB_DOCKER_PULL, true),
      memoryMb: parsePositiveNumber(process.env.LAB_DOCKER_MEMORY_MB, 1024),
      cpus: parsePositiveNumber(process.env.LAB_DOCKER_CPUS, 1),
      pidsLimit: parsePositiveNumber(process.env.LAB_DOCKER_PIDS_LIMIT, 256),
      commandTimeoutMs: parsePositiveNumber(process.env.LAB_DOCKER_TIMEOUT_MS, 180000),
      provisionTimeoutMs: parsePositiveNumber(process.env.LAB_DOCKER_PROVISION_TIMEOUT_MS, 180000),
      maxOutputBytes: parsePositiveNumber(process.env.LAB_DOCKER_MAX_OUTPUT_BYTES, 64 * 1024),
    },
  },
  upload: {
    maxMb: Number(process.env.MAX_UPLOAD_MB || 8),
    maxBytes: Number(process.env.MAX_UPLOAD_MB || 8) * 1024 * 1024,
  },
  mail: {
    // SMTP is optional: without it every email is stored in email_outbox and
    // printed to the server log, so local development never silently breaks.
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || process.env.SMTP_USER || 'CyberITA+ <no-reply@cyberita.plus>',
    appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, ''),
    verifyTtlMinutes: parsePositiveNumber(process.env.EMAIL_VERIFY_TTL_MINUTES, 24 * 60),
    resetTtlMinutes: parsePositiveNumber(process.env.PASSWORD_RESET_TTL_MINUTES, 60),
  },
};

export default env;
