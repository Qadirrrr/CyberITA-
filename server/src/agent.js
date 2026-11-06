import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import DockerLabProvider from './labs/docker/dockerProvider.js';
import env from './config/env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '..');

// Load standard .env then .env.agent override if present
dotenv.config({ path: path.join(serverDir, '.env') });
dotenv.config({ path: path.join(serverDir, '.env.agent'), override: true });

const execFileAsync = promisify(execFile);

const app = express();
app.use(express.json({ limit: '2mb' }));

const AGENT_SECRET = (process.env.AGENT_SECRET || '').trim();
const AGENT_NAME = (process.env.AGENT_NAME || os.hostname()).trim();
const AGENT_PORT = Number(process.env.AGENT_PORT || process.env.PORT || 9100);
const AGENT_URL = (process.env.AGENT_URL || `http://${getLocalIp()}:${AGENT_PORT}`).replace(/\/+$/, '');
const MAIN_SERVER_URL = (process.env.MAIN_SERVER_URL || '').replace(/\/+$/, '');
const AGENT_VERSION = '1.0.0';

const provider = new DockerLabProvider();

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return '127.0.0.1';
}

function agentAuth(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!AGENT_SECRET || token !== AGENT_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

async function collectMetrics() {
  const cpus = os.cpus();
  const load = os.loadavg()[0];
  const cpuPercent = cpus.length ? Math.min(100, (load / cpus.length) * 100) : 0;
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  let diskUsedGb = 0, diskTotalGb = 0;
  try {
    const { stdout } = await execFileAsync('df', ['-BG', '/']);
    const lines = stdout.trim().split('\n');
    if (lines.length >= 2) {
      const parts = lines[1].split(/\s+/);
      diskTotalGb = parseFloat(parts[1]) || 0;
      diskUsedGb = parseFloat(parts[2]) || 0;
    }
  } catch { /* ignore */ }

  let dockerAvailable = false, dockerReason = null;
  try {
    const avail = await provider.isAvailable();
    dockerAvailable = avail.ok;
    dockerReason = avail.reason;
  } catch (e) { dockerReason = e.message; }

  let runningContainers = 0;
  try {
    const r = await provider.run(['ps', '-q'], { timeoutMs: 10000 });
    runningContainers = (r.stdout || '').trim().split('\n').filter(Boolean).length;
  } catch { /* ignore */ }

  return {
    agent_name: AGENT_NAME,
    agent_url: AGENT_URL,
    agent_version: AGENT_VERSION,
    cpu_percent: Number(cpuPercent.toFixed(2)),
    memory_used_mb: Math.round(usedMem / 1024 / 1024),
    memory_total_mb: Math.round(totalMem / 1024 / 1024),
    disk_used_gb: Number(diskUsedGb.toFixed(2)),
    disk_total_gb: Number(diskTotalGb.toFixed(2)),
    docker_available: dockerAvailable,
    docker_reason: dockerReason,
    running_containers: runningContainers,
    capacity: Number(process.env.AGENT_MAX_SESSIONS || 10),
  };
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, name: AGENT_NAME, version: AGENT_VERSION, uptime: process.uptime() });
});

app.get('/metrics', agentAuth, async (_req, res) => {
  res.json(await collectMetrics());
});

app.post('/containers', agentAuth, async (req, res) => {
  try {
    const { lab, user } = req.body || {};
    if (!lab || !user) return res.status(400).json({ error: 'lab and user are required.' });
    const descriptor = await provider.provision({ lab, user });
    res.json(descriptor);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Provision failed.' });
  }
});

app.post('/containers/:id/exec', agentAuth, async (req, res) => {
  try {
    const { command, cwd, fsState, lab } = req.body || {};
    const session = { instance_id: req.params.id, cwd: cwd || '/home/student', fs_state: fsState || {} };
    const terminal = provider.createTerminal(session, lab || { initial_cwd: cwd || '/home/student' });
    const result = await terminal.execute(command, {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message || 'Exec failed.', output: '', exitCode: 1 });
  }
});

