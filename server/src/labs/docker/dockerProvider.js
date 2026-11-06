import crypto from 'node:crypto';
import { LabProvider } from '../provider.js';
import env from '../../config/env.js';
import { AppError } from '../../utils/errors.js';
import { runDocker, dockerFailure } from './dockerRunner.js';
import { resolveDockerBinary, dockerBinaryHint } from './dockerBinary.js';
import { agentClient } from '../remote/agentClient.js';
import { getLabServer, isRemoteAgent } from '../../services/labServers.js';
import { DockerTerminal } from './dockerTerminal.js';
import { RemoteTerminal } from '../remote/remoteTerminal.js';
import { studentIdentity } from '../identity.js';

const NAME_PATTERN = /^cyberita-lab-[a-z0-9_-]{1,120}$/;
const IMAGE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/:@-]{0,254}$/;
const HOME_DIR = '/home/student';
const STUDENT_UID = '1000';
const STUDENT_GID = '1000';

function providerError(message) {
  const error = new AppError(message, 503, 'lab_unavailable');
  error.expose = true;
  return error;
}

function lastLine(value) {
  return String(value || '').trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || '';
}

function normalizeContainerPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.includes('\0')) return HOME_DIR;
  const parts = [];
  for (const segment of value.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  const normalized = `/${parts.join('/')}`;
  if (normalized === HOME_DIR || normalized.startsWith(`${HOME_DIR}/`)) return normalized;
  return HOME_DIR;
}

