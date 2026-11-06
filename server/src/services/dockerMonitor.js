import { query, withTransaction } from '../config/db.js';
import logger from '../config/logger.js';
import { getProvider } from '../labs/providers/index.js';
import { hostForSession } from './labServers.js';
import { isRemoteAgent } from './labServers.js';
import { agentClient } from '../labs/remote/agentClient.js';
import { badRequest, notFound } from '../utils/errors.js';
import { studentIdentity } from '../labs/identity.js';

/**
 * Records a container lifecycle event in the PostgreSQL database.
 */
export async function recordContainerEvent({
  containerId,
  sessionId = null,
  userId = null,
  labId = null,
  event,
  details = {},
}) {
  if (!containerId) return;
  try {
    await query(
      `INSERT INTO container_lifecycle_events
         (container_id, session_id, user_id, lab_id, event, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        String(containerId),
        sessionId ? Number(sessionId) : null,
        userId ? Number(userId) : null,
        labId ? Number(labId) : null,
        String(event),
        JSON.stringify(details || {}),
      ]
    );

    if (userId) {
      await query(
        `INSERT INTO activity_events (user_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'container', $3, $4)`,
        [
          Number(userId),
          `container.${event}`,
          sessionId ? Number(sessionId) : null,
          JSON.stringify({ containerId, labId, ...details }),
        ]
      ).catch(() => {});
    }
  } catch (err) {
    logger.warn('Failed to record container lifecycle event', {
      error: err.message,
      event,
      containerId,
    });
  }
}

/** Formats duration between two timestamps into readable text */
export function formatDuration(startedAt, endedAt = null) {
  if (!startedAt) return '0s';
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const diffSec = Math.max(0, Math.floor((end - start) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m`;
}

/**
 * Runs `docker stats --no-stream` across the requested host to collect
 * real-time CPU, RAM, Network and PID metrics for all running containers.
 */
export async function fetchDockerStatsForHost(host = null) {
  const statsMap = new Map();
  try {
    const provider = getProvider('docker');
    const result = await provider.run(
      [
        'stats',
        '--no-stream',
        '--format',
        '{"id":"{{.ID}}","name":"{{.Name}}","cpu":"{{.CPUPerc}}","mem":"{{.MemUsage}}","memPerc":"{{.MemPerc}}","netIO":"{{.NetIO}}","blockIO":"{{.BlockIO}}","pids":"{{.PIDs}}"}',
      ],
      { host, timeoutMs: 6000 }
    );

    if (result.exitCode === 0 && result.stdout) {
      const lines = result.stdout.trim().split(/\r?\n/);
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line.trim());
          if (parsed.name) statsMap.set(parsed.name, parsed);
          if (parsed.id) statsMap.set(parsed.id, parsed);
        } catch {
          // ignore malformed line
        }
      }
    }
  } catch (err) {
    logger.debug('Docker stats fetch failed for host', { host, error: err.message });
  }
  return statsMap;
}

/**
 * Retrieves the full live list of containers for Admin live monitoring.
 */
