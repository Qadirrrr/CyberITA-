import { agentClient } from './agentClient.js';

export class RemoteTerminal {
  constructor({ server, session, lab }) {
    this.server = server;
    this.session = session || {};
    this.lab = lab || {};
    this.cwd = session?.cwd || lab?.initial_cwd || '/home/student';
    this.fsState = session?.fs_state || session?.fsState || {};
  }

  async execute(rawCommand, { onOutput } = {}) {
    const command = String(rawCommand || '').trim();
    if (!command) return { output: '', exitCode: 0, cwd: this.cwd, fsState: this.fsState, events: [] };
    if (command.length > 4000) {
      return { output: 'Command is too long (max 4000 characters).', exitCode: 2, cwd: this.cwd, fsState: this.fsState, events: [] };
    }
    if (command === 'clear' || command === 'cls') {
      return { output: '', exitCode: 0, cwd: this.cwd, fsState: this.fsState, events: [{ type: 'clear' }] };
    }

    const res = await agentClient.exec(this.server, this.session.instance_id || this.session.instanceId, {
      command,
      cwd: this.cwd,
      fsState: this.fsState,
      lab: this.lab,
    }, 180000);

    if (!res.ok) {
      const msg = res.error || 'Remote command failed.';
      if (typeof onOutput === 'function') onOutput(msg);
      return { output: msg, exitCode: 1, cwd: this.cwd, fsState: this.fsState, events: [] };
    }
    const data = res.data || {};
    const output = data.output || '';
    if (typeof onOutput === 'function' && output) onOutput(output);
    if (data.cwd) this.cwd = data.cwd;
    if (data.fsState) this.fsState = data.fsState;
    return {
      output,
      exitCode: typeof data.exitCode === 'number' ? data.exitCode : 0,
      cwd: this.cwd,
      fsState: this.fsState,
      events: data.events || [],
    };
  }
}

export default RemoteTerminal;
