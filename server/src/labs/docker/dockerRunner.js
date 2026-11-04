import { spawn } from 'node:child_process';

function appendChunk(current, chunk, limit) {
  if (Buffer.byteLength(current) >= limit) return { value: current, truncated: true };
  const next = current + chunk.toString('utf8');
  if (Buffer.byteLength(next) <= limit) return { value: next, truncated: false };
  return { value: next.slice(0, limit), truncated: true };
}

export function runDocker(binary, args, { input, timeoutMs = 30000, maxOutputBytes = 1024 * 1024, env = {}, onStdout, onStderr } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;
    let spawnError = null;
    let child;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    try {
      child = spawn(binary, args, {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...env },
      });
    } catch (error) {
      finish({ exitCode: 1, stdout, stderr: error.message, spawnError: error, timedOut, truncated });
      return;
    }

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.on('error', (error) => {
      spawnError = error;
    });

    child.stdin.on('error', () => {});

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      if (typeof onStdout === 'function') {
        try { onStdout(text); } catch { /* ignore */ }
      }
      const appended = appendChunk(stdout, chunk, maxOutputBytes);
      stdout = appended.value;
      truncated = truncated || appended.truncated;
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8');
      if (typeof onStderr === 'function') {
        try { onStderr(text); } catch { /* ignore */ }
      }
      const appended = appendChunk(stderr, chunk, maxOutputBytes);
      stderr = appended.value;
      truncated = truncated || appended.truncated;
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      finish({
        exitCode: typeof code === 'number' ? code : 1,
        stdout,
        stderr,
        spawnError,
        timedOut,
        truncated,
      });
    });

    if (input == null) child.stdin.end();
    else child.stdin.end(input);
  });
}

export function dockerFailure(result, fallback = 'Docker command failed.') {
  if (result.spawnError?.code === 'ENOENT') return 'Docker CLI is not installed or is not on PATH.';
  if (result.timedOut) return `${fallback} The Docker command timed out.`;
  const detail = String(result.stderr || result.stdout || '').trim().split(/\r?\n/).filter(Boolean).slice(-3).join(' ');
  return detail ? `${fallback} ${detail}` : fallback;
}

export default runDocker;