export async function getLiveContainers(
  { status = 'all', search = '', page = 1, limit = 50 } = {},
  isTerminalConnectedFn = null
) {
  const where = [`s.provider = 'docker'`, `s.instance_id IS NOT NULL`];
  const params = [];

  if (status && status !== 'all') {
    params.push(status);
    where.push(`s.status = $${params.length}`);
  }

  if (search && search.trim()) {
    params.push(`%${search.trim()}%`);
    where.push(
      `(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR l.title ILIKE $${params.length} OR s.instance_id ILIKE $${params.length} OR s.id::text ILIKE $${params.length})`
    );
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows: countRows } = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE s.status = 'running')::int AS running,
       COUNT(*) FILTER (WHERE s.status = 'stopped')::int AS stopped,
       COUNT(*) FILTER (WHERE s.status = 'error')::int AS error,
       COUNT(*) FILTER (WHERE s.status = 'provisioning')::int AS provisioning
     FROM lab_sessions s
     JOIN users u ON u.id = s.user_id
     JOIN labs l ON l.id = s.lab_id
     LEFT JOIN lab_servers srv ON srv.id = s.lab_server_id
     ${whereSql}`,
    params
  );

  const offset = (Math.max(1, page) - 1) * limit;
  const listParams = [...params, limit, offset];

  const { rows: sessionRows } = await query(
    `SELECT
       s.id AS session_id,
       s.instance_id AS container_id,
       s.lab_id,
       s.user_id AS student_id,
       s.status,
       s.cwd,
       s.started_at,
       s.expires_at,
       s.ended_at,
       s.last_activity_at,
       s.lab_server_id,
       u.full_name AS student_name,
       u.email AS student_email,
       l.title AS lab_title,
       l.slug AS lab_slug,
       l.container_image,
       l.difficulty,
       srv.name AS server_name,
       srv.docker_host AS server_docker_host,
       srv.location AS server_location,
       (SELECT COUNT(*)::int FROM lab_step_progress p WHERE p.session_id = s.id) AS completed_steps,
       (SELECT COUNT(*)::int FROM lab_steps st WHERE st.lab_id = s.lab_id) AS total_steps,
       (SELECT COUNT(*)::int FROM screenshots sc WHERE sc.session_id = s.id) AS screenshot_count
     FROM lab_sessions s
     JOIN users u ON u.id = s.user_id
     JOIN labs l ON l.id = s.lab_id
     LEFT JOIN lab_servers srv ON srv.id = s.lab_server_id
     ${whereSql}
     ORDER BY
       CASE WHEN s.status = 'running' THEN 0 ELSE 1 END,
       s.started_at DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );

  // Group running sessions by host to minimize `docker stats` executions
  const hostsToFetch = new Set();
  for (const session of sessionRows) {
    if (session.status === 'running') {
      hostsToFetch.add(session.server_docker_host || '');
    }
  }

  const hostStatsCache = new Map();
  await Promise.all(
    Array.from(hostsToFetch).map(async (hostVal) => {
      const stats = await fetchDockerStatsForHost(hostVal || null);
      hostStatsCache.set(hostVal, stats);
    })
  );

  let activeCpuSum = 0;
  let activeContainersWithStats = 0;

  const containers = sessionRows.map((row) => {
    const hostStats = hostStatsCache.get(row.server_docker_host || '');
    const liveStat = hostStats ? hostStats.get(row.container_id) : null;

    let cpu = '—';
    let mem = '—';
    let memPerc = '—';
    let netIO = '—';
    let blockIO = '—';
    let pids = '—';

    if (row.status === 'running') {
      if (liveStat) {
        cpu = liveStat.cpu || '0.00%';
        mem = liveStat.mem || '—';
        memPerc = liveStat.memPerc || '0.00%';
        netIO = liveStat.netIO || '0B / 0B';
        blockIO = liveStat.blockIO || '0B / 0B';
        pids = liveStat.pids || '1';

        const cpuNum = parseFloat(cpu.replace('%', ''));
        if (!isNaN(cpuNum)) {
          activeCpuSum += cpuNum;
          activeContainersWithStats += 1;
        }
      } else {
        // Container is listed running in db but stats hasn't reported or daemon is quiet
        cpu = '0.00%';
        mem = 'Active';
      }
    }

    const isConnected = isTerminalConnectedFn
      ? isTerminalConnectedFn(row.session_id)
      : false;

    return {
      sessionId: row.session_id,
      containerId: row.container_id,
      shortId: row.container_id?.slice(0, 12) || '',
      studentId: row.student_id,
      studentName: row.student_name || 'Student',
      studentEmail: row.student_email,
      labId: row.lab_id,
      labTitle: row.lab_title,
      labSlug: row.lab_slug,
      image: row.container_image || 'ubuntu:22.04',
      difficulty: row.difficulty,
      status: row.status,
      cpuUsage: cpu,
      ramUsage: mem,
      ramPerc: memPerc,
      netIO,
      blockIO,
      pids,
      startedAt: row.started_at,
      expiresAt: row.expires_at,
      endedAt: row.ended_at,
      sessionDuration: formatDuration(row.started_at, row.ended_at),
      durationSeconds: Math.floor(
        ((row.ended_at ? new Date(row.ended_at).getTime() : Date.now()) -
          new Date(row.started_at).getTime()) /
          1000
      ),
      server: {
        id: row.lab_server_id || null,
        name: row.server_name || 'Ubuntu Lab Host (Default)',
        location: row.server_location || 'Local Engine',
        host: row.server_docker_host || 'local daemon',
      },
      terminalConnected: isConnected,
      terminalStatus: isConnected ? 'connected' : 'disconnected',
      progress: {
        completed: row.completed_steps,
        total: row.total_steps,
      },
      screenshotCount: row.screenshot_count,
    };
  });

  const counts = countRows[0] || {
    total: 0,
    running: 0,
    stopped: 0,
    error: 0,
    provisioning: 0,
  };

  return {
    containers,
    total: counts.total,
    counts: {
      total: counts.total,
      running: counts.running,
      stopped: counts.stopped,
      error: counts.error,
      provisioning: counts.provisioning,
      avgCpu:
        activeContainersWithStats > 0
          ? `${(activeCpuSum / activeContainersWithStats).toFixed(2)}%`
          : '0.00%',
    },
    page,
    limit,
  };
}

