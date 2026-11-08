import crypto from 'node:crypto';
import { LabProvider } from '../provider.js';
import { PracticeShell } from './practiceShell.js';
import { defaultFs, ensureDir, mergeInitialFiles, normalizePath, writeFile, getNode } from './virtualFs.js';
import { studentIdentity } from '../identity.js';

const HOME = '/home/student';

/**
 * ============================================================
 * PracticeLabProvider — container-less practice terminals
 * ============================================================
 * Practice labs (`labs.is_practice = true`) are warm-up labs that are not
 * graded and are not tied to a course. They must never consume a Docker
 * container on the lab host.
 *
 * This provider keeps the exact same contract as the Docker provider
 * (provision → createTerminal → deprovision) but the terminal is an
 * in-process simulated Ubuntu shell. All state lives in
 * `lab_sessions.fs_state`, so a practice session survives page reloads and
 * is destroyed when the learner stops it.
 *
 * Real course labs keep using DockerLabProvider unchanged.
 */
export class PracticeLabProvider extends LabProvider {
  static providerName = 'practice';

  constructor(config = {}) {
    super(config);
    this.instances = new Map();
  }

  async isAvailable() {
    return { ok: true, reason: 'In-browser practice terminal (no container required).' };
  }

  async provision({ lab, user }) {
    const identity = studentIdentity(user);
    const instanceId = `practice-${crypto.randomBytes(6).toString('hex')}`;

    // A lab may point at a subdirectory; keep practice sessions inside the
    // learner's home so the terminal can never "escape" the sandbox.
    const requested = normalizePath(lab.initial_cwd || HOME, HOME);
    const cwd = requested === HOME || requested.startsWith(`${HOME}/`) ? requested : HOME;

    const root = defaultFs();
    ensureDir(root, HOME);
    ensureDir(root, `${HOME}/notes`);
    ensureDir(root, `${HOME}/scripts`);
    ensureDir(root, cwd);
    mergeInitialFiles(root, lab.initial_files || {}, HOME);

    // Give every session a welcome file, just like the Docker workspace does.
    if (!getNode(root, `${HOME}/welcome.txt`)) {
      writeFile(root, `${HOME}/welcome.txt`, `${lab.terminal_welcome || 'Welcome to your CyberITA+ practice terminal.'}\n`);
    }

    const descriptor = {
      instanceId,
      provider: this.name,
      status: 'running',
      cwd,
      fsState: {
        ...root,
        shellUser: identity.shellUser,
        hostname: identity.hostname,
        studentName: identity.displayName,
        studentId: identity.studentId,
      },
      welcome: lab.terminal_welcome || '',
      containerless: true,
      provisionedAt: new Date().toISOString(),
    };

    this.instances.set(instanceId, descriptor);
    return descriptor;
  }

  async deprovision(session) {
    // Practice sessions are in-process only: dropping the descriptor is a
    // complete teardown. Idempotent by design.
    if (session?.instance_id) this.instances.delete(session.instance_id);
    return { ok: true, containerless: true };
  }

  createTerminal(session, lab) {
    const fsState = session?.fs_state && typeof session.fs_state === 'object' ? session.fs_state : {};
    const identity = studentIdentity({
      id: fsState.studentId || session?.user_id,
      full_name: fsState.studentName || session?.student_name,
    });
    return new PracticeShell({
      fsState,
      cwd: session?.cwd || lab?.initial_cwd || HOME,
      welcome: lab?.terminal_welcome || session?.welcome || '',
      hostname: identity.hostname,
      user: fsState.shellUser || session?.shell_user || identity.shellUser,
    });
  }
}

export default PracticeLabProvider;
