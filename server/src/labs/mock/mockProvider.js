import crypto from 'node:crypto';
import { LabProvider } from '../provider.js';
import { MockShell } from './mockShell.js';
import { defaultFs } from './virtualFs.js';
import { studentIdentity } from '../identity.js';

/**
 * Mock lab provider, simulates provisioning entirely in-process.
 *
 * It behaves exactly like a real provider from the API's point of view
 * (async provision/deprovision, instance ids, terminals), so automated
 * tests can exercise the full lab workflow without Docker. It never
 * executes real commands and must remain test-only.
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

  async provision({ lab, user }) {
    const identity = studentIdentity(user);
    const instanceId = `mock-${crypto.randomBytes(6).toString('hex')}`;
    const baseFs = lab.initial_files && Object.keys(lab.initial_files).length > 0 ? lab.initial_files : defaultFs();
    const descriptor = {
      instanceId,
      provider: this.name,
      status: 'running',
      cwd: lab.initial_cwd || '/home/student',
      fsState: {
        ...baseFs,
        shellUser: identity.shellUser,
        hostname: identity.hostname,
        studentName: identity.displayName,
        studentId: identity.studentId,
      },
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
    const shellUser = session?.fs_state?.shellUser || session?.shell_user || 'student';
    const hostname = session?.fs_state?.hostname || session?.hostname || `lab-${(session.instance_id || 'session').slice(-6)}`;
    return new MockShell({
      fsState: session.fs_state,
      cwd: session.cwd || lab?.initial_cwd || '/home/student',
      welcome,
      hostname,
      user: shellUser,
    });
  }
}

export default MockLabProvider;
