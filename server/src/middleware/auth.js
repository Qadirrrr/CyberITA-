import { verifyAccessToken } from '../services/authService.js';
import { asyncHandler, forbidden, unauthorized } from '../utils/errors.js';
import { query } from '../config/db.js';

const REFRESH_COOKIE = 'cyberita_rt';

function extractToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies && req.cookies[REFRESH_COOKIE] && req.authAccessToken) return req.authAccessToken;
  if (req.cookies && req.cookies.cyberita_at) return req.cookies.cyberita_at;
  return null;
}

/**
 * Optional authentication — populates req.user when a valid token is present.
 * Tokens can arrive as a Bearer header or an httpOnly cookie (used by the browser,
 * including WebSocket upgrades).
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const payload = verifyAccessToken(token);
    const { rows } = await query(
      `SELECT id, email, full_name, role, headline, bio, avatar_url, is_active
       FROM users WHERE id = $1 AND is_active = TRUE`,
      [payload.sub]
    );
    if (rows[0]) req.user = rows[0];
  } catch {
    // Optional authentication: a stale or invalid access token must not
    // block public routes such as login, register or refresh.
  }
  next();
});

/** Requires a valid authenticated user. */
export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

/** Requires one of the listed roles. */
export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(forbidden(`This action requires one of the following roles: ${roles.join(', ')}.`));
    }
    next();
  };
}

export const isAdmin = (user) => user?.role === 'admin';
export const isStaff = (user) => user?.role === 'admin' || user?.role === 'instructor';
export { REFRESH_COOKIE };
