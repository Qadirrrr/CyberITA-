import { Router } from 'express';
import { asyncHandler, badRequest } from '../utils/errors.js';
import { recordAgentHeartbeat, registerAgent, getLabServerByAgentUrl } from '../services/labServers.js';
import { decryptSecret, timingSafeEqualSecret } from '../utils/secretCrypto.js';
import logger from '../config/logger.js';

const router = Router();

// Agent self-registration (idempotent). Agent must already be created by admin.
router.post(
  '/register',
  asyncHandler(async (req, res) => {
    const { agent_url, agent_name, capacity, version } = req.body || {};
    const secret = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!agent_url || !secret) throw badRequest('agent_url and Authorization bearer secret are required.');
    const server = await getLabServerByAgentUrl(agent_url);
    if (!server) throw badRequest('Lab server not registered by admin. Create it first.');
    const stored = decryptSecret(server.agent_secret_encrypted);
    if (!stored || !timingSafeEqualSecret(stored, secret)) {
      logger.warn('Agent registration rejected: bad secret', { agent_url });
      throw badRequest('Invalid agent secret.');
    }
    const updated = await registerAgent({ agentUrl: agent_url, agentName: agent_name, agentSecret: secret, capacity, version });
    res.json({ ok: true, server: updated });
  })
);

router.post(
  '/heartbeat',
  asyncHandler(async (req, res) => {
    const { agent_url, agent_secret, ...metrics } = req.body || {};
    const secret = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || agent_secret;
    if (!agent_url || !secret) throw badRequest('agent_url and secret are required.');
    const server = await getLabServerByAgentUrl(agent_url);
    if (!server) {
      logger.warn('Agent heartbeat rejected: unknown agent_url', { agent_url });
      throw badRequest('Lab server not registered by admin.');
    }
    const stored = decryptSecret(server.agent_secret_encrypted);
    if (!stored || !timingSafeEqualSecret(stored, secret)) {
      logger.warn('Agent heartbeat rejected: bad secret', { agent_url });
      throw badRequest('Invalid agent secret.');
    }
    const updated = await recordAgentHeartbeat({ agentUrl: agent_url, agentSecret: secret, ...metrics });
    res.json({ ok: true, server: updated });
  })
);

export default router;
