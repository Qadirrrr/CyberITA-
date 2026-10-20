import 'dotenv/config';

const parseTtl = (value, fallback) => (value ? String(value) : fallback);

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isTest: process.env.NODE_ENV === 'test',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 4000),
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'cyberita',
    ssl: String(process.env.DB_SSL || 'false').toLowerCase() === 'true',
    testDbName: process.env.TEST_DB_NAME || 'cyberita_test',
  },
  auth: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-me',
    accessTtl: parseTtl(process.env.ACCESS_TOKEN_TTL, '12h'),
    refreshTtl: parseTtl(process.env.REFRESH_TOKEN_TTL, '7d'),
    accessTtlSeconds: parseTtl(process.env.ACCESS_TOKEN_TTL, '12h'),
    cookieSecure: String(process.env.COOKIE_SECURE || 'false').toLowerCase() === 'true',
  },
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  labs: {
    provider: (process.env.LAB_PROVIDER || 'mock').toLowerCase(),
    sessionTtlMinutes: Number(process.env.LAB_SESSION_TTL_MINUTES || 120),
  },
  upload: {
    maxMb: Number(process.env.MAX_UPLOAD_MB || 8),
    maxBytes: Number(process.env.MAX_UPLOAD_MB || 8) * 1024 * 1024,
  },
  seed: {
    password: process.env.SEED_PASSWORD || 'Passw0rd!',
  },
};

export default env;
