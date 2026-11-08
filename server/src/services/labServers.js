import { query } from '../config/db.js';
import { AppError, badRequest, notFound, unauthorized } from '../utils/errors.js';
import { encryptSecret, decryptSecret, hashSecret, timingSafeEqualSecret } from '../utils/secretCrypto.js';

export const LAB_SERVER_STATUSES = ['active', 'maintenance', 'disabled', 'offline'];

const SERVER_COLUMNS = '*';

const HOST_PATTERN = /^(ssh|tcp|unix|npipe|fd):\/\/?[^\s"'`]{1,480}$/;

export function isValidDockerHost(value) {
  if (value == null || value === '') return true;
  return typeof value === 'string' && HOST_PATTERN.test(value.trim());
}

export function isLocalHost(value) {
  return value == null || String(value).trim() === '';
}

export function isRemoteAgent(server) {
  return Boolean(server && server.server_type === 'remote-agent' && server.agent_url);
}

export async function listLabServers() {
  const { rows } = await query(
    `SELECT s.*,
            (SELECT COUNT(*)::int FROM labs l WHERE l.lab_server_id = s.id) AS assigned_labs,
            (SELECT COUNT(*)::int FROM lab_sessions ls
              WHERE ls.lab_server_id = s.id AND ls.status = 'running') AS running_sessions
     FROM lab_servers s
     ORDER BY s.status = 'active' DESC, lower(s.name)`
  );
  return rows;
}

export async function getLabServer(id) {
  const { rows } = await query(`SELECT ${SERVER_COLUMNS} FROM lab_servers WHERE id = $1`, [id]);
  if (!rows[0]) throw notFound('Lab server not found.');
  return rows[0];
}

export async function getLabServerByAgentUrl(agentUrl) {
  if (!agentUrl) return null;
  const clean = String(agentUrl).trim().replace(/\/+$/, '');
  const withPort = /:\d+$/.test(clean) ? clean : `${clean}:9100`;
  const withoutPort = clean.replace(/:\d+$/, '');
  const { rows } = await query(
    `SELECT ${SERVER_COLUMNS} FROM lab_servers
     WHERE agent_url = $1 OR agent_url = $2 OR agent_url = $3
     LIMIT 1`,
    [clean, withPort, withoutPort]
  );
  return rows[0] || null;
}

export async function createLabServer(input, user) {
  const {
    name,
    provider = 'docker',
    dockerHost = null,
    location = '',
    description = '',
    maxSessions = 0,
    status = 'active',
    serverType = 'local',
    agentUrl = null,
    agentSecret = null,
  } = input || {};

  if (!isValidDockerHost(dockerHost)) throw badRequest('Use a docker host URI or leave it empty for the local daemon.');
  if (serverType === 'remote-agent' && !agentUrl) throw badRequest('Remote agent servers require an agent URL.');
  if (serverType === 'remote-agent' && !agentSecret) throw badRequest('Remote agent servers require an agent secret.');

  const { rows } = await query(
    `INSERT INTO lab_servers
       (name, provider, docker_host, location, description, max_sessions, status,
        server_type, agent_url, agent_secret_hash, agent_secret_encrypted, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING ${SERVER_COLUMNS}`,
    [
      name, provider, dockerHost || null, location, description, maxSessions, status,
      serverType, agentUrl || null,
      agentSecret ? hashSecret(agentSecret) : null,
      agentSecret ? encryptSecret(agentSecret) : null,
      user?.id ?? null,
    ]
  );
  return rows[0];
}

export async function updateLabServer(id, patch) {
  const current = await getLabServer(id);
  if (patch.dockerHost !== undefined && !isValidDockerHost(patch.dockerHost)) {
    throw badRequest('Use a docker host URI or leave it empty for the local daemon.');
  }
  const nextHost = patch.dockerHost !== undefined ? patch.dockerHost || null : current.docker_host;
  if (nextHost !== current.docker_host) {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS running FROM lab_sessions WHERE lab_server_id = $1 AND status = 'running'`,
      [id]
    );
    if (rows[0].running > 0) {
      throw badRequest(`This server has ${rows[0].running} running lab session(s). Stop them before changing its Docker host.`);
    }
  }

  const agentSecret = patch.agentSecret !== undefined ? patch.agentSecret : undefined;
  const next = {
    name: patch.name ?? current.name,
    provider: patch.provider ?? current.provider,
    dockerHost: nextHost,
    location: patch.location ?? current.location,
    description: patch.description ?? current.description,
    maxSessions: patch.maxSessions ?? current.max_sessions,
    status: patch.status ?? current.status,
    serverType: patch.serverType ?? current.server_type,
    agentUrl: patch.agentUrl !== undefined ? patch.agentUrl || null : current.agent_url,
    agentSecretHash: agentSecret !== undefined ? (agentSecret ? hashSecret(agentSecret) : null) : current.agent_secret_hash,
    agentSecretEncrypted: agentSecret !== undefined ? (agentSecret ? encryptSecret(agentSecret) : null) : current.agent_secret_encrypted,
  };

  const { rows } = await query(
    `UPDATE lab_servers SET
       name = $1, provider = $2, docker_host = $3, location = $4,
       description = $5, max_sessions = $6, status = $7,
       server_type = $8, agent_url = $9,
       agent_secret_hash = $10, agent_secret_encrypted = $11,
       updated_at = now()
     WHERE id = $12
     RETURNING ${SERVER_COLUMNS}`,
    [next.name, next.provider, next.dockerHost, next.location, next.description, next.maxSessions, next.status,
     next.serverType, next.agentUrl, next.agentSecretHash, next.agentSecretEncrypted, id]
  );
  return rows[0];
}

export async function deleteLabServer(id) {
  const server = await getLabServer(id);
  const { rows } = await query(
    `SELECT COUNT(*)::int AS running FROM lab_sessions WHERE lab_server_id = $1 AND status = 'running'`,
    [id]
  );
  if (rows[0].running > 0) {
    throw badRequest(`This server still has ${rows[0].running} running lab session(s). Stop them before deleting it.`);
  }
  await query('DELETE FROM lab_servers WHERE id = $1', [server.id]);
  return { ok: true, id: server.id, name: server.name };
}

export async function serverForLab(lab) {
  if (!lab?.lab_server_id) return null;
  const { rows } = await query(`SELECT ${SERVER_COLUMNS} FROM lab_servers WHERE id = $1`, [lab.lab_server_id]);
  return rows[0] || null;
}

export async function hostForSession(session) {
  if (!session?.lab_server_id) return { host: null, name: null, status: null, server: null };
  const { rows } = await query(`SELECT ${SERVER_COLUMNS} FROM lab_servers WHERE id = $1`, [session.lab_server_id]);
  const server = rows[0];
  if (!server) return { host: null, name: null, status: null, server: null };
  const host = isRemoteAgent(server) ? server.agent_url : (server.docker_host || null);
  return { host, name: server.name, status: server.status, server };
}

export async function reserveCapacity(serverId) {
  const { rows } = await query(
    `UPDATE lab_servers
        SET active_sessions = active_sessions + 1, updated_at = now()
      WHERE id = $1
        AND status = 'active'
        AND (max_sessions = 0 OR active_sessions < max_sessions)
        AND (docker_available IS NULL OR docker_available = TRUE)
        AND (cpu_percent IS NULL OR cpu_percent < 90)
        AND (memory_total_mb IS NULL OR memory_total_mb = 0 OR memory_used_mb::float / memory_total_mb < 0.95)
        AND (disk_total_gb IS NULL OR disk_total_gb = 0 OR disk_used_gb::float / disk_total_gb < 0.95)
        AND (server_type <> 'remote-agent' OR last_heartbeat_at IS NULL OR last_heartbeat_at > now() - interval '2 minutes')
      RETURNING ${SERVER_COLUMNS}`,
    [serverId]
  );
  if (!rows[0]) {
    const server = await getLabServer(serverId);
    if (server.status !== 'active') throw badRequest(`Server "${server.name}" is ${server.status}.`);
    if (server.max_sessions > 0 && server.active_sessions >= server.max_sessions) throw badRequest(`Server "${server.name}" is at capacity (${server.active_sessions}/${server.max_sessions}).`);
    if (server.docker_available === false) throw badRequest(`Docker is not available on "${server.name}".`);
    if (isRemoteAgent(server) && server.last_heartbeat_at && new Date(server.last_heartbeat_at) < new Date(Date.now() - 120000)) throw badRequest(`Server "${server.name}" is offline (no heartbeat).`);
    throw badRequest(`Server "${server.name}" cannot accept new sessions.`);
  }
  return rows[0];
}

export async function releaseCapacity(serverId) {
  if (!serverId) return;
  await query(`UPDATE lab_servers SET active_sessions = GREATEST(active_sessions - 1, 0), updated_at = now() WHERE id = $1`, [serverId]);
}

export async function registerAgent(input) {
  const { agentUrl, agentName, agentSecret, capacity, version } = input || {};
  if (!agentUrl || !agentSecret) throw badRequest('agent_url and agent_secret are required.');
  const server = await getLabServerByAgentUrl(agentUrl);
  if (!server) throw notFound('Lab server not registered by admin. Create it in Admin → Lab Infrastructure first.');
  const stored = decryptSecret(server.agent_secret_encrypted);
  if (!stored || stored !== agentSecret) throw unauthorized('Invalid agent secret.');
  // Registration must not override an admin-disabled/maintenance server.
  const { rows } = await query(
    `UPDATE lab_servers SET
       name = COALESCE($2, name),
       agent_version = $3,
       max_sessions = COALESCE($4, max_sessions),
       status = CASE WHEN status IN ('disabled','maintenance') THEN status ELSE 'active' END,
       last_heartbeat_at = now(),
       updated_at = now()
     WHERE id = $1
     RETURNING ${SERVER_COLUMNS}`,
    [server.id, agentName || null, version || null, capacity ? Number(capacity) : null]
  );
  return rows[0];
}

export async function recordAgentHeartbeat(input) {
  const cpuPercent = input?.cpuPercent ?? input?.cpu_percent;
  const memoryUsedMb = input?.memoryUsedMb ?? input?.memory_used_mb;
  const memoryTotalMb = input?.memoryTotalMb ?? input?.memory_total_mb;
  const diskUsedGb = input?.diskUsedGb ?? input?.disk_used_gb;
  const diskTotalGb = input?.diskTotalGb ?? input?.disk_total_gb;
  const dockerAvailable = input?.dockerAvailable ?? input?.docker_available;
  const dockerReason = input?.dockerReason ?? input?.docker_reason;
  const runningContainers = input?.runningContainers ?? input?.running_containers;
  const capacity = input?.capacity;
  const agentName = input?.agentName ?? input?.agent_name;
  const agentVersion = input?.agentVersion ?? input?.agent_version;
  const agentUrl = input?.agentUrl ?? input?.agent_url;
  const agentSecret = input?.agentSecret ?? input?.agent_secret;
  const server = await getLabServerByAgentUrl(agentUrl);
  if (!server) throw notFound('Lab server not registered by admin.');
  const stored = decryptSecret(server.agent_secret_encrypted);
  if (!stored || stored !== agentSecret) throw unauthorized('Invalid agent secret.');

  const { rows } = await query(
    `UPDATE lab_servers SET
       name = COALESCE($2, name),
       cpu_percent = $3,
       memory_used_mb = $4,
       memory_total_mb = $5,
       disk_used_gb = $6,
       disk_total_gb = $7,
       docker_available = $8,
       last_error = $9,
       running_containers = $10,
       max_sessions = COALESCE($11, max_sessions),
       agent_version = COALESCE($12, agent_version),
       status = CASE WHEN status IN ('disabled','maintenance') THEN status ELSE 'active' END,
       last_heartbeat_at = now(),
       last_metrics_at = now(),
       updated_at = now()
     WHERE id = $1
     RETURNING ${SERVER_COLUMNS}`,
    [server.id, agentName || null, cpuPercent ?? null, memoryUsedMb ?? null, memoryTotalMb ?? null,
     diskUsedGb ?? null, diskTotalGb ?? null, dockerAvailable ?? null, dockerReason || null,
     runningContainers ?? null, capacity ? Number(capacity) : null, agentVersion || null]
  );
  return rows[0];
}

export async function markStaleServersOffline(thresholdMs = 120000) {
  const { rows } = await query(
    `UPDATE lab_servers
        SET status = 'offline', last_error = 'No heartbeat received', updated_at = now()
      WHERE server_type = 'remote-agent'
        AND status = 'active'
        AND last_heartbeat_at IS NOT NULL
        AND last_heartbeat_at < now() - ($1 || ' milliseconds')::interval
      RETURNING id, name`,
    [thresholdMs]
  );
  for (const server of rows) {
    await query(
      `INSERT INTO lab_server_events (server_id, event_type, severity, message)
       VALUES ($1, 'heartbeat_timeout', 'warning', $2)`,
      [server.id, `Remote lab agent "${server.name}" stopped heartbeating; server marked offline.`]
    ).catch(() => {});
  }
}

export async function resolveServerForNewSession(lab) {
  // If lab has a fixed server, use it (with capacity check).
  if (lab?.lab_server_id) {
    const server = await getLabServer(lab.lab_server_id);
    if (server.status !== 'active') {
      const error = new AppError(`The lab server "${server.name}" is ${server.status}.`, 503, 'lab_server_unavailable');
      error.expose = true;
      throw error;
    }
    // remote agents must be healthy
    if (isRemoteAgent(server) && (!server.last_heartbeat_at || new Date(server.last_heartbeat_at) < new Date(Date.now() - 120000))) {
      const error = new AppError(`The lab server "${server.name}" is offline (no heartbeat).`, 503, 'lab_server_unavailable');
      error.expose = true;
      throw error;
    }
    if (Number(server.max_sessions) > 0 && (server.active_sessions || 0) >= Number(server.max_sessions)) {
      const error = new AppError(`The lab server "${server.name}" is at capacity.`, 503, 'lab_server_capacity');
      error.expose = true;
      throw error;
    }
    const host = isRemoteAgent(server) ? server.agent_url : (server.docker_host || null);
    return { host, server };
  }

  // Otherwise pick best active server with capacity.
  const { rows } = await query(
    `SELECT * FROM lab_servers
      WHERE status = 'active'
        AND (server_type IS NULL OR server_type <> 'remote-agent'
             OR (last_heartbeat_at IS NOT NULL AND last_heartbeat_at > now() - interval '2 minutes'))
        AND (docker_available IS NULL OR docker_available = TRUE)
        AND (cpu_percent IS NULL OR cpu_percent < 90)
        AND (memory_total_mb IS NULL OR memory_total_mb = 0 OR memory_used_mb::float / memory_total_mb < 0.95)
        AND (disk_total_gb IS NULL OR disk_total_gb = 0 OR disk_used_gb::float / disk_total_gb < 0.95)
        AND (max_sessions = 0 OR active_sessions < max_sessions)
      ORDER BY
        (CASE WHEN max_sessions > 0 THEN active_sessions::float / max_sessions ELSE 0 END) ASC,
        COALESCE(cpu_percent, 0) ASC,
        COALESCE(memory_used_mb, 0)::float / NULLIF(memory_total_mb,0) ASC,
        id ASC`
  );
  if (!rows.length) {
    // Servers that are healthy but completely full should show "busy";
    // otherwise (e.g. remote agents are offline) fall back to the default
    // local Docker host so labs keep working (backward compatible).
    const { rows: fullButHealthy } = await query(
      `SELECT COUNT(*)::int AS count
       FROM lab_servers
       WHERE status = 'active'
         AND (server_type IS NULL OR server_type <> 'remote-agent'
              OR (last_heartbeat_at IS NOT NULL AND last_heartbeat_at > now() - interval '2 minutes'))
         AND (docker_available IS NULL OR docker_available = TRUE)
         AND (cpu_percent IS NULL OR cpu_percent < 90)
         AND (memory_total_mb IS NULL OR memory_total_mb = 0 OR memory_used_mb::float / memory_total_mb < 0.95)
         AND (disk_total_gb IS NULL OR disk_total_gb = 0 OR disk_used_gb::float / disk_total_gb < 0.95)
         AND max_sessions > 0 AND active_sessions >= max_sessions`
    );
    if (Number(fullButHealthy[0]?.count || 0) > 0) {
      const error = new AppError('All lab servers are currently busy. Please try again later.', 503, 'lab_servers_busy');
      error.expose = true;
      throw error;
    }
    return { host: null, server: null };
  }
  const server = rows[0];
  const host = isRemoteAgent(server) ? server.agent_url : (server.docker_host || null);
  return { host, server };
}

export { decryptSecret };