/**
 * Returns inspect details, live stats, and lifecycle events for a specific container/session.
 */
export async function getContainerDetails(sessionId) {
  const { rows } = await query(
    `SELECT s.*,
            u.full_name AS student_name, u.email AS student_email, u.role AS student_role,
            l.title AS lab_title, l.slug AS lab_slug, l.container_image, l.estimated_minutes,
            l.difficulty, l.network_enabled,
            srv.name AS server_name, srv.docker_host AS server_docker_host, srv.location AS server_location
     FROM lab_sessions s
     JOIN users u ON u.id = s.user_id
     JOIN labs l ON l.id = s.lab_id
     LEFT JOIN lab_servers srv ON srv.id = s.lab_server_id
     WHERE s.id = $1`,
    [sessionId]
  );

  const session = rows[0];
  if (!session) throw notFound('Container session not found.');

  let dockerInspect = null;
  const server = await hostForSession(session);
  const provider = getProvider('docker');

  if (session.instance_id) {
    try {
      const inspectRes = await provider.run(['inspect', session.instance_id], {
        host: server?.host || null,
        timeoutMs: 6000,
      });
      if (inspectRes.exitCode === 0 && inspectRes.stdout) {
        const parsed = JSON.parse(inspectRes.stdout);
        dockerInspect = parsed[0] || null;
      }
    } catch {
      // inspect might fail if container was removed
    }
  }

  // Fetch recent lifecycle events for this container
  // Wrapped in try/catch in case migration 018 hasn't run yet on the server
  let events = [];
  try {
    const { rows: eventRows } = await query(
      `SELECT id, event, details, created_at
       FROM container_lifecycle_events
       WHERE session_id = $1 OR container_id = $2
       ORDER BY created_at DESC LIMIT 50`,
      [sessionId, session.instance_id]
    );
    events = eventRows;
  } catch {
    // Table may not exist yet — return empty array gracefully
  }

  return {
    session: {
      id: session.id,
      containerId: session.instance_id,
      status: session.status,
      cwd: session.cwd,
      startedAt: session.started_at,
      expiresAt: session.expires_at,
      endedAt: session.ended_at,
      duration: formatDuration(session.started_at, session.ended_at),
    },
    student: {
      id: session.user_id,
      name: session.student_name,
      email: session.student_email,
      role: session.student_role,
    },
    lab: {
      id: session.lab_id,
      title: session.lab_title,
      slug: session.lab_slug,
      image: session.container_image,
      difficulty: session.difficulty,
      networkEnabled: session.network_enabled,
    },
    server: {
      id: session.lab_server_id,
      name: session.server_name || 'Ubuntu Lab Host',
      location: session.server_location || 'Local',
      dockerHost: session.server_docker_host || null,
    },
    docker: dockerInspect
      ? {
          id: dockerInspect.Id,
          created: dockerInspect.Created,
          state: dockerInspect.State,
          network: dockerInspect.NetworkSettings?.Networks,
          ipAddress:
            dockerInspect.NetworkSettings?.IPAddress ||
            Object.values(dockerInspect.NetworkSettings?.Networks || {})[0]?.IPAddress ||
            'isolated/bridge',
          hostConfig: {
            memory: dockerInspect.HostConfig?.Memory,
            cpus: dockerInspect.HostConfig?.NanoCpus ? dockerInspect.HostConfig.NanoCpus / 1e9 : null,
            pidsLimit: dockerInspect.HostConfig?.PidsLimit,
          },
        }
      : null,
    lifecycleEvents: events,
  };
}

/**
 * Returns container stdout/stderr logs for an authorized admin.
 */
