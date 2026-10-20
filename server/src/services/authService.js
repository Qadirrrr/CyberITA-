import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import env from '../config/env.js';
import { unauthorized } from '../utils/errors.js';

const SALT_ROUNDS = 10;

export async function hashPassword(plain) {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

export function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user.id), role: user.role, email: user.email, name: user.full_name },
    env.auth.accessSecret,
    { expiresIn: env.auth.accessTtl }
  );
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.auth.accessSecret);
  } catch {
    throw unauthorized('Invalid or expired access token.');
  }
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

/**
 * Refresh tokens are opaque random strings, stored hashed.
 * The cookie format is "<tokenId>.<secret>"; we look up by id and compare hashes.
 */
export async function issueRefreshToken(user, userAgent) {
  const secret = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const { rows } = await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [user.id, sha256(secret), expiresAt, (userAgent || '').slice(0, 300)]
  );
  return { token: `${rows[0].id}.${secret}`, expiresAt };
}

export async function rotateRefreshToken(cookieValue) {
  if (!cookieValue || !cookieValue.includes('.')) throw unauthorized('Invalid refresh token.');
  const [id, secret] = cookieValue.split('.');
  const { rows } = await query(
    `SELECT * FROM refresh_tokens WHERE id = $1 AND revoked_at IS NULL AND expires_at > now()`,
    [id]
  );
  const record = rows[0];
  if (!record || record.token_hash !== sha256(secret)) {
    throw unauthorized('Invalid or expired refresh token.');
  }
  await query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [record.id]);
  const { rows: userRows } = await query(
    `SELECT id, email, full_name, role, headline, bio, avatar_url, is_active, created_at
     FROM users WHERE id = $1 AND is_active = TRUE`,
    [record.user_id]
  );
  if (!userRows[0]) throw unauthorized('Account is disabled.');
  const user = userRows[0];
  const refresh = await issueRefreshToken(user, record.user_agent);
  return { user, refreshToken: refresh.token };
}

export async function revokeRefreshToken(cookieValue) {
  if (!cookieValue || !cookieValue.includes('.')) return;
  const [id] = cookieValue.split('.');
  await query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL', [id]);
}

/** Best effort cleanup of expired refresh tokens. */
export async function purgeExpiredTokens() {
  await query('DELETE FROM refresh_tokens WHERE expires_at < now() - INTERVAL \'7 days\'');
}
