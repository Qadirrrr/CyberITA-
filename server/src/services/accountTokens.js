import crypto from 'node:crypto';
import { query } from '../config/db.js';
import env from '../config/env.js';

/**
 * Single-use, hashed tokens for email verification and password reset.
 *
 * The raw token is only ever shown in the emailed link; the database stores a
 * SHA-256 hash plus an expiry, so a leaked database dump cannot be replayed.
 * Tokens are invalidated as soon as they are consumed.
 */

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const COLUMNS = {
  email_verification: { hash: 'email_verify_token_hash', expires: 'email_verify_expires_at' },
  password_reset: { hash: 'password_reset_token_hash', expires: 'password_reset_expires_at' },
};

function columnsFor(kind) {
  const columns = COLUMNS[kind];
  if (!columns) throw new Error(`Unknown token kind "${kind}".`);
  return columns;
}

export async function issueAccountToken(user, kind) {
  const { hash, expires } = columnsFor(kind);
  const ttlMinutes = kind === 'password_reset' ? env.mail.resetTtlMinutes : env.mail.verifyTtlMinutes;
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  await query(`UPDATE users SET ${hash} = $1, ${expires} = $2 WHERE id = $3`, [sha256(token), expiresAt, user.id]);
  return { token, expiresAt };
}

/** Returns the matching user (token cleared) or null when invalid/expired/unknown. */
export async function consumeAccountToken({ email, token, kind }) {
  const { hash, expires } = columnsFor(kind);
  if (!email || !token) return null;
  const { rows } = await query('SELECT * FROM users WHERE LOWER(email) = LOWER($1)', [String(email)]);
  const user = rows[0];
  if (!user || !user[hash] || !user[expires]) return null;
  if (new Date(user[expires]) < new Date()) return null;
  if (user[hash] !== sha256(token)) return null;
  await query(`UPDATE users SET ${hash} = NULL, ${expires} = NULL WHERE id = $1`, [user.id]);
  return user;
}

export default { issueAccountToken, consumeAccountToken };
