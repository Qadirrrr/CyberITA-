import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { query, withTransaction } from '../config/db.js';
import env from '../config/env.js';
import { asyncHandler, badRequest, conflict, unauthorized } from '../utils/errors.js';
import { validateBody } from '../middleware/validate.js';
import { authenticate, requireAuth, REFRESH_COOKIE } from '../middleware/auth.js';
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from '../services/authService.js';
import { recordActivity } from '../utils/activity.js';

const router = Router();

const PUBLIC_USER_COLUMNS = `id, email, full_name, role, headline, bio, avatar_url, is_active, last_login_at, created_at`;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.isTest ? 10_000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many authentication attempts, please try again later.', code: 'rate_limited' } },
});

const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Name must be at least 2 characters.').max(120),
  email: z.string().trim().email('Enter a valid email address.').max(255),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(72, 'Password must be at most 72 characters.')
    .regex(/[A-Za-z]/, 'Password must contain a letter.')
    .regex(/[0-9]/, 'Password must contain a number.'),
});

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.auth.cookieSecure,
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

function setAccessCookie(res, token) {
  res.cookie('cyberita_at', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.auth.cookieSecure,
    path: '/',
    maxAge: 12 * 60 * 60 * 1000,
  });
}

function clearSessionCookies(res) {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.clearCookie('cyberita_at', { path: '/' });
}

async function buildSession(user, req) {
  const accessToken = signAccessToken(user);
  const { token: refreshToken } = await issueRefreshToken(user, req.headers['user-agent']);
  return { user, accessToken, refreshToken };
}

router.post(
  '/register',
  authLimiter,
  validateBody(registerSchema),
  asyncHandler(async (req, res) => {
    const { fullName, email, password } = req.body;
    const existing = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length > 0) throw conflict('An account with this email already exists.');

    const passwordHash = await hashPassword(password);
    const { rows } = await query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, 'student') RETURNING ${PUBLIC_USER_COLUMNS}`,
      [email.toLowerCase(), passwordHash, fullName]
    );
    const user = rows[0];
    const session = await buildSession(user, req);
    await withTransaction((client) => recordActivity(client, { userId: user.id, action: 'account.registered' }));
    setRefreshCookie(res, session.refreshToken);
    setAccessCookie(res, session.accessToken);
    res.status(201).json({ user: session.user, accessToken: session.accessToken });
  })
);

router.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const { rows } = await query(`SELECT * FROM users WHERE LOWER(email) = LOWER($1)`, [email]);
    const user = rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      throw unauthorized('Incorrect email or password.');
    }
    if (!user.is_active) throw unauthorized('This account has been disabled.');

    await query('UPDATE users SET last_login_at = now() WHERE id = $1', [user.id]);
    const safeUser = Object.fromEntries(
      Object.entries(user).filter(([key]) => !['password_hash'].includes(key))
    );
    const session = await buildSession(safeUser, req);
    await withTransaction((client) => recordActivity(client, { userId: user.id, action: 'account.login' }));
    setRefreshCookie(res, session.refreshToken);
    setAccessCookie(res, session.accessToken);
    res.json({ user: safeUser, accessToken: session.accessToken });
  })
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) {
      clearSessionCookies(res);
      throw unauthorized('No session found.');
    }
    try {
      const { user, refreshToken } = await rotateRefreshToken(token);
      setRefreshCookie(res, refreshToken);
      const accessToken = signAccessToken(user);
      setAccessCookie(res, accessToken);
      res.json({ user, accessToken });
    } catch (error) {
      // Drop stale cookies so they cannot break later login/register calls.
      clearSessionCookies(res);
      throw error;
    }
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await revokeRefreshToken(req.cookies?.[REFRESH_COOKIE]);
    clearSessionCookies(res);
    res.json({ ok: true });
  })
);

router.get(
  '/me',
  authenticate,
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = $1`, [req.user.id]);
    res.json({ user: rows[0] });
  })
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required.'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .regex(/[A-Za-z]/, 'Password must contain a letter.')
    .regex(/[0-9]/, 'Password must contain a number.'),
});

router.put(
  '/change-password',
  authenticate,
  requireAuth,
  validateBody(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    if (!(await verifyPassword(currentPassword, rows[0].password_hash))) {
      throw badRequest('Your current password is incorrect.');
    }
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [await hashPassword(newPassword), req.user.id]);
    await query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [req.user.id]);
    clearSessionCookies(res);
    res.json({ ok: true });
  })
);

export default router;
