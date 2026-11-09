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
import logger from '../config/logger.js';
import { emailSchema, fullNameSchema, passwordSchema } from '../utils/validation.js';
import { issueAccountToken, consumeAccountToken } from '../services/accountTokens.js';
import { resolvePublicBaseUrl } from '../utils/publicUrl.js';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  mailConfigured,
} from '../services/mailer.js';

const router = Router();

const SESSION_COOKIE = 'cyberita_session';
const PUBLIC_USER_COLUMNS = `id, email, full_name, role, headline, bio, avatar_url, is_active, email_verified_at, last_login_at, created_at`;

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.isTest ? 10_000 : 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many authentication attempts, please try again later.', code: 'rate_limited' } },
});

// Password reset and verification emails are expensive and attract abuse:
// a much tighter budget than generic auth endpoints.
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.isTest ? 10_000 : 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many email requests, please try again in a few minutes.', code: 'rate_limited' } },
});

const MAX_FAILED_LOGINS = 5;
const LOCKOUT_MINUTES = 15;

const registerSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required.'),
  remember: z.boolean().optional().default(true),
});

const forgotPasswordSchema = z.object({ email: emailSchema });

const resetPasswordSchema = z.object({
  email: emailSchema,
  token: z.string().trim().min(20, 'Invalid reset token.').max(200),
  password: passwordSchema,
});

const verifyEmailSchema = z.object({
  email: emailSchema,
  token: z.string().trim().min(20, 'Invalid verification token.').max(200),
});

const resendVerificationSchema = z.object({ email: emailSchema.optional().nullable() });

/** Links are only echoed back outside production, and only when SMTP is not configured. */
function devLink(path, params, req) {
  if (env.isProduction || mailConfigured) return {};
  const query = new URLSearchParams(params).toString();
  return { devLink: `${resolvePublicBaseUrl(req)}${path}?${query}` };
}

function cookieOptions({ path, maxAge, remember = true }) {
  const options = {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.auth.cookieSecure,
    path,
  };
  if (remember && maxAge) options.maxAge = maxAge;
  return options;
}

function setRefreshCookie(res, token, remember = true) {
  res.cookie(
    REFRESH_COOKIE,
    token,
    cookieOptions({ path: '/api/auth', maxAge: 24 * 60 * 60 * 1000, remember })
  );
}

function setAccessCookie(res, token, remember = true) {
  res.cookie(
    'cyberita_at',
    token,
    cookieOptions({ path: '/', maxAge: 12 * 60 * 60 * 1000, remember })
  );
}

function setSessionCookie(res, remember = true) {
  res.cookie(SESSION_COOKIE, '1', {
    httpOnly: false,
    sameSite: 'lax',
    secure: env.auth.cookieSecure,
    path: '/',
    ...(remember ? { maxAge: 24 * 60 * 60 * 1000 } : {}),
  });
}

function clearSessionCookies(res) {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.clearCookie('cyberita_at', { path: '/' });
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

async function logActivity(userId, action) {
  try {
    await withTransaction((client) => recordActivity(client, { userId, action }));
  } catch (error) {
    // Never fail a successful login or registration because analytics logging failed.
    logger.warn('Activity log failed', { action, error: error.message });
  }
}

async function buildSession(user, req) {
  const accessToken = signAccessToken(user);
  const { token: refreshToken } = await issueRefreshToken(user, req.headers['user-agent']);
  return { user, accessToken, refreshToken };
}

/** Issues a fresh verification token and emails it. Never throws into the request path. */
async function deliverVerification(user, req) {
  try {
    const { token } = await issueAccountToken(user, 'email_verification');
    const baseUrl = resolvePublicBaseUrl(req);
    const result = await sendVerificationEmail({ user, token, baseUrl });
    return { ok: result.ok, ...devLink('/verify-email', { token, email: user.email }, req) };
  } catch (error) {
    logger.error('Could not send verification email', { userId: user.id, error: error.message });
    return { ok: false };
  }
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
    await logActivity(user.id, 'account.registered');
    const verification = await deliverVerification(user, req);
    // Do NOT issue a session here — the account must be verified before login.
    // We return a minimal payload so the client can redirect to /login with
    // the appropriate banner without leaking tokens for an unverified account.
    res.status(201).json({
      emailVerificationSent: verification.ok,
      ...verification.devLink ? { devVerificationLink: verification.devLink } : {},
    });
  })
);

