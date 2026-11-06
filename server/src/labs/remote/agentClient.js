import { decryptSecret } from '../../utils/secretCrypto.js';

const DEFAULT_TIMEOUT = 30_000;

function baseUrl(server) {
  let url = String(server?.agent_url || '').trim().replace(/\/+$/, '');
  if (url && !/:\d+$/.test(url)) {
    url = `${url}:9100`;
  }
  return url;
}

function secret(server) {
  return decryptSecret(server?.agent_secret_encrypted) || server?.agent_secret || process.env.LAB_AGENT_SECRET || '';
}

async function request(server, method, path, body, timeoutMs = DEFAULT_TIMEOUT) {
  const url = `${baseUrl(server)}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret(server)}`,
        'X-CyberITA-Agent': 'main',
      },
      body: body == null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
    return { ok: res.ok, status: res.status, data, error: res.ok ? null : (data?.error || data?.message || `HTTP ${res.status}`) };
  } catch (error) {
    return { ok: false, status: 0, data: null, error: error.name === 'AbortError' ? 'Agent request timed out.' : error.message };
  } finally {
    clearTimeout(timer);
  }
}

export const agentClient = {
  health: (server, timeoutMs) => request(server, 'GET', '/health', null, timeoutMs || 8000),
  metrics: (server, timeoutMs) => request(server, 'GET', '/metrics', null, timeoutMs || 15000),
  createContainer: (server, payload, timeoutMs) => request(server, 'POST', '/containers', payload, timeoutMs || 180000),
  exec: (server, instanceId, payload, timeoutMs) => request(server, 'POST', `/containers/${encodeURIComponent(instanceId)}/exec`, payload, timeoutMs || 180000),
  stop: (server, instanceId, body, timeoutMs) => request(server, 'POST', `/containers/${encodeURIComponent(instanceId)}/stop`, body || null, timeoutMs || 30000),
  restart: (server, instanceId, body, timeoutMs) => request(server, 'POST', `/containers/${encodeURIComponent(instanceId)}/restart`, body || null, timeoutMs || 60000),
  remove: (server, instanceId, body, timeoutMs) => request(server, 'DELETE', `/containers/${encodeURIComponent(instanceId)}`, body || null, timeoutMs || 30000),
  inspect: (server, instanceId, timeoutMs) => request(server, 'GET', `/containers/${encodeURIComponent(instanceId)}`, null, timeoutMs || 15000),
  listContainers: (server, timeoutMs) => request(server, 'GET', '/containers', null, timeoutMs || 15000),
  cleanup: (server, payload, timeoutMs) => request(server, 'POST', '/cleanup', payload || {}, timeoutMs || 60000),
};

export default agentClient;
