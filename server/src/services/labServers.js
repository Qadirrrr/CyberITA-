import { query } from '../config/db.js';
import { AppError, badRequest, notFound } from '../utils/errors.js';

/**
 * Admin-managed lab servers.
 *
 * A lab server is a Docker host (local daemon or a remote `DOCKER_HOST`) that
 * runs student containers. Administrators register servers, give each lab a
 * server, and the provider starts that lab's sessions on the assigned host.
 * Every student still gets an isolated container; the server only decides
 * *where* it runs.
 */

export const LAB_SERVER_STATUSES = ['active', 'maintenance', 'disabled'];

const SERVER_COLUMNS = `id, name, provider, docker_host, location, description,
  max_sessions, status, created_by, created_at, updated_at`;

// Docker connection strings we accept. An empty value means "the API host's
// default daemon" (LAB_DOCKER_HOST / local socket).
const HOST_PATTERN = /^(ssh|tcp|unix|npipe|fd):\/\/?[^\s"'`]{1,480}$/;

export function isValidDockerHost(value) {
  if (value == null || value === '') return true;
  return typeof value === 'string' && HOST_PATTERN.test(value.trim());
}

export function isLocalHost(value) {
  return value == null || String(value).trim() === '';
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

export async function createLabServer({ name, provider = 'docker', dockerHost = null, location = '', description = '', maxSessions = 0, status = 'active' }, user) {
  if (!isValidDockerHost(dockerHost)) throw badRequest('Use a docker host URI such as ssh://user@host, tcp://host:2376 or leave it empty for the local daemon.');
  const { rows } = await query(
    `INSERT INTO lab_servers (name, provider, docker_host, location, description, max_sessions, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${SERVER_COLUMNS}`,
    [name, provider, dockerHost || null, location, description, maxSessions, status, user?.id ?? null]
  );
  return rows[0];
}

export async function updateLabServer(id, patch) {
  const current = await getLabServer(id);
  if (patch.dockerHost !== undefined && !isValidDockerHost(patch.dockerHost)) {
    throw badRequest('Use a docker host URI such as ssh://user@host, tcp://host:2376 or leave it empty for the local daemon.');
  }
  const nextHost = patch.dockerHost !== undefined ? patch.dockerHost || null : current.docker_host;
  if (nextHost !== current.docker_host) {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS running FROM lab_sessions WHERE lab_server_id = $1 AND status = 'running'`,
      [id]
    );
    if (rows[0].running > 0) {
      throw badRequest(
        `This server has ${rows[0].running} running lab session(s). Stop them before changing its Docker host.`
      );
    }
  }
  const next = {
    name: patch.name ?? current.name,
    provider: patch.provider ?? current.provider,
    dockerHost: patch.dockerHost !== undefined ? patch.dockerHost || null : current.docker_host,
    location: patch.location ?? current.location,
    description: patch.description ?? current.description,
    maxSessions: patch.maxSessions ?? current.max_sessions,
    status: patch.status ?? current.status,
  };
  const { rows } = await query(
    `UPDATE lab_servers SET
       name = $1, provider = $2, docker_host = $3, location = $4,
       description = $5, max_sessions = $6, status = $7, updated_at = now()
     WHERE id = $8
     RETURNING ${SERVER_COLUMNS}`,
    [next.name, next.provider, next.dockerHost, next.location, next.description, next.maxSessions, next.status, id]
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

/** The server assigned to a lab, or null when the lab uses the default host. */
export async function serverForLab(lab) {
  if (!lab?.lab_server_id) return null;
  const { rows } = await query(`SELECT ${SERVER_COLUMNS} FROM lab_servers WHERE id = $1`, [lab.lab_server_id]);
  return rows[0] || null;
}

/** Host recorded on a session (used when stopping / cleaning up containers). */
export async function hostForSession(session) {
  if (!session?.lab_server_id) return null;
  const { rows } = await query('SELECT docker_host, status, name FROM lab_servers WHERE id = $1', [session.lab_server_id]);
  const server = rows[0];
  if (!server) return null;
  return { host: server.docker_host || null, name: server.name, status: server.status };
}

/**
 * Verifies an assigned server can accept a new session right now.
 * Returns {host, server} for the provider call.
 */
export async function resolveServerForNewSession(lab) {
  const server = await serverForLab(lab);
  if (!server) return { host: null, server: null };

  if (server.status !== 'active') {
    const error = new AppError(
      `The lab server "${server.name}" is ${server.status === 'maintenance' ? 'under maintenance' : 'disabled'}. Ask an administrator to enable it.`,
      503,
      'lab_server_unavailable'
    );
    error.expose = true;
    throw error;
  }

  if (Number(server.max_sessions) > 0) {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS running FROM lab_sessions WHERE lab_server_id = $1 AND status = 'running'`,
      [server.id]
    );
    if (rows[0].running >= Number(server.max_sessions)) {
      const error = new AppError(
        `The lab server "${server.name}" is at capacity (${rows[0].running}/${server.max_sessions} sessions). Try again shortly.`,
        503,
        'lab_server_capacity'
      );
      error.expose = true;
      throw error;
    }
  }

  return { host: server.docker_host || null, server };
}
