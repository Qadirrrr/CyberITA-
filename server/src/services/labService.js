import { query, withTransaction } from '../config/db.js';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { getProvider, getProviderForLab } from '../labs/providers/index.js';
import { normalizeCommand, matchesPattern, slugify } from '../utils/helpers.js';
import { provisionLabSession, getLabSessionStatus, terminateLabSession } from '../labs/vps/vpsGateway.js';
import { notFound, forbidden, badRequest } from '../utils/errors.js';
import { notify, recordActivity } from '../utils/activity.js';
import { recomputeCourseProgress } from '../routes/enrollment.js';
import { assertSessionAccess } from './access.js';
import { hostForSession, resolveServerForNewSession, reserveCapacity, releaseCapacity } from './labServers.js';
import { studentIdentity } from '../labs/identity.js';
import { recordContainerEvent } from './dockerMonitor.js';

const MAX_HISTORY_LINES = 400;

export async function getLab(labId, { staff = false } = {}) {
  const { rows } = await query(`SELECT * FROM labs WHERE id = $1`, [labId]);
  const lab = rows[0];
  if (!lab) throw notFound('Lab not found.');
  if (!staff && lab.status !== 'published') throw notFound('Lab not found.');
  return lab;
}

export async function getLabSteps(labId, { includeAnswers = false } = {}) {
  const { rows } = await query(
    `SELECT id, position, title, instruction, hint, verification,
       ${includeAnswers ? 'expected_command, expected_output_pattern,' : ''}
       points, is_optional
     FROM lab_steps WHERE lab_id = $1 ORDER BY position, id`,
    [labId]
  );
  return rows;
}

async function loadSession(sessionId) {
  const { rows } = await query(
    `SELECT s.*, l.terminal_welcome, l.initial_cwd, l.lesson_id, l.course_id, l.is_practice,
            l.lab_mode, l.task_brief, l.min_evidence, l.vps_profile,
            l.created_by, l.status AS lab_status, l.title AS lab_title,
            srv.name AS lab_server_name,
            u.full_name AS student_name
     FROM lab_sessions s
     JOIN labs l ON l.id = s.lab_id
     JOIN users u ON u.id = s.user_id
     LEFT JOIN lab_servers srv ON srv.id = s.lab_server_id
     WHERE s.id = $1`,
    [sessionId]
  );
  return rows[0] || null;
}

export async function getSessionOr404(sessionId, user) {
  const session = await loadSession(sessionId);
  if (!session) throw notFound('Lab session not found.');
  await assertSessionAccess(user, session);
  return session;
}

