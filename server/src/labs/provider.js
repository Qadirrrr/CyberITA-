/**
 * ============================================================
 * Lab provider contract
 * ============================================================
 * Every provider (Docker in production, the in-process simulator in automated
 * tests) implements this
 * interface so the rest of CyberITA+ never needs to know where a lab runs.
 *
 *   const session = await provider.provision({ lab, user })
 *   const terminal = provider.createTerminal(session)   // duplex command executor
 *   await provider.deprovision(session)
 *
 * Providers are registered in ./index.js and selected through the
 * LAB_PROVIDER environment variable.
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

  /** Returns {ok, reason}, used by /api/labs/status. */
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
   * Returns a duplex command executor:
   *   execute({ command, cwd, fsState, session, lab }) -> { output, exitCode, cwd, fsState, events }
   */
  createTerminal(session, lab) {
    throw new Error(`${this.name}.createTerminal() not implemented.`);
  }
}

export default LabProvider;
