import nodemailer from 'nodemailer';
import { query } from '../config/db.js';
import env from '../config/env.js';
import logger from '../config/logger.js';

/**
 * Outbound email service.
 *
 * SMTP is optional. When SMTP_HOST/SMTP_USER/SMTP_PASS are set the mail is
 * delivered for real; otherwise it is stored in the `email_outbox` table and
 * printed to the server log (development), so the auth flows never break on a
 * machine without mail credentials. Every message is recorded in email_outbox
 * either way, which also gives admins an audit trail.
 */

export const mailConfigured = Boolean(env.mail.host && env.mail.user);

let transporter = null;

function getTransporter() {
  if (!mailConfigured) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.mail.host,
      port: env.mail.port,
      secure: env.mail.port === 465 || String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
      auth: { user: env.mail.user, pass: env.mail.pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
    });
  }
  return transporter;
}

/** Verifies the SMTP connection (used by the admin system page / smoke checks). */
export async function verifyMailTransport() {
  const transport = getTransporter();
  if (!transport) return { ok: false, configured: false, reason: 'SMTP is not configured (emails are logged only).' };
  try {
    await transport.verify();
    return { ok: true, configured: true, reason: `SMTP ready: ${env.mail.host}:${env.mail.port}` };
  } catch (error) {
    return { ok: false, configured: true, reason: error.message };
  }
}

export async function sendMail({ to, subject, text, html, kind = 'generic' }) {
  const recipient = String(to || '').trim().toLowerCase();
  const body = String(text || '');
  const { rows } = await query(
    `INSERT INTO email_outbox (recipient, subject, body, kind, status)
     VALUES ($1, $2, $3, $4, 'pending') RETURNING id`,
    [recipient, subject, body, kind]
  );
  const outboxId = rows[0].id;

  try {
    const transport = getTransporter();
    if (transport) {
      await transport.sendMail({ from: env.mail.from, to: recipient, subject, text: body, html });
      await query('UPDATE email_outbox SET status = $1, sent_at = now() WHERE id = $2', ['sent', outboxId]);
      return { ok: true, delivered: true, outboxId };
    }
    await query('UPDATE email_outbox SET status = $1, sent_at = now() WHERE id = $2', ['logged', outboxId]);
    logger.info(`[dev email] ${subject}`, { to: recipient, kind, body });
    return { ok: true, delivered: false, outboxId };
  } catch (error) {
    await query('UPDATE email_outbox SET status = $1, error = $2 WHERE id = $3', ['failed', error.message, outboxId]).catch(
      () => {}
    );
    logger.error('Email delivery failed', { to: recipient, kind, error: error.message });
    return { ok: false, delivered: false, outboxId, error: error.message };
  }
}

function layout(title, paragraphs, action) {
  const actionHtml = action
    ? `<p style="margin:24px 0"><a href="${action.href}" style="background:#22d3ee;color:#0b1220;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700">${action.label}</a></p>
       <p style="font-size:12px;color:#64748b;word-break:break-all">Or paste this link into your browser:<br>${action.href}</p>`
    : '';
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#0b1220;font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:560px;margin:0 auto;background:#111a2e;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:28px">
      <h2 style="margin:0 0 16px;color:#e2e8f0">${title}</h2>
      ${paragraphs.map((p) => `<p style="margin:0 0 12px;color:#94a3b8;line-height:1.6">${p}</p>`).join('')}
      ${actionHtml}
      <p style="margin-top:28px;font-size:12px;color:#64748b">If you did not request this, you can safely ignore this email.</p>
    </div>
  </body></html>`;
}

export async function sendVerificationEmail({ user, token, baseUrl }) {
  const base = String(baseUrl || env.mail.appUrl || '').replace(/\/+$/, '');
  const link = `${base}/verify-email?token=${encodeURIComponent(token)}&email=${encodeURIComponent(user.email)}`;
  const name = user.full_name || 'there';
  return sendMail({
    to: user.email,
    kind: 'email_verification',
    subject: 'Verify your CyberITA+ email',
    text: [
      `Hi ${name},`,
      '',
      'Confirm your email address to activate your CyberITA+ account.',
      `Open this link to verify: ${link}`,
      '',
      'The link expires in ' + Math.round(env.mail.verifyTtlMinutes / 60) + ' hour(s).',
    ].join('\n'),
    html: layout(
      'Verify your email',
      [`Hi ${name},`, 'Confirm your email address to activate your CyberITA+ account.'],
      { href: link, label: 'Verify my email' }
    ),
  });
}

export async function sendPasswordResetEmail({ user, token, baseUrl }) {
  const base = String(baseUrl || env.mail.appUrl || '').replace(/\/+$/, '');
  const link = `${base}/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(user.email)}`;
  const name = user.full_name || 'there';
  return sendMail({
    to: user.email,
    kind: 'password_reset',
    subject: 'Reset your CyberITA+ password',
    text: [
      `Hi ${name},`,
      '',
      'Someone asked to reset the password for your CyberITA+ account.',
      `Open this link to choose a new password: ${link}`,
      '',
      'The link expires in ' + Math.round(env.mail.resetTtlMinutes) + ' minute(s).',
      'If this was not you, ignore this email. Your password stays unchanged.',
    ].join('\n'),
    html: layout(
      'Reset your password',
      [`Hi ${name},`, 'Someone asked to reset the password for your CyberITA+ account. The link below expires soon.'],
      { href: link, label: 'Choose a new password' }
    ),
  });
}

export default sendMail;