/** Provisions (or reuses) a lab session for a user. */
export async function startSession(user, lab) {
  // Real VPS labs provision asynchronously through the gateway (a cloud
  // server takes minutes to boot), so they have their own session-first flow.
  if (lab.lab_mode === 'vps') return startVpsSession(user, lab);
  // Every lab runs in a real container, including open-to-all practice labs.
  // `is_practice` only controls access and grading, never the provider.
  const provider = getProviderForLab(lab);
  const isPractice = Boolean(lab.is_practice);
  const { rows: existing } = await query(
    `SELECT * FROM lab_sessions
     WHERE user_id = $1 AND lab_id = $2 AND provider = $3 AND status = 'running'
       AND (expires_at IS NULL OR expires_at > now())
     ORDER BY id DESC LIMIT 1`,
    [user.id, lab.id, provider.name]
  );
  if (existing[0]) {
    const fullExisting = await loadSession(existing[0].id);
    return { session: fullExisting || existing[0], reused: true };
  }

  // Labs are routed to their assigned Docker server (or the default host).
  const { host, server } = await resolveServerForNewSession(lab);

  // Atomically reserve capacity on the chosen server before provisioning.
  let reservedServer = server;
  if (server?.id) {
    reservedServer = await reserveCapacity(server.id);
  }

  let descriptor;
  try {
    descriptor = await provider.provision({ lab, user, host, server: reservedServer, serverId: reservedServer?.id ?? null });
  } catch (error) {
    if (reservedServer?.id) await releaseCapacity(reservedServer.id).catch(() => {});
    throw error;
  }
  // A lab can set its own time limit. When it does, that limit is the session
  // deadline. Labs without a limit still get the platform TTL so abandoned
  // sessions are always reclaimed.
  const labLimitMinutes = Math.max(0, Number(lab.time_limit_minutes) || 0);
  const sessionMinutes = labLimitMinutes > 0 ? labLimitMinutes : env.labs.sessionTtlMinutes;
  const expiresAt = new Date(Date.now() + sessionMinutes * 60 * 1000);
  let rows;
  try {
    ({ rows } = await query(
      `INSERT INTO lab_sessions
         (lab_id, user_id, provider, instance_id, status, fs_state, cwd, expires_at, lab_server_id)
       VALUES ($1, $2, $3, $4, 'running', $5, $6, $7, $8)
       RETURNING *`,
      [lab.id, user.id, descriptor.provider, descriptor.instanceId, JSON.stringify(descriptor.fsState || {}), descriptor.cwd, expiresAt, reservedServer?.id ?? null]
    ));
  } catch (error) {
    await provider.deprovision({ instance_id: descriptor.instanceId, provider: descriptor.provider }, { host, server: reservedServer }).catch(() => {});
    if (reservedServer?.id) await releaseCapacity(reservedServer.id).catch(() => {});
    throw error;
  }
  const session = rows[0];

  if (descriptor.instanceId && descriptor.provider === 'docker') {
    await recordContainerEvent({
      containerId: descriptor.instanceId,
      sessionId: session.id,
      userId: user.id,
      labId: lab.id,
      event: 'created',
      details: {
        image: lab.container_image,
        provider: descriptor.provider,
        labServerId: reservedServer?.id ?? null,
      },
    }).catch(() => {});
  }

  await withTransaction(async (client) => {
    await recordActivity(client, {
      userId: user.id,
      action: 'lab.started',
      entityType: 'lab',
      entityId: lab.id,
      metadata: { title: lab.title, instanceId: descriptor.instanceId, practice: isPractice },
    });
    await notify(client, {
      userIds: [user.id],
      type: 'lab',
      title: `Lab started: ${lab.title}`,
      body: isPractice
        ? 'Your practice lab container is ready. Install packages and explore freely.'
        : 'Your isolated lab environment is ready in the browser terminal.',
      link: `/labs/${lab.id}`,
    });
  });

  const fullSession = await loadSession(session.id);
  return { session: fullSession || session, reused: false, welcome: descriptor.welcome };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function parseFsState(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function updateVpsFsState(sessionId, patch) {
  const { rows } = await query('SELECT fs_state FROM lab_sessions WHERE id = $1', [sessionId]);
  const state = parseFsState(rows[0]?.fs_state);
  state.vps = { ...(state.vps || {}), ...patch };
  await query('UPDATE lab_sessions SET fs_state = $2 WHERE id = $1', [sessionId, JSON.stringify(state)]);
  return state;
}

async function markVpsSessionError(session, gatewaySessionId, message) {
  await updateVpsFsState(session.id, { error: message }).catch(() => {});
  await query(
    `UPDATE lab_sessions SET status = 'error' WHERE id = $1 AND status = 'provisioning'`,
    [session.id]
  ).catch(() => {});
  if (gatewaySessionId) await terminateLabSession(gatewaySessionId).catch(() => {});
}

/**
 * Background half of a VPS lab start: asks the gateway to provision a real
 * server, then polls until it is active. The lab timer (expires_at) is set
 * only when the server is ready, so provisioning time never eats into the
 * student's lab time. Any failure lands the session in 'error' with the
 * reason stored in fs_state.vps.error for the session page.
 */
async function launchVpsProvisioning(session, lab, user, sessionMinutes) {
  const profileKey = lab.vps_profile || 'ubuntu-basic';
  let gatewaySessionId = null;
  try {
    const result = await provisionLabSession({
      cyberitaSessionId: session.id,
      studentId: user.id,
      studentName: user.full_name || user.name || '',
      studentEmail: user.email,
      labId: lab.id,
      labSlug: lab.slug || slugify(lab.title),
      profileKey,
      durationMinutes: sessionMinutes,
    });
    gatewaySessionId = result?.sessionId || null;
    if (!gatewaySessionId) throw new Error('Lab gateway did not return a session id.');
    await query('UPDATE lab_sessions SET instance_id = $2 WHERE id = $1', [session.id, gatewaySessionId]);
    await updateVpsFsState(session.id, { gatewaySessionId });

    const deadline = Date.now() + env.labs.vpsGateway.provisionTimeoutMs;
    for (;;) {
      if (Date.now() > deadline) {
        throw new Error('Timed out waiting for the lab server to become ready.');
      }
      await sleep(env.labs.vpsGateway.pollIntervalMs);
      // If the session left 'provisioning' meanwhile (the student stopped
      // it, or staff ended it), stop babysitting it and clean up the server.
      const { rows: current } = await query('SELECT status FROM lab_sessions WHERE id = $1', [session.id]);
      if (!current[0] || current[0].status !== 'provisioning') {
        await terminateLabSession(gatewaySessionId).catch(() => {});
        return;
      }
      const statusData = await getLabSessionStatus(gatewaySessionId);
      const gatewaySession = statusData?.session || {};
      if (gatewaySession.status === 'active' && gatewaySession.publicIp) {
        await updateVpsFsState(session.id, {
          publicIp: gatewaySession.publicIp,
          sshUser: gatewaySession.sshUser || 'student',
          serverName: gatewaySession.serverName || null,
        });
        const expiresAt = new Date(Date.now() + sessionMinutes * 60 * 1000);
        const { rows: updated } = await query(
          `UPDATE lab_sessions SET status = 'running', started_at = now(), expires_at = $2
           WHERE id = $1 AND status = 'provisioning' RETURNING *`,
          [session.id, expiresAt]
        );
        if (updated[0]) {
          await withTransaction((client) =>
            notify(client, {
              userIds: [user.id],
              type: 'lab',
              title: `Lab server ready: ${lab.title}`,
              body: 'Your lab server is ready.',
              link: `/labs/${lab.id}`,
            })
          ).catch(() => {});
        }
        return;
      }
      if (gatewaySession.status === 'error') {
        throw new Error(gatewaySession.error || 'The lab server could not be prepared.');
      }
    }
  } catch (error) {
    logger.warn('VPS lab provisioning failed', { sessionId: session.id, error: error.message });
    await markVpsSessionError(session, gatewaySessionId, error.message);
  }
}

/**
 * Starts a Real VPS lab session. Session-first and asynchronous: the row is
 * created in 'provisioning' state with no expiry, the student watches a
 * "server being prepared" page, and the background launcher flips the
 * session to 'running' (and starts its timer) once the server is active.
 */
export async function startVpsSession(user, lab) {
  const { rows: existing } = await query(
    `SELECT * FROM lab_sessions
     WHERE user_id = $1 AND lab_id = $2 AND provider = 'vps'
       AND status IN ('provisioning', 'running')
       AND (expires_at IS NULL OR expires_at > now())
     ORDER BY id DESC LIMIT 1`,
    [user.id, lab.id]
  );
  if (existing[0]) {
    const fullExisting = await loadSession(existing[0].id);
    return { session: fullExisting || existing[0], reused: true };
  }

  const labLimitMinutes = Math.max(0, Number(lab.time_limit_minutes) || 0);
  const sessionMinutes = labLimitMinutes > 0 ? labLimitMinutes : env.labs.sessionTtlMinutes;
  const profileKey = lab.vps_profile || 'ubuntu-basic';

  const { rows } = await query(
    `INSERT INTO lab_sessions
       (lab_id, user_id, provider, instance_id, status, fs_state, cwd, expires_at)
     VALUES ($1, $2, 'vps', NULL, 'provisioning', $3, '/home/student', NULL)
     RETURNING *`,
    [lab.id, user.id, JSON.stringify({ vps: { profile: profileKey } })]
  );
  const session = rows[0];

  await withTransaction(async (client) => {
    await recordActivity(client, {
      userId: user.id,
      action: 'lab.started',
      entityType: 'lab',
      entityId: lab.id,
      metadata: { title: lab.title, practice: false, provider: 'vps', profile: profileKey },
    });
    await notify(client, {
      userIds: [user.id],
      type: 'lab',
      title: `Lab started: ${lab.title}`,
      body: 'Your real lab server is being prepared. This usually takes a few minutes.',
      link: `/labs/${lab.id}`,
    });
  });

  launchVpsProvisioning(session, lab, user, sessionMinutes).catch((error) =>
    logger.warn('VPS lab provisioning launcher failed', { sessionId: session.id, error: error.message })
  );

  const fullSession = await loadSession(session.id);
  return { session: fullSession || session, reused: false };
}

export async function stopSession(session, user, { reason = 'stopped' } = {}) {
  if (session.status === 'stopped') return session;
  const provider = getProvider(session.provider);
  const server = await hostForSession(session);
  if (server?.server) session._server = server.server;
  await provider.deprovision(session, { host: server?.host || null, server: server?.server || null });
  if (server?.server?.id) await releaseCapacity(server.server.id).catch(() => {});
  const { rows } = await query(
    `UPDATE lab_sessions SET status = 'stopped', ended_at = now(), ended_reason = $2
     WHERE id = $1 RETURNING *`,
    [session.id, reason]
  );
  if (user?.id) {
    await withTransaction((client) =>
      recordActivity(client, {
        userId: user.id,
        action: 'lab.stopped',
        entityType: 'lab',
        entityId: session.lab_id,
      })
    ).catch(() => {});
  }
  if (session.instance_id && session.provider === 'docker') {
    await recordContainerEvent({
      containerId: session.instance_id,
      sessionId: session.id,
      userId: user?.id || session.user_id,
      labId: session.lab_id,
      event: 'stopped',
      details: { stoppedBy: user?.id === session.user_id ? 'student' : 'staff' },
    }).catch(() => {});
  }
  return rows[0];
}

/**
 * Stops a session that has passed its deadline. The student-facing session
 * endpoint calls this so a lab ends immediately when its timer reaches zero,
 * even before the periodic cleanup job runs.
 */
export async function expireSessionIfNeeded(session, user) {
  if (session.status !== 'running') return session;
  if (!session.expires_at || new Date(session.expires_at) > new Date()) return session;
  try {
    return await stopSession(session, user, { reason: 'expired' });
  } catch (error) {
    logger.warn('Expired lab session cleanup failed', { sessionId: session.id, error: error.message });
    const { rows } = await query(
      `UPDATE lab_sessions SET status = 'stopped', ended_at = now(), ended_reason = 'expired'
       WHERE id = $1 RETURNING *`,
      [session.id]
    );
    return rows[0] || session;
  }
}

async function getIncompleteSteps(sessionId) {
  const { rows } = await query(
    `SELECT s.* FROM lab_steps s
     WHERE s.lab_id = (SELECT lab_id FROM lab_sessions WHERE id = $1)
       AND s.id NOT IN (SELECT step_id FROM lab_step_progress WHERE session_id = $1)
     ORDER BY s.position, s.id`,
    [sessionId]
  );
  return rows;
}

async function markStepCompleted({ session, step, command, output, client }) {
  const runner = client || { query: (text, params) => query(text, params) };
  const { rows: existing } = await runner.query(
    `SELECT id FROM lab_step_progress WHERE session_id = $1 AND step_id = $2`,
    [session.id, step.id]
  );
  if (existing[0]) return false;
  await runner.query(
    `INSERT INTO lab_step_progress (session_id, step_id, command_used, output_excerpt)
     VALUES ($1, $2, $3, $4)`,
    [session.id, step.id, (command || null)?.slice(0, 500), (output || '').slice(0, 2000)]
  );
  return true;
}

/** Checks pending steps against the executed command/output. */
export async function verifyStepsAfterCommand({ session, command, output }) {
  // Real and Real VPS labs are unguided assessments: no steps to verify.
  if (session.lab_mode === 'real' || session.lab_mode === 'vps') return { completedSteps: [], completion: null };

  const pending = await getIncompleteSteps(session.id);
  const completed = [];
  let newCompletion = false;

  for (const step of pending) {
    let matched = false;
    if (step.verification === 'command' && step.expected_command) {
      matched = normalizeCommand(step.expected_command) === normalizeCommand(command);
    } else if (step.verification === 'output' && step.expected_output_pattern) {
      matched = matchesPattern(step.expected_output_pattern, output);
    } else if (step.verification === 'manual') {
      matched = false; // manual steps are confirmed through the UI endpoint
    }
    if (matched) {
      const marked = await markStepCompleted({ session, step, command, output });
      if (marked) {
        completed.push(step);
        newCompletion = true;
      }
    }
  }

  const completion = newCompletion ? await checkLabCompletion(session) : null;
  return { completedSteps: completed, completion };
}

/** Marks a manual step as complete (self-reported, recorded in history). */
export async function completeManualStep(session, step, user) {
  if (session.lab_mode === 'real' || session.lab_mode === 'vps') {
    throw badRequest('Real labs are unguided assessments: complete the task and upload screenshot evidence.');
  }
  if (step.verification !== 'manual') {
    throw badRequest('This step is verified automatically, run the expected command in the terminal.');
  }
  const marked = await markStepCompleted({ session, step, command: '(manual confirmation)', output: '' });
  if (!marked) return { alreadyCompleted: true };
  const completion = await checkLabCompletion(session);
  await withTransaction((client) =>
    recordActivity(client, {
      userId: user.id,
      action: 'lab.step_completed',
      entityType: 'lab_session',
      entityId: session.id,
      metadata: { stepTitle: step.title, manual: true },
    })
  );
  return { completed: true, completion };
}

/** Evaluates overall lab completion, notifies the learner and syncs lesson progress. */
export async function checkLabCompletion(session) {
  if (session.lab_mode === 'real' || session.lab_mode === 'vps') return { labCompleted: false };
  const { rows: remaining } = await query(
    `SELECT COUNT(*)::int AS remaining FROM lab_steps s
     WHERE s.lab_id = $1 AND s.is_optional = FALSE
       AND s.id NOT IN (SELECT step_id FROM lab_step_progress WHERE session_id = $2)`,
    [session.lab_id, session.id]
  );
  const allRequiredDone = remaining[0].remaining === 0;
  if (!allRequiredDone) return { labCompleted: false };

  await withTransaction(async (client) => {
    await recordActivity(client, {
      userId: session.user_id,
      action: 'lab.completed',
      entityType: 'lab',
      entityId: session.lab_id,
      metadata: { title: session.lab_title, sessionId: session.id },
    });
    await notify(client, {
      userIds: [session.user_id],
      type: 'lab',
      title: `Lab completed: ${session.lab_title}`,
      body: 'All required steps verified. You can now generate your practical report.',
      link: `/labs/session/${session.id}`,
    });
    // Sync the linked lesson's completion so course progress reflects the lab.
    if (session.lesson_id && session.course_id) {
      const { rows: enrollRows } = await client.query(
        `SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2`,
        [session.user_id, session.course_id]
      );
      if (enrollRows[0]) {
        await client.query(
          `INSERT INTO lesson_progress (user_id, lesson_id, course_id, status, completed_at)
           VALUES ($1, $2, $3, 'completed', now())
           ON CONFLICT (user_id, lesson_id) DO UPDATE SET status = 'completed', completed_at = now()`,
          [session.user_id, session.lesson_id, session.course_id]
        );
        const progress = await recomputeCourseProgress(client, session.user_id, session.course_id);
        if (progress.completedNow) {
          await notify(client, {
            userIds: [session.user_id],
            type: 'certificate',
            title: 'Course completed, certificate issued!',
            body: `Certificate serial: ${progress.certificate?.serial || ''}`,
            link: '/student/certificates',
          });
        }
      }
    }
  });

  return { labCompleted: true };
}

/**
 * Executes a command inside a running session through its provider terminal.
 * Persists history + filesystem state and verifies pending steps.
 */
export async function executeInSession(session, lab, command, { onOutput } = {}) {
  if (session.status !== 'running') throw badRequest('This lab session is not running. Start it again.');
  const provider = getProvider(session.provider);
  if (session.expires_at && new Date(session.expires_at) < new Date()) {
    try {
      const server = await hostForSession(session);
      if (server?.server) session._server = server.server;
      await provider.deprovision(session, { host: server?.host || null, server: server?.server || null });
      if (server?.server?.id) await releaseCapacity(server.server.id).catch(() => {});
      await query(`UPDATE lab_sessions SET status = 'stopped', ended_at = now(), ended_reason = 'expired' WHERE id = $1`, [session.id]);
    } catch (error) {
      await query(`UPDATE lab_sessions SET status = 'error' WHERE id = $1`, [session.id]).catch(() => {});
      logger.warn('Expired lab session cleanup failed', { sessionId: session.id, error: error.message });
    }
    throw badRequest('This lab session has expired. Start a new session.');
  }

  const server = await hostForSession(session);
  if (server?.server) session._server = server.server;
  const terminal = provider.createTerminal(session, lab, { server: server?.server || null });
  const result = await terminal.execute(command, { onOutput });
  const { events = [], ...exec } = result;

  const historyEntry = [
    { role: 'user', text: command, at: new Date().toISOString() },
    ...(events.some((e) => e.type === 'clear')
      ? []
      : [{ role: 'output', text: exec.output, exitCode: exec.exitCode, at: new Date().toISOString() }]),
  ];

  const { rows: currentRows } = await query('SELECT history FROM lab_sessions WHERE id = $1', [session.id]);
  const history = [...(currentRows[0]?.history || []), ...historyEntry].slice(-MAX_HISTORY_LINES);

  const { rows: updatedRows } = await query(
    `UPDATE lab_sessions SET history = $1, fs_state = $2, cwd = $3, last_activity_at = now()
     WHERE id = $4 RETURNING *`,
    [JSON.stringify(history), JSON.stringify(exec.fsState), exec.cwd, session.id]
  );
  const updatedSession = { ...session, ...updatedRows[0] };

  const verification = await verifyStepsAfterCommand({ session: updatedSession, command, output: exec.output });

  if (verification.completedSteps.length > 0) {
    await withTransaction(async (client) => {
      for (const step of verification.completedSteps) {
        await recordActivity(client, {
          userId: session.user_id,
          action: 'lab.step_completed',
          entityType: 'lab_session',
          entityId: session.id,
          metadata: { stepTitle: step.title, command },
        });
      }
    });
  }

  return {
    output: exec.output,
    exitCode: exec.exitCode,
    cwd: exec.cwd,
    clear: events.some((e) => e.type === 'clear'),
    completedSteps: verification.completedSteps.map((s) => ({ id: s.id, title: s.title })),
    completion: verification.completion,
    session: updatedSession,
  };
}

/** Tears down expired lab instances and reconciles their session rows. */
export async function cleanupExpiredLabSessions({ limit = 100 } = {}) {
  const { rows } = await query(
    `SELECT * FROM lab_sessions
     WHERE status IN ('running', 'provisioning', 'error')
       AND expires_at IS NOT NULL AND expires_at <= now()
     ORDER BY expires_at
     LIMIT $1`,
    [limit]
  );
  let stopped = 0;
  for (const session of rows) {
    try {
      try {
        const server = await hostForSession(session);
        if (server?.server) session._server = server.server;
        await getProvider(session.provider).deprovision(session, { host: server?.host || null, server: server?.server || null });
        if (server?.server?.id) await releaseCapacity(server.server.id).catch(() => {});
      } catch (provErr) {
        logger.warn('Provider deprovision skipped or failed during cleanup', {
          sessionId: session.id,
          provider: session.provider,
          error: provErr.message,
        });
      }
      const result = await query(
        `UPDATE lab_sessions SET status = 'stopped', ended_at = now(), ended_reason = 'expired'
         WHERE id = $1 AND status IN ('running', 'provisioning', 'error')`,
        [session.id]
      );
      stopped += result.rowCount;
      if (session.instance_id && session.provider === 'docker') {
        recordContainerEvent({
          containerId: session.instance_id,
          sessionId: session.id,
          userId: session.user_id,
          labId: session.lab_id,
          event: 'cleanup',
          details: { reason: 'session_expired_ttl' },
        }).catch(() => {});
      }
    } catch (error) {
      await query(
        `UPDATE lab_sessions SET status = 'stopped', ended_at = now(), ended_reason = 'expired'
         WHERE id = $1 AND status IN ('running', 'provisioning', 'error')`,
        [session.id]
      ).catch(() => {});
      logger.warn('Expired lab cleanup failed', { sessionId: session.id, provider: session.provider, error: error.message });
    }
  }
  return { scanned: rows.length, stopped };
}

/** Full state of a session for the lab UI (steps, progress, screenshots). */
export async function getSessionOverview(session, { includeAnswers = false } = {}) {
  const steps = await getLabSteps(session.lab_id, { includeAnswers });
  const fsState = session.fs_state && typeof session.fs_state === 'object' ? session.fs_state : {};
  const identity = studentIdentity({ id: session.user_id, full_name: session.student_name });
  const student = {
    id: identity.studentId,
    name: session.student_name || identity.displayName,
    shell_user: fsState.shellUser || identity.shellUser,
    hostname: identity.hostname,
  };
  const { rows: progressRows } = await query(
    `SELECT step_id, command_used, output_excerpt, completed_at FROM lab_step_progress WHERE session_id = $1`,
    [session.id]
  );
  const progressByStep = new Map(progressRows.map((row) => [row.step_id, row]));
  const { rows: screenshots } = await query(
    `SELECT id, step_id, original_name, file_path, mime_type, size_bytes, created_at
     FROM screenshots WHERE session_id = $1 ORDER BY created_at`,
    [session.id]
  );
  const { rows: reportRows } = await query(
    `SELECT id, status, title FROM reports WHERE session_id = $1`,
    [session.id]
  );
  const { rows: submissionRows } = await query(
    `SELECT id, status, student_note, instructor_feedback, submitted_at, reviewed_at,
            attachment_name, attachment_size
     FROM lab_submissions WHERE session_id = $1`,
    [session.id]
  );
  const { rows: labRows } = await query(
    `SELECT id, title, submission_requirements, is_practice, lab_mode, task_brief, min_evidence,
            time_limit_minutes, vps_profile
     FROM labs WHERE id = $1`,
    [session.lab_id]
  );
  const lab = labRows[0] || null;

  // Self-heal the VPS server name: sessions whose server went active
  // before the name was recorded (or while the gateway deploy lagged)
  // have no fs_state.vps.serverName. Ask the gateway once, store what it
  // reports, and the panel shows the real server name from then on.
  if (
    session.provider === 'vps'
    && (session.status === 'running' || session.status === 'provisioning')
    && session.instance_id
    && !fsState.vps?.serverName
  ) {
    try {
      const statusData = await getLabSessionStatus(session.instance_id);
      const gatewayName = statusData?.session?.serverName || null;
      if (gatewayName) {
        const nextState = await updateVpsFsState(session.id, { serverName: gatewayName });
        if (nextState?.vps) fsState.vps = nextState.vps;
      }
    } catch {
      // Gateway unreachable: the panel falls back to the student name.
    }
  }

  const labMode = lab?.lab_mode === 'vps' ? 'vps' : lab?.lab_mode === 'real' ? 'real' : 'practice';
  // VPS labs share the real-lab treatment here: no steps, progress counts
  // screenshot evidence instead of verified steps.
  const isRealLab = labMode === 'real' || labMode === 'vps';

  const stepViews = steps.map((step) => {
    const progress = progressByStep.get(step.id) || null;
    return {
      ...step,
      completed: Boolean(progress),
      completed_at: progress?.completed_at || null,
      command_used: progress?.command_used || null,
      output_excerpt: progress?.output_excerpt || null,
    };
  });

  const required = stepViews.filter((s) => !s.is_optional);
  const completedRequired = required.filter((s) => s.completed).length;

  const remainingSeconds =
    session.status === 'running' && session.expires_at
      ? Math.max(0, Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000))
      : 0;

  // Real labs are question-only assessments: progress is the number of
  // screenshot evidence files the learner has attached to the session.
  const evidenceCount = screenshots.length;
  const minEvidence = Math.max(0, Number(lab?.min_evidence ?? 1));
  const progress = isRealLab
    ? {
        completedRequired: Math.min(evidenceCount, minEvidence),
        requiredTotal: minEvidence,
        percent: minEvidence > 0 ? Math.min(100, Math.round((evidenceCount / minEvidence) * 100)) : 100,
        allRequiredCompleted: evidenceCount >= minEvidence,
        evidenceCount,
        minEvidence,
      }
    : {
        completedRequired,
        requiredTotal: required.length,
        percent: required.length > 0 ? Math.round((completedRequired / required.length) * 10000) / 100 : 100,
        allRequiredCompleted: required.length > 0 && completedRequired === required.length,
        evidenceCount,
        minEvidence,
      };

  return {
    session: {
      id: session.id,
      lab_id: session.lab_id,
      user_id: session.user_id,
      provider: session.provider,
      containerless: session.provider === 'practice',
      instance_id: session.instance_id,
      status: session.status,
      cwd: session.cwd,
      history: session.history,
      started_at: session.started_at,
      expires_at: session.expires_at,
      remaining_seconds: remainingSeconds,
      ended_at: session.ended_at,
      ended_reason: session.ended_reason || null,
      lab_server_id: session.lab_server_id || null,
      lab_server_name: session.lab_server_name || null,
      vps: fsState.vps || null,
      student_id: student.id,
      student_name: student.name,
      shell_user: student.shell_user,
      hostname: student.hostname,
    },
    student,
    // Real labs never expose steps (there should be none), even if an old
    // practice lab was converted after learners had already started it.
    steps: isRealLab ? [] : stepViews,
    screenshots,
    lab,
    mode: labMode,
    report: reportRows[0] || null,
    submission: submissionRows[0] || null,
    progress,
  };
}

/**
 * Best-ever progress for one learner on one lab. Used by the lab detail page.
 * Guided labs measure completed required steps; real labs measure screenshots.
 */
export async function getUserLabProgress(userId, lab) {
  const labId = typeof lab === 'object' ? lab.id : lab;
  const labMode = typeof lab === 'object' && (lab.lab_mode === 'real' || lab.lab_mode === 'vps') ? 'real' : 'practice';
  const minEvidence = Math.max(1, Number(typeof lab === 'object' ? lab.min_evidence : 1) || 1);

  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM lab_steps st
         WHERE st.lab_id = $2 AND st.is_optional = FALSE) AS required_steps,
       COALESCE((
         SELECT MAX(x.completed_required) FROM (
           SELECT (SELECT COUNT(*)::int FROM lab_step_progress p
                     JOIN lab_steps st ON st.id = p.step_id
                    WHERE p.session_id = s.id AND st.is_optional = FALSE) AS completed_required
             FROM lab_sessions s
            WHERE s.lab_id = $2 AND s.user_id = $1
         ) x
       ), 0) AS completed_steps,
       COALESCE((
         SELECT MAX((SELECT COUNT(*)::int FROM screenshots sc WHERE sc.session_id = s.id))
           FROM lab_sessions s
          WHERE s.lab_id = $2 AND s.user_id = $1
       ), 0) AS evidence_count,
       EXISTS (
         SELECT 1 FROM lab_submissions ls
           JOIN lab_sessions s ON s.id = ls.session_id
          WHERE s.lab_id = $2 AND s.user_id = $1 AND ls.status = 'approved'
       ) AS approved,
       EXISTS (SELECT 1 FROM lab_sessions s WHERE s.lab_id = $2 AND s.user_id = $1) AS started`,
    [userId, labId]
  );

  const row = rows[0] || {};
  const requiredSteps = Number(row.required_steps) || 0;
  const completedSteps = Number(row.completed_steps) || 0;
  const evidenceCount = Number(row.evidence_count) || 0;

  let percent;
  if (labMode === 'real') {
    percent = Math.min(100, Math.round((evidenceCount / minEvidence) * 100));
  } else if (requiredSteps > 0) {
    percent = Math.min(100, Math.round((completedSteps / requiredSteps) * 100));
  } else {
    percent = row.started ? 100 : 0;
  }

  return {
    percent,
    completed:
      labMode === 'real'
        ? Boolean(row.approved) || evidenceCount >= minEvidence
        : requiredSteps > 0 && completedSteps >= requiredSteps,
    requiredSteps,
    completedSteps,
    evidenceCount,
    minEvidence,
    approved: Boolean(row.approved),
    started: Boolean(row.started),
  };
}
