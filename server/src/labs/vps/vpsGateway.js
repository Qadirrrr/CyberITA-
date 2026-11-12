import env from '../../config/env.js';

/**
 * ============================================================
 * VPS labs gateway client
 * ============================================================
 * Thin client for the VPS-Reselling internal labs gateway
 * (Stage 1 of the CyberITA+ x VPS integration). The gateway lives on the
 * VPS-Reselling backend and provisions real cloud servers for lab
 * sessions. Every call is authenticated with the shared secret in the
 * `x-internal-secret` header; the secret never leaves the server.
 */

const NOT_CONFIGURED = 'Real VPS labs are not configured on this server.';

export function isVpsGatewayConfigured() {
  return Boolean(env.labs.vpsGateway.url && env.labs.vpsGateway.secret);
}

async function gatewayFetch(path, { method = 'GET', body } = {}) {
  const { url, secret } = env.labs.vpsGateway;
  if (!url || !secret) throw new Error(NOT_CONFIGURED);
  let response;
  try {
    response = await fetch(`${url}${path}`, {
      method,
      headers: {
        'x-internal-secret': secret,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
  } catch (error) {
    throw new Error(`Lab gateway request failed: ${error.message}`);
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || `Lab gateway request failed (${response.status}).`);
  }
  return data;
}

/** Health of the gateway: { ok: true, service, timestamp }. */
export function getGatewayHealth() {
  return gatewayFetch('/internal/labs/health');
}

/**
 * Starts provisioning a real server for a CyberITA lab session.
 * Idempotent on the gateway side for a given cyberitaSessionId.
 * Returns { sessionId, status: 'provisioning', expiresAt, ... }.
 */
export function provisionLabSession({ cyberitaSessionId, studentId, studentName, studentEmail, labId, labSlug, profileKey, durationMinutes }) {
  return gatewayFetch('/internal/labs/provision', {
    method: 'POST',
    body: { cyberitaSessionId, studentId, studentName, studentEmail, labId, labSlug, profileKey, durationMinutes },
  });
}

/** Current state of a gateway lab session: { ok, session: {...} }. */
export function getLabSessionStatus(gatewaySessionId) {
  return gatewayFetch(`/internal/labs/sessions/${encodeURIComponent(gatewaySessionId)}/status`);
}

/** Destroys the server behind a gateway lab session. Idempotent. */
export function terminateLabSession(gatewaySessionId) {
  return gatewayFetch(`/internal/labs/sessions/${encodeURIComponent(gatewaySessionId)}`, { method: 'DELETE' });
}

/**
 * Mints a short-lived (120s) browser terminal ticket for a gateway lab
 * session. The ticket is a scoped JWT signed by the gateway; the student's
 * browser presents it to the gateway's /api/lab-terminal WebSocket and
 * never sees the shared secret or the session's SSH key.
 * Returns { ticket, expiresInSeconds, serverIp, sshUser }.
 */
export function createLabTerminalTicket(gatewaySessionId, studentId) {
  return gatewayFetch(`/internal/labs/sessions/${encodeURIComponent(gatewaySessionId)}/ticket`, {
    method: 'POST',
    body: { studentId },
  });
}

export default {
  isVpsGatewayConfigured,
  getGatewayHealth,
  provisionLabSession,
  getLabSessionStatus,
  terminateLabSession,
  createLabTerminalTicket,
};