router.post(
  '/login',
  authLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password, remember } = req.body;
    const { rows } = await query(`SELECT * FROM users WHERE LOWER(email) = LOWER($1)`, [email]);
    const user = rows[0];

    // Brute-force protection: lock the account briefly after repeated failures.
    if (user?.locked_until && new Date(user.locked_until) > new Date()) {
      throw unauthorized('Too many failed sign-in attempts. Please wait a few minutes and try again.');
    }

    const passwordOk = user ? await verifyPassword(password, user.password_hash) : false;

    if (!user || !passwordOk) {
      if (user?.is_active) {
        await logActivity(user.id, 'account.login_failed');
        const attempts = Number(user.failed_login_attempts || 0) + 1;
        const lockedUntil = attempts >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000) : null;
        await query('UPDATE users SET failed_login_attempts = $1, locked_until = $2 WHERE id = $3', [
          attempts,
          lockedUntil,
          user.id,
        ]);
        if (lockedUntil) {
          logger.warn('Account locked after repeated failed logins', { userId: user.id, attempts });
          throw unauthorized('Too many failed sign-in attempts. This account is locked for a few minutes.');
        }
      }
      throw unauthorized('Incorrect email or password.');
    }
    if (!user.is_active) throw unauthorized('This account has been disabled.');

    // Block login until the email address is verified.
    if (!user.email_verified_at) {
      // Silently re-send a fresh verification link so the user can unblock themselves.
      await deliverVerification(user, req);
      throw unauthorized(
        'Please verify your email address before signing in. We just sent you a new verification link — check your inbox (and spam folder).'
      );
    }

    await query('UPDATE users SET last_login_at = now(), failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [
      user.id,
    ]);
    const sensitiveKeys = ['password_hash', 'email_verify_token_hash', 'email_verify_expires_at', 'password_reset_token_hash', 'password_reset_expires_at', 'failed_login_attempts', 'locked_until'];
    const safeUser = Object.fromEntries(Object.entries(user).filter(([key]) => !sensitiveKeys.includes(key)));
    const session = await buildSession(safeUser, req);
    await logActivity(user.id, 'account.login');
    setRefreshCookie(res, session.refreshToken, remember);
    setAccessCookie(res, session.accessToken, remember);
    setSessionCookie(res, remember);
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
      setSessionCookie(res, true);
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

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required.'),
    newPassword: passwordSchema,
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    path: ['newPassword'],
    message: 'New password must be different from your current password.',
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

// ---------- email verification ----------

router.post(
  '/verify-email',
  emailLimiter,
  validateBody(verifyEmailSchema),
  asyncHandler(async (req, res) => {
    const { email, token } = req.body;
    const user = await consumeAccountToken({ email, token, kind: 'email_verification' });
    if (!user) throw badRequest('This verification link is invalid or has expired. Request a new one.');
    await query('UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1', [user.id]);
    await logActivity(user.id, 'account.email_verified');
    res.json({ ok: true });
  })
);

router.post(
  '/resend-verification',
  emailLimiter,
  validateBody(resendVerificationSchema),
  asyncHandler(async (req, res) => {
    const email = req.user?.email || req.body?.email;
    if (!email) throw badRequest('Enter the email address of the account.');
    const { rows } = await query(`SELECT id, email, full_name, email_verified_at FROM users WHERE LOWER(email) = LOWER($1)`, [
      email,
    ]);
    const user = rows[0];
    // Same response whether or not the account exists: never confirm an address.
    if (!user || user.email_verified_at) return res.json({ ok: true });
    const verification = await deliverVerification(user, req);
    res.json({ ok: true, emailSent: verification.ok, ...verification.devLink ? { devVerificationLink: verification.devLink } : {} });
  })
);

// ---------- password reset ----------

router.post(
  '/forgot-password',
  emailLimiter,
  validateBody(forgotPasswordSchema),
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    const { rows } = await query(`SELECT id, email, full_name, is_active FROM users WHERE LOWER(email) = LOWER($1)`, [email]);
    const user = rows[0];

    if (user?.is_active) {
      try {
        const { token } = await issueAccountToken(user, 'password_reset');
        const baseUrl = resolvePublicBaseUrl(req);
        const result = await sendPasswordResetEmail({ user, token, baseUrl });
        await logActivity(user.id, 'account.password_reset_requested');
        const resetDev = devLink('/reset-password', { token, email: user.email }, req);
        return res.json({
          ok: true,
          emailSent: result.ok,
          ...resetDev.devLink ? { devResetLink: resetDev.devLink } : {},
        });
      } catch (error) {
        logger.error('Could not send password reset email', { userId: user.id, error: error.message });
      }
    }
    // Always the same answer so the endpoint cannot be used to probe accounts.
    res.json({ ok: true });
  })
);

router.post(
  '/reset-password',
  emailLimiter,
  validateBody(resetPasswordSchema),
  asyncHandler(async (req, res) => {
    const { email, token, password } = req.body;
    const user = await consumeAccountToken({ email, token, kind: 'password_reset' });
    if (!user) throw badRequest('This reset link is invalid or has expired. Request a new one.');
    await query('UPDATE users SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL WHERE id = $2', [
      await hashPassword(password),
      user.id,
    ]);
    // A reset ends every existing session on every device.
    await query('UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [user.id]);
    await logActivity(user.id, 'account.password_reset');
    clearSessionCookies(res);
    res.json({ ok: true });
  })
);

export default router;