function relativeToHome(value, cwd) {
  if (typeof value !== 'string' || value.includes('\0')) return null;
  const base = value.startsWith('/') ? value : `${cwd.replace(/\/+$/, '')}/${value}`;
  const parts = [];
  for (const segment of base.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  const normalized = `/${parts.join('/')}`;
  if (normalized !== HOME_DIR && !normalized.startsWith(`${HOME_DIR}/`)) return null;
  return normalized;
}

function encode(value) {
  return Buffer.from(String(value), 'utf8').toString('base64');
}

function shellWrite(target, content) {
  return [
    `target=$(printf '%s' '${encode(target)}' | base64 -d)`,
    `mkdir -p "$(dirname "$target")"`,
    `printf '%s' '${encode(content)}' | base64 -d > "$target"`,
  ].join('\n  ');
}

/** Quotes a value for safe use inside a POSIX shell single-quoted string. */
function shellQuote(value) {
  return `'${String(value ?? '').replace(/'/g, `'\\''`)}'`;
}

function identityProfile(identity) {
  return [
    '# Written by CyberITA+ for this lab session.',
    `export CYBERITA_STUDENT_NAME=${shellQuote(identity.displayName)}`,
    `export CYBERITA_STUDENT_ID=${shellQuote(identity.studentId)}`,
    `export CYBERITA_STUDENT_USER=${shellQuote(identity.shellUser)}`,
    `export CYBERITA_LAB_HOST=${shellQuote(identity.hostname)}`,
    `export PS1=${shellQuote(`${identity.shellUser}@${identity.hostname}:\\w# `)}`,
    '',
  ].join('\n');
}

function identityMotd(identity) {
  const id = identity.studentId ? ` (student #${identity.studentId})` : '';
  return [
    `Welcome, ${identity.displayName}${id}.`,
    `You are signed in as ${identity.shellUser} with full root access in this isolated lab container.`,
    'Install packages with: apt update && apt install <package>',
    '',
  ].join('\n');
}

const APT_CONFIG = [
  'APT::Get::Assume-Yes "true";',
  'Dpkg::Options { "--force-confdef"; "--force-confold"; };',
  'Acquire::Retries "3";',
  '',
].join('\n');

export class DockerLabProvider extends LabProvider {
  static providerName = 'docker';

  constructor(config = {}) {
    super({ ...env.labs.docker, ...config });
    this.runner = config.runner || null;
  }

  /**
   * Runs a Docker CLI command. `options.host` routes the command to a specific
   * lab server (DOCKER_HOST); when omitted the provider/global host is used.
   */
  async run(args, options = {}) {
    const { host, ...runnerOptions } = options;
    const dockerHost = host !== undefined ? host : this.config.host || '';
    // Resolve the CLI explicitly so production services with a minimal PATH
    // (systemd, PM2, NSSM, Windows services) still find Docker.
    const resolved = resolveDockerBinary(this.config.binary);
    try {
      if (this.runner) return await this.runner(args, runnerOptions);
      return await runDocker(resolved.binary, args, {
        ...runnerOptions,
        env: { ...(dockerHost ? { DOCKER_HOST: dockerHost } : {}), ...(runnerOptions.env || {}) },
      });
    } catch (error) {
      return { exitCode: 1, stdout: '', stderr: error.message, spawnError: error, timedOut: false, truncated: false };
    }
  }

  async isAvailable({ host } = {}) {
    const resolved = resolveDockerBinary(this.config.binary);
    const result = await this.run(['version', '--format', '{{.Server.Version}}'], { timeoutMs: 8000, host });
    if (result.spawnError?.code === 'ENOENT') {
      return {
        ok: false,
        reason: dockerBinaryHint(resolved),
        binary: resolved.binary,
        binarySource: resolved.source,
      };
    }
    if (result.exitCode !== 0 || result.timedOut) {
      return {
        ok: false,
        reason: dockerFailure(result, 'Docker daemon is not reachable.'),
        binary: resolved.binary,
        binarySource: resolved.source,
      };
    }
    const version = result.stdout.trim();
    return {
      ok: true,
      reason: version ? `Docker Engine ${version}` : 'Docker Engine ready',
      binary: resolved.binary,
      binarySource: resolved.source,
    };
  }

  resolveImage(explicit) {
    const image = String(explicit || this.config.image || '').trim();
    if (!IMAGE_PATTERN.test(image)) throw providerError('The configured lab container image is invalid.');
    return image;
  }

  containerName(session) {
    const name = String(session?.instance_id || '');
    return NAME_PATTERN.test(name) ? name : null;
  }

  async ensureImage(image, host) {
    const inspected = await this.run(['image', 'inspect', image], { timeoutMs: this.config.provisionTimeoutMs, host });
    if (inspected.exitCode === 0) return;
    const localImage = String(image).startsWith('cyberita/');
    const buildHint = localImage
      ? ' It is a local CyberITA+ image: build it on the Docker host with `npm run lab:image:build` (see docs/LABS.md).'
      : '';
    if (!this.config.pull) {
      throw providerError(
        `Lab image "${image}" is not available on the Docker host.${buildHint || ' Enable LAB_DOCKER_PULL=true to pull it automatically.'}`
      );
    }
    const pulled = await this.run(['pull', image], { timeoutMs: this.config.provisionTimeoutMs, host });
    if (pulled.exitCode !== 0) {
      // Only blame a missing local image when the pull actually ran. A missing
      // Docker CLI (ENOENT) is a host setup problem, not a missing image.
      const cliMissing = Boolean(pulled.spawnError);
      throw providerError(
        `${dockerFailure(pulled, `Could not pull the lab image "${image}".`)}${cliMissing ? '' : buildHint}`
      );
    }
  }

  async createContainer({ name, image, lab, user, identity, networkEnabled, host }) {
    const args = [
      'create',
      '--name',
      name,
      '--hostname',
      identity.hostname,
      '--label',
      'cyberita.lab=true',
      '--label',
      `cyberita.lab_id=${lab.id}`,
      '--label',
      `cyberita.user_id=${user.id}`,
      '--label',
      `cyberita.student=${identity.shellUser}`,
      '--init',
      // Labs are real practice environments: the learner is root inside the
      // container so they can install packages and use professional tooling.
      // The container is still unprivileged from the host's point of view
      // (no --privileged, no host filesystem mounts, resource limits). The
      // Docker socket is mounted so `docker` commands work for training.
      '--cap-add',
      'NET_ADMIN',
      '--cap-add',
      'SYS_PTRACE',
      '--pids-limit',
      String(this.config.pidsLimit),
      '--memory',
      `${this.config.memoryMb}m`,
      '--memory-swap',
      `${this.config.memoryMb}m`,
      '--cpus',
      String(this.config.cpus),
      '--ulimit',
      'nofile=1024:1024',
      '--tmpfs',
      '/tmp:rw,nosuid,size=128m',
      '--tmpfs',
      '/run:rw,nosuid,size=16m',
      // Expose the host Docker daemon's socket so learners can run real
      // `docker` commands inside the lab (e.g. the Docker lab). The lab
      // container stays otherwise isolated; only the Docker CLI client talks
      // to the host daemon through this socket.
      '-v',
      '/var/run/docker.sock:/var/run/docker.sock',
    ];
    if (!networkEnabled) args.push('--network', 'none');
    args.push(image, 'sleep', 'infinity');

    const created = await this.run(args, { timeoutMs: this.config.provisionTimeoutMs, host });
    if (created.exitCode !== 0) throw providerError(dockerFailure(created, 'Could not create the lab container.'));

    const started = await this.run(['start', name], { timeoutMs: this.config.provisionTimeoutMs, host });
    if (started.exitCode !== 0) throw providerError(dockerFailure(started, 'Could not start the lab container.'));
  }

  /**
   * Phase 1 — runs as root inside the container. It prepares the shared
   * `student` account (UID 1000, used by the workspace phase) and creates a
   * per-session account with the learner's own name and UID 0. UID 0 gives the
   * learner full permission to install packages and use real tooling, while
   * the passwd entry makes `whoami`, `$USER` and the prompt show their name.
   *
   * The container itself is still unprivileged relative to the host: no
   * --privileged, no host filesystem mounts, and resource limits. The Docker
   * socket is mounted so `docker` commands work for training.
   */
  buildAccountScript(identity) {
    return [
      'set -eu',
      `grep -q '^student:' /etc/passwd || printf '\\n%s\\n' 'student:x:${STUDENT_UID}:${STUDENT_GID}:Student User:${HOME_DIR}:/bin/bash' >> /etc/passwd`,
      `grep -q '^student:' /etc/group || printf '\\n%s\\n' 'student:x:${STUDENT_GID}:' >> /etc/group`,
      `if [ ! -d ${HOME_DIR} ]; then mkdir -p ${HOME_DIR}; fi`,
      `chown -R ${STUDENT_UID}:${STUDENT_GID} ${HOME_DIR} 2>/dev/null || true`,
      `chmod 750 ${HOME_DIR} 2>/dev/null || true`,
      '',
      '# Give this session its own root identity (name shown by whoami/$USER).',
      `cyberita_user=$(printf '%s' '${encode(identity.shellUser)}' | base64 -d)`,
      `cyberita_gecos=$(printf '%s' '${encode(identity.displayName)}' | base64 -d)`,
      'grep -v "^${cyberita_user}:" /etc/passwd > /etc/passwd.cyberita 2>/dev/null || true',
      '{ printf \'%s\\n\' "${cyberita_user}:x:0:0:${cyberita_gecos}:/home/student:/bin/bash"; cat /etc/passwd.cyberita; } > /etc/passwd',
      'rm -f /etc/passwd.cyberita',
      '',
      '# Add shadow entry so sudo and PAM authentication never treat account as locked',
      'grep -v "^${cyberita_user}:" /etc/shadow > /etc/shadow.cyberita 2>/dev/null || true',
      '{ printf \'%s\\n\' "${cyberita_user}:*:19000:0:99999:7:::"; cat /etc/shadow.cyberita; } > /etc/shadow 2>/dev/null || true',
      'rm -f /etc/shadow.cyberita',
      '',
      shellWrite('/etc/profile.d/90-cyberita-identity.sh', identityProfile(identity)),
      shellWrite('/etc/motd', identityMotd(identity)),
      // Make non-interactive package installs work without prompts.
      shellWrite('/etc/apt/apt.conf.d/99-cyberita-lab', APT_CONFIG),
      '',
      'if command -v sudo >/dev/null 2>&1; then',
      '  mkdir -p /etc/sudoers.d',
      '  {',
      "    printf '%s\\n' 'ALL ALL=(ALL) NOPASSWD:ALL'",
      "    printf '%s\\n' \"${cyberita_user} ALL=(ALL) NOPASSWD:ALL\"",
      "    printf '%s\\n' 'student ALL=(ALL) NOPASSWD:ALL'",
      '  } > /etc/sudoers.d/cyberita',
      '  chmod 0440 /etc/sudoers.d/cyberita 2>/dev/null || true',
      'fi',
      'usermod -aG sudo,adm "${cyberita_user}" 2>/dev/null || true',
      '',
      `chown -R ${STUDENT_UID}:${STUDENT_GID} ${HOME_DIR} 2>/dev/null || true`,
      '',
    ].join('\n');
  }

  /**
   * Phase 2 — runs as the unprivileged student (UID/GID 1000), the owner of
   * the home directory, exactly like every terminal command. Files created
   * here are owned by 1000 automatically, so no privileged chown is needed.
   */
  buildWorkspaceScript({ lab, cwd }) {
    const initialFiles = lab.initial_files && typeof lab.initial_files === 'object' ? lab.initial_files : {};
    const writes = [];
    const writtenPaths = new Set();
    for (const [filePath, content] of Object.entries(initialFiles)) {
      if (typeof content !== 'string') continue;
      const target = relativeToHome(filePath, cwd);
      if (!target) continue;
      writes.push({ target, content });
      writtenPaths.add(target);
    }
    if (!writtenPaths.has(`${HOME_DIR}/welcome.txt`)) {
      writes.push({
        target: `${HOME_DIR}/welcome.txt`,
        content: `${lab.terminal_welcome || 'Welcome to your CyberITA+ lab environment.'}\n`,
      });
    }

    const lines = [
      'set -eu',
      `if [ ! -w ${HOME_DIR} ]; then`,
      `  echo '${HOME_DIR} is not writable by the student user (UID ${STUDENT_UID}). Use the cyberita/lab-runtime image, or bake a student user (UID ${STUDENT_UID}) with a writable home directory (see docs/LABS.md).' >&2`,
      '  exit 1',
      'fi',
      `mkdir -p ${HOME_DIR}/notes ${HOME_DIR}/scripts`,
      `mkdir -p "$(printf '%s' '${encode(cwd)}' | base64 -d)"`,
    ];
    for (const write of writes) lines.push(shellWrite(write.target, write.content));
    // Tighten the home when the student owns it; ignored for the shared fallback home.
    lines.push(`chmod 750 ${HOME_DIR} 2>/dev/null || true`);
    return `${lines.join('\n')}\n`;
  }

  async bootstrap({ name, lab, cwd, host, identity }) {
    const account = await this.run(['exec', '-i', name, '/bin/sh', '-s'], {
      input: this.buildAccountScript(identity),
      timeoutMs: this.config.provisionTimeoutMs,
      host,
    });
    if (account.exitCode !== 0) throw providerError(dockerFailure(account, 'Could not prepare the lab user.'));

    const workspace = await this.run(
      [
        'exec',
        '-i',
        '-u',
        `${STUDENT_UID}:${STUDENT_GID}`,
        '-e',
        `HOME=${HOME_DIR}`,
        '-e',
        'USER=student',
        '-e',
        'LOGNAME=student',
        name,
        '/bin/sh',
        '-s',
      ],
      { input: this.buildWorkspaceScript({ lab, cwd }), timeoutMs: this.config.provisionTimeoutMs, host }
    );
    if (workspace.exitCode !== 0) throw providerError(dockerFailure(workspace, 'Could not prepare the lab workspace.'));

    const shell = await this.run(['exec', name, '/bin/sh', '-c', 'test -x /bin/bash && printf /bin/bash || printf /bin/sh'], {
      timeoutMs: 10000,
      host,
    });
    if (shell.exitCode !== 0) throw providerError(dockerFailure(shell, 'The lab image does not provide a usable shell.'));
    return shell.stdout.trim() === '/bin/bash' ? '/bin/bash' : '/bin/sh';
  }

  async provision({ lab, user, host = null, server = null, serverId = null }) {
    const resolvedServer = server || (serverId ? await getLabServer(serverId).catch(() => null) : null);
    if (resolvedServer && isRemoteAgent(resolvedServer)) {
      const payload = { lab, user };
      const res = await agentClient.createContainer(resolvedServer, payload, this.config.provisionTimeoutMs || 180000);
      if (!res.ok) {
        const err = new AppError(res.error || 'Remote provision failed.', 503, 'lab_unavailable');
        err.expose = true;
        throw err;
      }
      return { ...res.data, serverId: resolvedServer.id, provider: this.name };
    }

    const image = this.resolveImage(lab.container_image);
    const identity = studentIdentity(user);
    // Name containers after the student so the host can tell who is doing
    // what: cyberita-lab-<name>-<userId>-<random>.
    const name = `cyberita-lab-${identity.shellUser}-${user.id}-${crypto.randomBytes(6).toString('hex')}`;
    const cwd = normalizeContainerPath(lab.initial_cwd || HOME_DIR);
    const networkEnabled = Boolean(this.config.networkEnabled || lab.network_enabled);

    try {
      await this.ensureImage(image, host);
      await this.createContainer({ name, image, lab, user, identity, networkEnabled, host });
      const shell = await this.bootstrap({ name, lab, cwd, host, identity });
      return {
        instanceId: name,
        provider: this.name,
        serverId,
        status: 'running',
        cwd,
        fsState: {
          shell,
          shellUser: identity.shellUser,
          hostname: identity.hostname,
          studentName: identity.displayName,
          studentId: identity.studentId,
        },
        welcome: lab.terminal_welcome || '',
        provisionedAt: new Date().toISOString(),
      };
    } catch (error) {
      await this.deprovision({ instance_id: name }, { host }).catch(() => {});
      if (error instanceof AppError) throw error;
      throw providerError(`Could not provision the lab container. ${lastLine(error.message)}`);
    }
  }

  async deprovision(session, { host = null, server = null } = {}) {
    const resolvedServer = server || (session?.lab_server_id ? await getLabServer(session.lab_server_id).catch(() => null) : null);
    if (resolvedServer && isRemoteAgent(resolvedServer)) {
      const res = await agentClient.remove(resolvedServer, session.instance_id || session.instanceId, {
        cwd: session.cwd,
        fsState: session.fs_state || session.fsState,
      }, 60000);
      if (!res.ok && !/not found/i.test(res.error || '')) {
        throw providerError(res.error || 'Could not remove the remote lab container.');
      }
      return { ok: true };
    }
    const name = this.containerName(session);
    if (!name) return { ok: true };
    const result = await this.run(['rm', '-f', name], { timeoutMs: 60000, host });
    if (result.exitCode !== 0 && !/no such container/i.test(`${result.stderr}\n${result.stdout}`)) {
      throw providerError(dockerFailure(result, 'Could not remove the lab container.'));
    }
    return { ok: true };
  }

  createTerminal(session, lab, { server = null } = {}) {
    // Prefer explicit server; fall back to one stashed on the session object.
    let srv = server || session?._server || null;
    if (srv && isRemoteAgent(srv)) {
      return new RemoteTerminal({ server: srv, session, lab });
    }
    return new DockerTerminal({ provider: this, session, lab });
  }
}

export default DockerLabProvider;
