import crypto from 'node:crypto';

/** URL friendly slug from arbitrary text. */
export function slugify(text, fallback = 'item') {
  const slug = String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
  return slug || fallback;
}

export function randomId(prefix = '') {
  const raw = crypto.randomBytes(8).toString('hex');
  return prefix ? `${prefix}-${raw}` : raw;
}

export function certificateSerial() {
  const part = crypto.randomBytes(6).toString('hex').toUpperCase();
  return `CYB-${new Date().getFullYear()}-${part}`;
}

/** Case/whitespace insensitive command comparison for lab step verification. */
export function normalizeCommand(command) {
  return String(command || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/;+$/, '');
}

export function matchesPattern(pattern, text) {
  if (!pattern) return false;
  try {
    return new RegExp(pattern, 'i').test(String(text || ''));
  } catch {
    return String(text || '').toLowerCase().includes(String(pattern).toLowerCase());
  }
}

export function clampNumber(value, min, max, fallback = 0) {
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function percentComplete(completed, total) {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.round((completed / total) * 10000) / 100);
}
