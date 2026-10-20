import crypto from 'node:crypto';
import { LabProvider } from '../provider.js';
import { MockShell } from './mockShell.js';
import { defaultFs } from './virtualFs.js';

/**
 * Mock lab provider — simulates provisioning entirely in-process.
 *
 * It behaves exactly like a cloud provider from the API's point of
 * view (async provision/deprovision, instance ids, terminals), so the
 * real providers (NOVA VPS, AWS, ...) can be swapped in later by
 * implementing the same LabProvider interface.
 */
export class MockLabProvider extends LabProvider {
  static providerName = 'mock';

  constructor(config = {}) {
    super(config);
    this.instances = new Map();
  }

  async isAvailable() {
    return { ok: true, reason: 'in-process simulated provisioning' };
  }

  async provision({ lab }) {
    const instanceId = `mock-${crypto.randomBytes(6).toString('hex')}`;
    const descriptor = {
      instanceId,
      provider: this.name,
      status: 'running',
      cwd: lab.initial_cwd || '/home/student',
      fsState: lab.initial_files && Object.keys(lab.initial_files).length > 0 ? lab.initial_files : defaultFs(),
      welcome: lab.terminal_welcome || '',
      provisionedAt: new Date().toISOString(),
    };
    this.instances.set(instanceId, descriptor);
    return descriptor;
  }

  async deprovision(session) {
    if (session?.instance_id) this.instances.delete(session.instance_id);
    return { ok: true };
  }

  createTerminal(session, lab) {
    const welcome = lab?.terminal_welcome || session?.welcome || '';
    return new MockShell({
      fsState: session.fs_state,
      cwd: session.cwd || lab?.initial_cwd || '/home/student',
      welcome,
      hostname: `lab-${(session.instance_id || 'session').slice(-6)}`,
      user: 'student',
    });
  }
}

export default MockLabProvider;
