import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Finds the Docker CLI on the host.
 *
 * Why this exists: `LAB_DOCKER_BINARY` defaults to the bare name `docker`,
 * which only works when the API process inherits a PATH that contains it.
 * Production setups (systemd, PM2, NSSM, Windows services, containers) often
 * run with a minimal PATH, so `spawn('docker')` fails with ENOENT even though
 * Docker is installed. We therefore look the binary up explicitly:
 *
 *   1. the configured value (LAB_DOCKER_BINARY), as a name or absolute path,
 *   2. the bare name on PATH,
 *   3. well-known install locations for Docker Engine / Docker Desktop.
 *
 * The lookup is cached. Missing binaries are re-probed after a short delay so
 * installing Docker (or fixing the service PATH) does not need a restart.
 */

const MISSING_TTL_MS = 5000;

const WIN_EXTENSIONS = (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM')
  .split(';')
  .map((ext) => ext.trim())
  .filter(Boolean);

function isExecutable(file) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile()) return false;
    if (process.platform !== 'win32') fs.accessSync(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function extensionsFor(command) {
  if (process.platform !== 'win32') return [''];
  // Do not double the extension when the configured value already has one.
  if (path.extname(command)) return [''];
  // Prefer real executables: Docker Desktop also ships an extensionless
  // `docker` shell wrapper that cannot be spawned directly on Windows.
  return [...WIN_EXTENSIONS, ''];
}

function lookupOnPath(command) {
  const wanted = String(command || '').trim().replace(/^"(.*)"$/, '$1');
  if (!wanted) return null;

  const hasSeparator = wanted.includes('/') || wanted.includes('\\');
  const extensions = extensionsFor(wanted);

  if (path.isAbsolute(wanted) || hasSeparator) {
    const base = path.isAbsolute(wanted) ? wanted : path.resolve(wanted);
    for (const ext of extensions) {
      const candidate = `${base}${ext}`;
      if (isExecutable(candidate)) return candidate;
    }
    return null;
  }

  const dirs = String(process.env.PATH || '')
    .split(path.delimiter)
    .map((dir) => dir.trim().replace(/^"(.*)"$/, '$1'))
    .filter(Boolean);

  for (const dir of dirs) {
    for (const ext of extensions) {
      const candidate = path.join(dir, `${wanted}${ext}`);
      if (isExecutable(candidate)) return candidate;
    }
  }
  return null;
}

function wellKnownBinaries() {
  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
    const programData = process.env.ProgramData || 'C:\\ProgramData';
    const localAppData = process.env.LOCALAPPDATA || '';
    return [
      path.join(programFiles, 'Docker', 'Docker', 'resources', 'bin', 'docker.exe'),
      path.join(programData, 'DockerDesktop', 'version-bin', 'docker.exe'),
      localAppData ? path.join(localAppData, 'Docker', 'cli-bin', 'docker.exe') : null,
      localAppData ? path.join(localAppData, 'Programs', 'Docker', 'Docker', 'resources', 'bin', 'docker.exe') : null,
    ].filter(Boolean);
  }

  return [
    '/usr/bin/docker',
    '/usr/local/bin/docker',
    '/snap/bin/docker',
    '/opt/homebrew/bin/docker',
    '/opt/bin/docker',
    path.join(os.homedir(), '.docker', 'bin', 'docker'),
    path.join(os.homedir(), '.local', 'bin', 'docker'),
  ];
}

function detect(configured) {
  const wanted = String(configured || 'docker').trim() || 'docker';
  const explicit = wanted !== 'docker';

  let binary = lookupOnPath(wanted);
  let source = binary ? (explicit ? 'configured' : 'path') : null;

  // A stale/incorrect LAB_DOCKER_BINARY must not break an otherwise working host.
  if (!binary && explicit) {
    binary = lookupOnPath('docker');
    if (binary) source = 'path';
  }

  if (!binary) {
    for (const candidate of wellKnownBinaries()) {
      if (isExecutable(candidate)) {
        binary = candidate;
        source = 'detected';
        break;
      }
    }
  }

  return {
    configured: wanted,
    binary: binary || wanted,
    found: Boolean(binary),
    source: source || 'missing',
  };
}

let cache = { key: null, at: 0, value: null };

/** Resolves the Docker CLI. Cached; missing results are re-checked quickly. */
export function resolveDockerBinary(configured = 'docker') {
  const key = String(configured || 'docker');
  const now = Date.now();
  if (
    cache.value &&
    cache.key === key &&
    (cache.value.found || now - cache.at < MISSING_TTL_MS)
  ) {
    return cache.value;
  }
  const value = detect(key);
  cache = { key, at: now, value };
  return value;
}

/** Human-readable hint for operators when the CLI cannot be located. */
export function dockerBinaryHint(resolved) {
  const tried = resolved?.configured && resolved.configured !== 'docker'
    ? ` (LAB_DOCKER_BINARY="${resolved.configured}")`
    : '';
  return [
    `Docker CLI was not found${tried}.`,
    'Install Docker Engine / Docker Desktop on this host, make sure the API process can see it on PATH,',
    'or set LAB_DOCKER_BINARY to the full path (for example /usr/bin/docker).',
  ].join(' ');
}

export default resolveDockerBinary;