export async function getContainerLogs(sessionId, { tail = 250 } = {}) {
  const { rows } = await query(`SELECT * FROM lab_sessions WHERE id = $1`, [sessionId]);
  const session = rows[0];
  if (!session) throw notFound('Session not found.');
  if (!session.instance_id) throw badRequest('This session has no container.');

  const server = await hostForSession(session);
  const provider = getProvider('docker');
  const safeTail = Math.min(1000, Math.max(10, Number(tail) || 250));

  const result = await provider.run(
    ['logs', '--tail', String(safeTail), '--timestamps', session.instance_id],
    {
      host: server?.host || null,
      timeoutMs: 8000,
      maxOutputBytes: 512 * 1024,
    }
  );

  const logs = (result.stdout || '') + (result.stderr ? `\n${result.stderr}` : '');
  return {
    sessionId: session.id,
    containerId: session.instance_id,
    tail: safeTail,
    logs: logs || '(No logs available for this container yet)',
    exitCode: result.exitCode,
  };
}

/**
 * Starts a stopped container.
 */
export async function startContainer(sessionId, adminUser) {
  const { rows } = await query(`SELECT * FROM lab_sessions WHERE id = $1`, [sessionId]);
  const session = rows[0];
  if (!session) throw notFound('Session not found.');
  if (!session.instance_id) throw badRequest('This session has no container.');

  const server = await hostForSession(session);
  const provider = getProvider('docker');

  const result = await provider.run(['start', session.instance_id], {
    host: server?.host || null,
    timeoutMs: 20000,
  });

  if (result.exitCode !== 0) {
    throw badRequest(`Failed to start container: ${result.stderr || result.stdout || 'Unknown error'}`);
  }

  await query(
    `UPDATE lab_sessions SET status = 'running', ended_at = NULL WHERE id = $1`,
    [sessionId]
  );

  await recordContainerEvent({
    containerId: session.instance_id,
    sessionId: session.id,
    userId: adminUser?.id || null,
    labId: session.lab_id,
    event: 'started',
    details: { startedBy: 'admin', adminName: adminUser?.full_name || 'Admin' },
  });

  return { ok: true, sessionId, status: 'running' };
}

/**
 * Gracefully stops a running container.
 */
export async function stopContainer(sessionId, adminUser) {
  const { rows } = await query(`SELECT * FROM lab_sessions WHERE id = $1`, [sessionId]);
  const session = rows[0];
  if (!session) throw notFound('Session not found.');
  if (!session.instance_id) throw badRequest('This session has no container.');

  const server = await hostForSession(session);
  const provider = getProvider('docker');

  if (isRemoteAgent(server?.server)) {
    await agentClient.stop(server.server, session.instance_id, { cwd: session.cwd, fsState: session.fs_state }, 20000);
    await query(`UPDATE lab_sessions SET status = 'stopped', ended_at = now() WHERE id = $1`, [sessionId]);
    await recordContainerEvent({ containerId: session.instance_id, sessionId: session.id, userId: adminUser?.id || null, labId: session.lab_id, event: 'stopped', details: { stoppedBy: 'admin', adminName: adminUser?.full_name || 'Admin', remote: true } });
    return { ok: true, sessionId, status: 'stopped' };
  }

  const result = await provider.run(['stop', '-t', '10', session.instance_id], {
    host: server?.host || null,
    timeoutMs: 20000,
  });

  await query(
    `UPDATE lab_sessions SET status = 'stopped', ended_at = now() WHERE id = $1`,
    [sessionId]
  );

  await recordContainerEvent({
    containerId: session.instance_id,
    sessionId: session.id,
    userId: adminUser?.id || null,
    labId: session.lab_id,
    event: 'stopped',
    details: { stoppedBy: 'admin', adminName: adminUser?.full_name || 'Admin' },
  });

  return { ok: true, sessionId, status: 'stopped' };
}

/**
 * Restarts a container.
 */
export async function restartContainer(sessionId, adminUser) {
  const { rows } = await query(`SELECT * FROM lab_sessions WHERE id = $1`, [sessionId]);
  const session = rows[0];
  if (!session) throw notFound('Session not found.');
  if (!session.instance_id) throw badRequest('This session has no container.');

  const server = await hostForSession(session);
  const provider = getProvider('docker');

  if (isRemoteAgent(server?.server)) {
    const res = await agentClient.restart(server.server, session.instance_id, { cwd: session.cwd, fsState: session.fs_state }, 30000);
    if (!res.ok) throw badRequest(`Failed to restart remote container: ${res.error || 'Unknown error'}`);
    await query(`UPDATE lab_sessions SET status = 'running', ended_at = NULL WHERE id = $1`, [sessionId]);
    await recordContainerEvent({ containerId: session.instance_id, sessionId: session.id, userId: adminUser?.id || null, labId: session.lab_id, event: 'restarted', details: { restartedBy: 'admin', adminName: adminUser?.full_name || 'Admin', remote: true } });
    return { ok: true, sessionId, status: 'running' };
  }

  const result = await provider.run(['restart', '-t', '10', session.instance_id], {
    host: server?.host || null,
    timeoutMs: 25000,
  });

  if (result.exitCode !== 0) {
    throw badRequest(`Failed to restart container: ${result.stderr || result.stdout || 'Unknown error'}`);
  }

  await query(
    `UPDATE lab_sessions SET status = 'running', ended_at = NULL WHERE id = $1`,
    [sessionId]
  );

  await recordContainerEvent({
    containerId: session.instance_id,
    sessionId: session.id,
    userId: adminUser?.id || null,
    labId: session.lab_id,
    event: 'restarted',
    details: { restartedBy: 'admin', adminName: adminUser?.full_name || 'Admin' },
  });

  return { ok: true, sessionId, status: 'running' };
}

