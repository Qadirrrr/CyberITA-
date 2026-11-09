import { dockerFailure } from './dockerRunner.js';
import { studentIdentity, LAB_HOSTNAME } from '../identity.js';
import { stripAnsi } from '../../utils/ansi.js';

const MARKER_PATH = '/tmp/.cyberita-cwd';
const MAX_COMMAND_LENGTH = 4000;

function encode(value) {
  return Buffer.from(String(value), 'utf8').toString('base64');
}

function clampOutput(value, maxBytes) {
  if (Buffer.byteLength(value) <= maxBytes) return value;
  return `${Buffer.from(value).subarray(0, Math.max(0, maxBytes - 32)).toString('utf8')}\n[output truncated]`;
}

function stateFor(session) {
  return session?.fs_state && typeof session.fs_state === 'object' ? session.fs_state : {};
}

export class DockerTerminal {
  constructor({ provider, session, lab }) {
    this.provider = provider;
    this.session = session;
    this.lab = lab;
    this.cwd = session?.cwd || lab?.initial_cwd || '/home/student';
  }

  base(extra = {}) {
    return {
      output: '',
      exitCode: 0,
      cwd: this.cwd,
      fsState: stateFor(this.session),
      events: [],
      ...extra,
    };
  }

  async execute(rawCommand, { onOutput } = {}) {
    const command = String(rawCommand ?? '').trim();
    const fsState = stateFor(this.session);
    if (!command) return this.base();
    if (command.length > MAX_COMMAND_LENGTH) {
      return this.base({ output: `Command is too long (limit ${MAX_COMMAND_LENGTH} characters).`, exitCode: 1 });
    }
    if (command === 'clear' || command === 'cls') {
      return this.base({ events: [{ type: 'clear' }] });
    }

    const name = this.provider.containerName(this.session);
    if (!name) {
      return this.base({ output: 'docker: this session has no valid container.', exitCode: 1 });
    }

    const shell = fsState.shell === '/bin/sh' ? '/bin/sh' : '/bin/bash';
    const fallbackId = studentIdentity({ id: this.session?.user_id || this.session?.student_id, full_name: this.session?.student_name });
    const identity = {
      shellUser: fsState.shellUser || fallbackId.shellUser || 'student',
      // Fixed lab hostname for every student (see identity.js): the prompt
      // always reads <student>@cyberitalab, even for sessions created
      // before this change stored a per-student hostname.
      hostname: LAB_HOSTNAME,
      studentName: fsState.studentName || fallbackId.displayName || '',
      studentId: fsState.studentId || fallbackId.studentId || '',
    };
    const script = [
      `marker=${MARKER_PATH}`,
      `trap 'pwd -P > "$marker" 2>/dev/null || true' EXIT`,
      `cwd=$(printf '%s' "$LAB_CWD_B64" | base64 -d)`,
      `command=$(printf '%s' "$LAB_COMMAND_B64" | base64 -d)`,
      `cd -- "$cwd" || exit 1`,
      // Allocate a real PTY inside the container via `script(1)` so commands
      // (apt, vim, less, top ...) see a proper terminal - no "not a terminal"
      // warnings and full interactive rendering in the web xterm.
      `exec script -qec "$command" /dev/null`,
    ].join('\n');

    const args = [
      'exec',
      '-i',
      // Full permission inside the disposable container: the learner can install
      // packages and use professional tooling. The passwd entry created during
      // provisioning makes `whoami`, `$USER` and the prompt show their name.
      '-u',
      '0:0',
      '-e',
      'HOME=/home/student',
      '-e',
      `USER=${identity.shellUser}`,
      '-e',
      `LOGNAME=${identity.shellUser}`,
      '-e',
      `CYBERITA_STUDENT_NAME=${identity.studentName}`,
      '-e',
      `CYBERITA_STUDENT_ID=${identity.studentId}`,
      '-e',
      `CYBERITA_STUDENT_USER=${identity.shellUser}`,
      '-e',
      `CYBERITA_LAB_HOST=${identity.hostname}`,
      '-e',
      `PS1=${identity.shellUser}@${identity.hostname}:\\w# `,
      '-e',
      'DEBIAN_FRONTEND=noninteractive',
      '-e',
      'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/games:/usr/local/games',
      '-e',
      'APT_LISTCHANGES_FRONTEND=none',
      '-e',
      'TERM=xterm-256color',
      '-e',
      'PAGER=cat',
      '-e',
      'GIT_PAGER=cat',
      '-e',
      `LAB_CWD_B64=${encode(this.cwd)}`,
      '-e',
      `LAB_COMMAND_B64=${encode(command)}`,
      name,
      shell,
      '-c',
      script,
    ];

    if (shell === '/bin/bash') args.splice(args.indexOf('-c'), 0, '--noprofile', '--norc');

    const result = await this.provider.run(args, {
      timeoutMs: this.provider.config.commandTimeoutMs,
      maxOutputBytes: this.provider.config.maxOutputBytes,
      onStdout: (chunk) => {
        if (typeof onOutput === 'function') {
          try { onOutput(chunk); } catch { /* ignore */ }
        }
      },
    });

    if (result.spawnError) {
      return this.base({
        output: dockerFailure(result, 'The lab terminal is unavailable.'),
        exitCode: 127,
      });
    }

    let output = `${result.stdout || ''}${result.stderr || ''}`;
    if (result.timedOut) {
      output += `${output.endsWith('\n') || !output ? '' : '\n'}[command timed out after ${Math.round(this.provider.config.commandTimeoutMs / 1000)}s]`;
    }
    if (result.truncated) {
      output += `${output.endsWith('\n') || !output ? '' : '\n'}[output truncated]`;
    }
    output = clampOutput(output, this.provider.config.maxOutputBytes);
    const cleanOutput = stripAnsi(output);

    const marker = await this.provider.run(
      ['exec', name, '/bin/sh', '-c', `cat ${MARKER_PATH} 2>/dev/null || true`],
      { timeoutMs: 5000, maxOutputBytes: 1024 }
    );
    const nextCwd = marker.exitCode === 0 ? marker.stdout.trim() : '';
    if (nextCwd.startsWith('/')) this.cwd = nextCwd;

    return this.base({
      output: cleanOutput,
      exitCode: result.timedOut ? 124 : result.exitCode,
    });
  }
}

export default DockerTerminal;
