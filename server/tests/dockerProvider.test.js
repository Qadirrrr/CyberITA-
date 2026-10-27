import { describe, it, expect } from 'vitest';
import { DockerLabProvider } from '../src/labs/docker/dockerProvider.js';
import { DockerTerminal } from '../src/labs/docker/dockerTerminal.js';

const BASE_CONFIG = {
  binary: 'docker',
  image: 'ubuntu:22.04',
  networkEnabled: false,
  pull: true,
  memoryMb: 512,
  cpus: 1,
  pidsLimit: 128,
  commandTimeoutMs: 1000,
  provisionTimeoutMs: 1000,
  maxOutputBytes: 4096,
};

function makeProvider(handler) {
  const calls = [];
  const runner = async (args, options = {}) => {
    calls.push({ args, options });
    return handler(args, options) || { exitCode: 0, stdout: '', stderr: '' };
  };
  const provider = new DockerLabProvider({ ...BASE_CONFIG, runner });
  return { provider, calls };
}

describe('DockerLabProvider', () => {
  it('reports Docker availability and missing CLI errors', async () => {
    const ready = makeProvider(() => ({ exitCode: 0, stdout: '27.1.1\n', stderr: '' }));
    await expect(ready.provider.isAvailable()).resolves.toEqual({ ok: true, reason: 'Docker Engine 27.1.1' });

    const missing = makeProvider(() => {
      const error = new Error('spawn docker ENOENT');
      error.code = 'ENOENT';
      return { exitCode: 1, stdout: '', stderr: '', spawnError: error };
    });
    const availability = await missing.provider.isAvailable();
    expect(availability.ok).toBe(false);
    expect(availability.reason).toMatch(/not installed/);
  });

  it('provisions a real terminal container with the learner identity', async () => {
    const { provider, calls } = makeProvider((args) => {
      if (args[0] === 'exec' && args.some((arg) => String(arg).includes('test -x /bin/bash'))) {
        return { exitCode: 0, stdout: '/bin/bash', stderr: '' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    });

    const lab = {
      id: 7,
      initial_cwd: '/home/student/work',
      terminal_welcome: 'Welcome to Docker labs.',
      initial_files: { 'notes.txt': 'hello', '/etc/passwd': 'not allowed' },
      container_image: 'alpine:3.20',
      network_enabled: false,
    };
    const descriptor = await provider.provision({
      lab,
      user: { id: 3, full_name: 'Saif Khan' },
    });

    expect(descriptor.provider).toBe('docker');
    expect(descriptor.instanceId).toMatch(/^cyberita-lab-[a-f0-9]{32}$/);
    expect(descriptor.cwd).toBe('/home/student/work');
    expect(descriptor.fsState).toEqual({
      shell: '/bin/bash',
      shellUser: 'saif',
      hostname: 'cyberita-lab',
      studentName: 'Saif Khan',
      studentId: '3',
    });

    const create = calls.find((call) => call.args[0] === 'create');
    expect(create).toBeTruthy();
    expect(create.args).toContain('alpine:3.20');
    expect(create.args).toContain('--hostname');
    expect(create.args).toContain('cyberita-lab');
    // Full permission inside the container, but never privileged on the host.
    expect(create.args).not.toContain('--cap-drop');
    expect(create.args).not.toContain('no-new-privileges');
    expect(create.args).not.toContain('--privileged');
    expect(create.args).toContain('NET_ADMIN');
    expect(create.args).toContain('SYS_PTRACE');
    expect(create.args).toContain('--pids-limit');
    expect(create.args).toContain('--memory');
    expect(create.args.filter((arg) => arg === '--network')).toHaveLength(1);
    expect(create.args).toContain('none');

    const setups = calls.filter((call) => call.args[0] === 'exec' && call.options.input);
    const workspace = setups.find((call) => call.args.includes('1000:1000'));
    expect(workspace).toBeTruthy();
    const script = workspace.options.input.toString('utf8');
    expect(script).toContain(Buffer.from('/home/student/work/notes.txt').toString('base64'));
    expect(script).not.toContain(Buffer.from('/etc/passwd').toString('base64'));
    expect(script).toContain(Buffer.from('Welcome to Docker labs.\n').toString('base64'));

    // The workspace phase runs as the unprivileged home owner, so it must not
    // rely on privileged ownership changes.
    expect(script).not.toMatch(/(^|\n)\s*chown\s/);

    const account = setups.find((call) => !call.args.includes('1000:1000'));
    expect(account).toBeTruthy();
    const accountScript = account.options.input.toString('utf8');
    expect(accountScript).toContain('/etc/passwd');
    expect(accountScript).toContain(Buffer.from('saif').toString('base64'));
    expect(accountScript).toContain(Buffer.from('Saif Khan').toString('base64'));
    expect(accountScript).toContain(Buffer.from('/etc/apt/apt.conf.d/99-cyberita-lab').toString('base64'));
    expect(accountScript).toContain(Buffer.from('/etc/profile.d/90-cyberita-identity.sh').toString('base64'));
  });

  it('enables networking only when the lab requests it', async () => {
    const { provider, calls } = makeProvider(() => ({ exitCode: 0, stdout: '/bin/sh', stderr: '' }));
    await provider.provision({
      lab: { id: 1, initial_cwd: '/home/student', terminal_welcome: '', initial_files: {}, network_enabled: true },
      user: { id: 2 },
    });
    const create = calls.find((call) => call.args[0] === 'create');
    expect(create.args).not.toContain('none');
  });

  it('executes commands as root with the learner identity and tracks cwd', async () => {
    const { provider, calls } = makeProvider((args) => {
      if (args[0] === 'exec' && args.includes('cat /tmp/.cyberita-cwd 2>/dev/null || true')) {
        return { exitCode: 0, stdout: '/home/student/scripts\n', stderr: '' };
      }
      if (args[0] === 'exec') {
        return { exitCode: 0, stdout: 'hello world\n', stderr: '' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    });
    const terminal = new DockerTerminal({
      provider,
      session: {
        instance_id: `cyberita-lab-${'a'.repeat(32)}`,
        cwd: '/home/student',
        fs_state: {
          shell: '/bin/bash',
          shellUser: 'saif',
          hostname: 'cyberita-lab',
          studentName: 'Saif Khan',
          studentId: '3',
        },
      },
      lab: {},
    });

    const result = await terminal.execute('echo hello world');
    expect(result.output).toBe('hello world\n');
    expect(result.exitCode).toBe(0);
    expect(result.cwd).toBe('/home/student/scripts');

    const exec = calls.find((call) => call.args[0] === 'exec' && call.args.some((arg) => String(arg).startsWith('LAB_COMMAND_B64=')));
    expect(exec.args).toContain('0:0');
    expect(exec.args).not.toContain('1000:1000');
    expect(exec.args).toContain('USER=saif');
    expect(exec.args).toContain('LOGNAME=saif');
    expect(exec.args).toContain('HOME=/home/student');
    expect(exec.args).toContain('CYBERITA_STUDENT_NAME=Saif Khan');
    expect(exec.args).toContain('CYBERITA_STUDENT_ID=3');
    expect(exec.args).toContain('PS1=saif@cyberita-lab:\\w# ');
    expect(exec.args).toContain('DEBIAN_FRONTEND=noninteractive');
    const commandEnv = exec.args.find((arg) => String(arg).startsWith('LAB_COMMAND_B64='));
    expect(Buffer.from(commandEnv.split('=')[1], 'base64').toString('utf8')).toBe('echo hello world');
  });

  it('handles clear and removes containers idempotently', async () => {
    const { provider, calls } = makeProvider(() => ({ exitCode: 0, stdout: '', stderr: '' }));
    const terminal = new DockerTerminal({ provider, session: { instance_id: 'bad', cwd: '/', fs_state: {} }, lab: {} });
    const cleared = await terminal.execute('clear');
    expect(cleared.events).toEqual([{ type: 'clear' }]);
    await expect(provider.deprovision({ instance_id: 'bad' })).resolves.toEqual({ ok: true });
    expect(calls.filter((call) => call.args[0] === 'rm')).toHaveLength(0);

    const name = `cyberita-lab-${'b'.repeat(32)}`;
    await provider.deprovision({ instance_id: name });
    expect(calls.at(-1).args).toEqual(['rm', '-f', name]);
  });
});