/**
 * Resets a student's container: cleans and recreates the container
 * with a fresh environment, while keeping screenshots, step progress,
 * and session records intact.
 */
export async function resetContainer(sessionId, adminUser) {
  const { rows } = await query(
    `SELECT s.*, l.container_image, l.initial_cwd, l.terminal_welcome, l.initial_files,
            l.network_enabled, u.id AS u_id, u.full_name AS student_name, u.email AS student_email
     FROM lab_sessions s
     JOIN labs l ON l.id = s.lab_id
     JOIN users u ON u.id = s.user_id
     WHERE s.id = $1`,
    [sessionId]
  );
  const session = rows[0];
  if (!session) throw notFound('Session not found.');

  const server = await hostForSession(session);
  const provider = getProvider('docker');

  // Deprovision old container
  if (session.instance_id) {
    await provider.run(['rm', '-f', session.instance_id], {
      host: server?.host || null,
      timeoutMs: 20000,
    }).catch(() => {});
  }

  // Provision fresh container for the student with same session
  const identity = studentIdentity({ id: session.u_id, full_name: session.student_name });
  const lab = {
    id: session.lab_id,
    container_image: session.container_image,
    initial_cwd: session.initial_cwd,
    terminal_welcome: session.terminal_welcome,
    initial_files: session.initial_files,
    network_enabled: session.network_enabled,
  };
  const user = { id: session.u_id, full_name: session.student_name };

  const descriptor = await provider.provision({
    lab,
    user,
    host: server?.host || null,
    serverId: session.lab_server_id,
  });

  await query(
    `UPDATE lab_sessions
     SET instance_id = $1, status = 'running', cwd = $2, fs_state = $3, ended_at = NULL
     WHERE id = $4`,
    [descriptor.instanceId, descriptor.cwd, JSON.stringify(descriptor.fsState || {}), sessionId]
  );

  await recordContainerEvent({
    containerId: descriptor.instanceId,
    sessionId: session.id,
    userId: adminUser?.id || null,
    labId: session.lab_id,
    event: 'reset',
    details: {
      resetBy: 'admin',
      adminName: adminUser?.full_name || 'Admin',
      previousContainerId: session.instance_id,
    },
  });

  return {
    ok: true,
    sessionId,
    newContainerId: descriptor.instanceId,
    status: 'running',
  };
}

/**
 * Force removes a container, marks the session as stopped, and preserves
 * all student submission progress, screenshots, and evidence in PostgreSQL.
 */
export async function removeContainer(sessionId, adminUser) {
  const { rows } = await query(`SELECT * FROM lab_sessions WHERE id = $1`, [sessionId]);
  const session = rows[0];
  if (!session) throw notFound('Session not found.');

  const server = await hostForSession(session);
  const provider = getProvider('docker');

  if (session.instance_id) {
    if (isRemoteAgent(server?.server)) {
      await agentClient.remove(server.server, session.instance_id, { cwd: session.cwd, fsState: session.fs_state }, 20000).catch(() => {});
    } else {
      await provider.run(['rm', '-f', session.instance_id], {
        host: server?.host || null,
        timeoutMs: 20000,
      }).catch(() => {});
    }
  }

  await query(
    `UPDATE lab_sessions SET status = 'stopped', ended_at = now() WHERE id = $1`,
    [sessionId]
  );

  await recordContainerEvent({
    containerId: session.instance_id,
    sessionId: session.id,
    userId: adminUser?.id || null,
    labId: session.lab_id,
    event: 'removed',
    details: { removedBy: 'admin', adminName: adminUser?.full_name || 'Admin' },
  });

  return { ok: true, sessionId, status: 'stopped' };
}