app.post('/containers/:id/stop', agentAuth, async (req, res) => {
  try {
    const { cwd, fsState } = req.body || {};
    const session = { instance_id: req.params.id, cwd: cwd || '/home/student', fs_state: fsState || {} };
    await provider.deprovision(session, {});
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Stop failed.' });
  }
});

app.post('/containers/:id/restart', agentAuth, async (req, res) => {
  try {
    const r = await provider.run(['restart', '-t', '10', req.params.id], { timeoutMs: 25000 });
    if (r.exitCode !== 0) return res.status(500).json({ error: r.stderr || r.stdout || 'Restart failed.' });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Restart failed.' });
  }
});

app.delete('/containers/:id', agentAuth, async (req, res) => {
  try {
    const { cwd, fsState } = req.body || {};
    const session = { instance_id: req.params.id, cwd: cwd || '/home/student', fs_state: fsState || {} };
    await provider.deprovision(session, {});
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Remove failed.' });
  }
});

app.get('/containers/:id', agentAuth, async (req, res) => {
  try {
    const r = await provider.run(['inspect', req.params.id, '--format', '{{.State.Status}}'], { timeoutMs: 10000 });
    res.json({ id: req.params.id, status: (r.stdout || '').trim() || 'unknown', running: r.exitCode === 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/containers', agentAuth, async (_req, res) => {
  try {
    const r = await provider.run(['ps', '-a', '--filter', 'label=cyberita.lab=true', '--format', '{{.ID}}|{{.Names}}|{{.Status}}'], { timeoutMs: 15000 });
    const containers = (r.stdout || '').trim().split('\n').filter(Boolean).map((line) => {
      const [id, name, status] = line.split('|');
      return { id, name, status };
    });
    res.json({ containers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/cleanup', agentAuth, async (_req, res) => {
  try {
    const r = await provider.run(['ps', '-a', '--filter', 'label=cyberita.lab=true', '--filter', 'status=exited', '--format', '{{.Names}}'], { timeoutMs: 15000 });
    const names = (r.stdout || '').trim().split('\n').filter(Boolean);
    for (const n of names) await provider.run(['rm', '-f', n], { timeoutMs: 15000 });
    res.json({ removed: names.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

let heartbeatLogged = false;

async function sendHeartbeat() {
  if (!MAIN_SERVER_URL || !AGENT_SECRET) {
    if (!heartbeatLogged) {
      console.warn('[Agent] MAIN_SERVER_URL or AGENT_SECRET is not configured in .env; skipping heartbeat.');
      heartbeatLogged = true;
    }
    return;
  }
  try {
    const m = await collectMetrics();
    const res = await fetch(`${MAIN_SERVER_URL}/api/agents/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AGENT_SECRET}` },
      body: JSON.stringify({ agent_url: AGENT_URL, agent_name: AGENT_NAME, ...m }),
    });

    if (res.ok) {
      if (!heartbeatLogged) {
        console.log(`[Agent] Heartbeat connected successfully to Main Server (${MAIN_SERVER_URL})`);
        heartbeatLogged = true;
      }
    } else {
      const errText = await res.text().catch(() => '');
      console.warn(`[Agent] Heartbeat rejected by Main Server (${res.status}): ${errText}`);
    }

    await fetch(`${MAIN_SERVER_URL}/api/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AGENT_SECRET}` },
      body: JSON.stringify({ agent_url: AGENT_URL, agent_name: AGENT_NAME, capacity: m.capacity, version: AGENT_VERSION }),
    }).catch(() => {});
  } catch (e) {
    console.warn(`[Agent] Heartbeat network error contacting ${MAIN_SERVER_URL}: ${e.message}`);
  }
}

app.listen(AGENT_PORT, () => {
  console.log(`CyberITA Lab Agent listening on ${AGENT_PORT} (url ${AGENT_URL})`);
  sendHeartbeat();
  setInterval(sendHeartbeat, 15000);
});
