import { LabProvider } from '../provider.js';
import logger from '../../config/logger.js';
import { isVpsGatewayConfigured, getGatewayHealth, terminateLabSession } from './vpsGateway.js';

/**
 * Real VPS lab provider.
 *
 * Unlike Docker, a VPS cannot be provisioned synchronously inside
 * `startSession`: a cloud server takes minutes to boot. VPS sessions are
 * therefore created by labService's async flow (the session row exists in
 * 'provisioning' state first, and the gateway is polled in the background
 * until the server is active). This provider only owns availability,
 * teardown and the (next stage) terminal contract, so the rest of the
 * platform can treat a vps session like any other provider session.
 */
export class VpsLabProvider extends LabProvider {
  static providerName = 'vps';

  async isAvailable() {
    if (!isVpsGatewayConfigured()) {
      return { ok: false, reason: 'Real VPS labs are not configured on this server.' };
    }
    try {
      const health = await getGatewayHealth();
      return { ok: Boolean(health?.ok), reason: health?.ok ? null : 'Lab gateway is not healthy.' };
    } catch (error) {
      return { ok: false, reason: error.message };
    }
  }

  async provision() {
    throw new Error('VPS lab sessions are started through labService (async provisioning), not provider.provision().');
  }

  /** Destroys the cloud server behind the session. Idempotent. */
  async deprovision(session) {
    if (!session?.instance_id) return;
    try {
      await terminateLabSession(session.instance_id);
    } catch (error) {
      // Teardown must never fail the caller: the gateway also sweeps
      // expired lab servers on its own side.
      logger.warn('VPS lab gateway terminate failed', {
        sessionId: session.id,
        instanceId: session.instance_id,
        error: error.message,
      });
    }
  }

  createTerminal() {
    throw new Error('The VPS terminal opens in the next stage.');
  }
}

export default VpsLabProvider;
