/**
 * ============================================================
 * Lab provider contract
 * ============================================================
 * Every provider (mock, and later NOVA VPS / AWS / DigitalOcean /
 * Vultr) implements this interface so the rest of CyberITA+ never
 * needs to know where a lab actually runs.
 *
 *   const session = await provider.provision({ lab, user })
 *   const terminal = provider.createTerminal(session)   // duplex command executor
 *   await provider.deprovision(session)
 *
 * Providers are registered in ./index.js and selected through the
 * LAB_PROVIDER environment variable — switching to a real cloud
 * provider later requires no changes outside the provider module.
 */
export class LabProvider {
  static providerName = 'base';

  constructor(config = {}) {
    this.config = config;
  }

  /** Human readable name shown in the UI. */
  get name() {
    return this.constructor.providerName;
  }

  /** Returns {ok, reason} — used by /api/labs/status. */
  async isAvailable() {
    return { ok: false, reason: 'Base provider is abstract.' };
  }

  /** Creates (or allocates) an instance. Returns a serializable descriptor:
   *  { instanceId, provider, status, cwd, fsState, welcome } */
  async provision({ lab, user }) {
    throw new Error(`${this.name}.provision() not implemented.`);
  }

  /** Tears down an instance; must be idempotent. */
  async deprovision(session) {
    throw new Error(`${this.name}.deprovision() not implemented.`);
  }

  /**
   * Returns an object with the same shape as the mock terminal:
   *   execute({ command, cwd, fsState, session, lab }) -> { output, exitCode, cwd, fsState, events }
   */
  createTerminal(session, lab) {
    throw new Error(`${this.name}.createTerminal() not implemented.`);
  }
}

export default LabProvider;
