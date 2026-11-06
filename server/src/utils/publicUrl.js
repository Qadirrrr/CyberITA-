import env from '../config/env.js';

/**
 * Builds the base URL used in emails (verification, password reset).
 *
 * Why not just use APP_URL? Because it is easy to misconfigure on a server:
 * a stale value (wrong port, old IP, `localhost`) makes every emailed link
 * point at an address the learner cannot open, even though the site itself
 * works. The request that triggers the email already tells us the origin the
 * learner is actually using, so we prefer it and keep APP_URL as the fallback
 * for background jobs that have no request.
 */

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '[::1]']);

function parseUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function isLoopback(url) {
  return Boolean(url && LOOPBACK_HOSTS.has(url.hostname.toLowerCase()));
}

/** Origin (scheme + host + port) the browser used to reach the API. */
export function requestOrigin(req) {
  if (!req) return null;

  // The browser sends `Origin` on POST requests (register, resend, forgot
  // password). It is exactly the URL the learner sees, even when a reverse
  // proxy rewrites the Host header, so prefer it when it is a real origin.
  const originHeader = String(req.headers.origin || '').trim();
  if (originHeader && originHeader !== 'null') {
    const originUrl = parseUrl(originHeader);
    if (originUrl) return originUrl.origin;
  }

  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || String(req.headers.host || '').trim();
  if (!host) return null;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwardedProto || req.protocol || 'http';
  const url = parseUrl(`${proto}://${host}`);
  return url ? url.origin : null;
}

/**
 * Best base URL for links: the request origin when it is a public origin the
 * learner can reach, otherwise the configured APP_URL.
 */
export function resolvePublicBaseUrl(req) {
  const configured = parseUrl(env.mail.appUrl);
  const fromRequest = parseUrl(requestOrigin(req));

  if (fromRequest) {
    const requestIsLoopback = isLoopback(fromRequest);
    const configuredIsLoopback = isLoopback(configured);
    // Prefer the origin that actually served the request. It is the URL that
    // worked in the learner's browser, and it fixes stale APP_URL values
    // (wrong port, old IP, blocked port behind a proxy).
    if (!requestIsLoopback || configuredIsLoopback || !configured) {
      return fromRequest.origin.replace(/\/+$/, '');
    }
  }

  if (configured) return configured.origin.replace(/\/+$/, '');
  return 'http://localhost:5173';
}

export default resolvePublicBaseUrl;
