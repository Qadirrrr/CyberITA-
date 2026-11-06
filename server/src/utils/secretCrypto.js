import crypto from 'node:crypto';
import env from '../config/env.js';

// Master key for encrypting agent secrets at rest. Falls back to a derived key
// from JWT_ACCESS_SECRET so the feature works out of the box, but operators
// should set LAB_AGENT_MASTER_KEY (32 bytes hex or any strong passphrase) in
// production.
function masterKey() {
  const raw = process.env.LAB_AGENT_MASTER_KEY || env.auth.accessSecret || 'cyberita-lab-agent-dev-key';
  // Derive a stable 32-byte key.
  return crypto.scryptSync(raw, 'cyberita-lab-agent', 32);
}

export function encryptSecret(plaintext) {
  if (plaintext == null || plaintext === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptSecret(blob) {
  if (!blob) return null;
  const candidates = [
    process.env.LAB_AGENT_MASTER_KEY,
    env.auth.accessSecret,
    'cyberita-lab-agent-dev-key',
  ].filter(Boolean);

  let buf;
  try {
    buf = Buffer.from(String(blob), 'base64');
  } catch {
    return null;
  }
  if (buf.length < 28) return null;
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);

  for (const raw of candidates) {
    try {
      const key = crypto.scryptSync(raw, 'cyberita-lab-agent', 32);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(tag);
      const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
      return dec.toString('utf8');
    } catch {
      // try next candidate
    }
  }
  return null;
}

export function hashSecret(plaintext) {
  return crypto.createHash('sha256').update(String(plaintext || '')).digest('hex');
}

export function timingSafeEqualSecret(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
