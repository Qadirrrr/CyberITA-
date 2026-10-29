import { describe, it, expect } from 'vitest';
import { api, createUser, loginAs, PASSWORD } from './helpers.js';
import { query } from '../src/config/db.js';

async function latestOutbox(kind, email) {
  const { rows } = await query(
    'SELECT * FROM email_outbox WHERE kind = $1 AND recipient = $2 ORDER BY id DESC LIMIT 1',
    [kind, String(email).toLowerCase()]
  );
  return rows[0] || null;
}

function tokenFromDevLink(link, key = 'token') {
  return new URL(link).searchParams.get(key);
}

describe('Email verification', () => {
  it('emails a verification link on register and verifies the account with it', async () => {
    const email = `verify.${Date.now()}@test.cyberita.plus`;
    const res = await api()
      .post('/api/auth/register')
      .send({ fullName: 'Vera Verified', email, password: 'Str0ngPass!' })
      .expect(201);

    expect(res.body.user.email_verified_at).toBeNull();
    // Development has no SMTP: the link is echoed back so the flow stays usable.
    expect(res.body.devVerificationLink).toContain('/verify-email?token=');

    const outbox = await latestOutbox('email_verification', email);
    expect(outbox).toBeTruthy();
    expect(outbox.status).toBe('logged');

    const token = tokenFromDevLink(res.body.devVerificationLink);
    await api().post('/api/auth/verify-email').send({ email, token }).expect(200);

    const { rows } = await query('SELECT email_verified_at FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    expect(rows[0].email_verified_at).toBeTruthy();

    // Tokens are single use.
    await api().post('/api/auth/verify-email').send({ email, token }).expect(400);
  });

  it('resends verification without confirming whether an account exists', async () => {
    const unknown = await api()
      .post('/api/auth/resend-verification')
      .send({ email: 'nobody.here@test.cyberita.plus' })
      .expect(200);
    expect(unknown.body.ok).toBe(true);
    expect(await latestOutbox('email_verification', 'nobody.here@test.cyberita.plus')).toBeNull();

    const user = await createUser({ fullName: 'Repeat Visitor' });
    const before = await latestOutbox('email_verification', user.email);
    expect(before).toBeNull();

    const res = await api().post('/api/auth/resend-verification').send({ email: user.email }).expect(200);
    expect(res.body.emailSent).toBe(true);
    expect(await latestOutbox('email_verification', user.email)).toBeTruthy();
  });
});

describe('Password reset', () => {
  it('resets the password with the emailed token, revokes sessions and blocks reuse', async () => {
    const user = await createUser({ fullName: 'Reset Me' });

    const res = await api().post('/api/auth/forgot-password').send({ email: user.email }).expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.devResetLink).toContain('/reset-password?token=');

    const outbox = await latestOutbox('password_reset', user.email);
    expect(outbox).toBeTruthy();
    expect(outbox.body).toContain('/reset-password?token=');

    const token = tokenFromDevLink(res.body.devResetLink);
    const newPassword = 'N3wPassw0rd!';
    await api()
      .post('/api/auth/reset-password')
      .send({ email: user.email, token, password: newPassword })
      .expect(200);

    // Old password no longer works, new one does.
    const oldLogin = await api().post('/api/auth/login').send({ email: user.email, password: user.password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await api().post('/api/auth/login').send({ email: user.email, password: newPassword });
    expect(newLogin.status).toBe(200);

    // The token cannot be replayed.
    const replay = await api()
      .post('/api/auth/reset-password')
      .send({ email: user.email, token, password: 'AnotherPass1!' })
      .expect(400);
    expect(replay.body.error.message).toMatch(/invalid or has expired/i);
  });

  it('answers the same way for unknown addresses and rejects bad tokens', async () => {
    const res = await api()
      .post('/api/auth/forgot-password')
      .send({ email: 'ghost.user@test.cyberita.plus' })
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.devResetLink).toBeUndefined();
    expect(await latestOutbox('password_reset', 'ghost.user@test.cyberita.plus')).toBeNull();

    const user = await createUser({ fullName: 'Token Guard' });
    await api()
      .post('/api/auth/reset-password')
      .send({ email: user.email, token: 'a'.repeat(64), password: 'Whatever123' })
      .expect(400);
  });
});

describe('Login hardening', () => {
  it('locks the account after repeated failed attempts and releases it after the window', async () => {
    const user = await createUser({ fullName: 'Locked User' });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await api().post('/api/auth/login').send({ email: user.email, password: 'WrongPass123' });
      expect(res.status).toBe(401);
    }

    // Even the correct password is refused while the lock is active.
    const locked = await api().post('/api/auth/login').send({ email: user.email, password: user.password });
    expect(locked.status).toBe(401);
    expect(locked.body.error.message).toMatch(/locked|wait/i);

    // Clear the lock window (15 minutes ahead) and sign in normally.
    await query('UPDATE users SET locked_until = now() - INTERVAL \'1 minute\' WHERE id = $1', [user.id]);
    const session = await loginAs(user);
    expect(session.token).toBeTruthy();

    // Successful login resets the failure counter.
    const { rows } = await query('SELECT failed_login_attempts, locked_until FROM users WHERE id = $1', [user.id]);
    expect(rows[0].failed_login_attempts).toBe(0);
    expect(rows[0].locked_until).toBeNull();
  });

  it('never reveals whether an email exists on failed logins', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'missing.user@test.cyberita.plus', password: 'Whatever123' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('Incorrect email or password.');
  });
});
