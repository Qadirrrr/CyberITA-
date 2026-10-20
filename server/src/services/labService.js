import { query, withTransaction } from '../config/db.js';
import env from '../config/env.js';
import { getProvider } from '../labs/providers/index.js';
import { normalizeCommand, matchesPattern } from '../utils/helpers.js';
import { notFound, forbidden, badRequest } from '../utils/errors.js';
import { notify, recordActivity } from '../utils/activity.js';
import { recomputeCourseProgress } from '../routes/enrollment.js';

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
    `SELECT s.*, l.terminal_welcome, l.initial_cwd, l.lesson_id, l.course_id, l.title AS lab_title
     FROM lab_sessions s JOIN labs l ON l.id = s.lab_id WHERE s.id = $1`,
    [sessionId]
  );
  return rows[0] || null;
}

export async function getSessionOr404(sessionId, user) {
  const session = await loadSession(sessionId);
  if (!session) throw notFound('Lab session not found.');
  const isOwner = session.user_id === user.id;
  const isStaff = user.role === 'admin' || user.role === 'instructor';
  if (!isOwner && !isStaff) throw forbidden('You do not have access to this lab session.');
  return session;
}

/** Provisions (or reuses) a lab session for a user. */
export async function startSession(user, lab) {
  const { rows: existing } = await query(
    `SELECT * FROM lab_sessions
     WHERE user_id = $1 AND lab_id = $2 AND status = 'running'
       AND (expires_at IS NULL OR expires_at > now())
     ORDER BY id DESC LIMIT 1`,
    [user.id, lab.id]
  );
  if (existing[0]) return { session: existing[0], reused: true };

  const provider = getProvider();
  const descriptor = await provider.provision({ lab, user });
  const expiresAt = new Date(Date.now() + env.labs.sessionTtlMinutes * 60 * 1000);
  const { rows } = await query(
    `INSERT INTO lab_sessions
       (lab_id, user_id, provider, instance_id, status, fs_state, cwd, expires_at)
     VALUES ($1, $2, $3, $4, 'running', $5, $6, $7)
     RETURNING *`,
    [lab.id, user.id, descriptor.provider, descriptor.instanceId, JSON.stringify(descriptor.fsState), descriptor.cwd, expiresAt]
  );
  const session = rows[0];

  await withTransaction(async (client) => {
    await recordActivity(client, {
      userId: user.id,
      action: 'lab.started',
      entityType: 'lab',
      entityId: lab.id,
      metadata: { title: lab.title, instanceId: descriptor.instanceId },
    });
    await notify(client, {
      userIds: [user.id],
      type: 'lab',
      title: `Lab started: ${lab.title}`,
      body: 'Your practice environment is ready in the browser terminal.',
      link: `/labs/${lab.id}`,
    });
  });

  return { session, reused: false, welcome: descriptor.welcome };
}

export async function stopSession(session, user) {
  if (session.status === 'stopped') return session;
  const provider = getProvider(session.provider);
  await provider.deprovision(session);
  const { rows } = await query(
    `UPDATE lab_sessions SET status = 'stopped', ended_at = now() WHERE id = $1 RETURNING *`,
    [session.id]
  );
  await withTransaction((client) =>
    recordActivity(client, {
      userId: user.id,
      action: 'lab.stopped',
      entityType: 'lab',
      entityId: session.lab_id,
    })
  );
  return rows[0];
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
  if (step.verification !== 'manual') {
    throw badRequest('This step is verified automatically — run the expected command in the terminal.');
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
            title: 'Course completed — certificate issued!',
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
export async function executeInSession(session, lab, command) {
  if (session.status !== 'running') throw badRequest('This lab session is not running. Start it again.');
  if (session.expires_at && new Date(session.expires_at) < new Date()) {
    await query(`UPDATE lab_sessions SET status = 'stopped', ended_at = now() WHERE id = $1`, [session.id]);
    throw badRequest('This lab session has expired. Start a new session.');
  }

  const provider = getProvider(session.provider);
  const terminal = provider.createTerminal(session, lab);
  const result = terminal.execute(command);
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
  const updatedSession = updatedRows[0];

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

/** Full state of a session for the lab UI (steps, progress, screenshots). */
export async function getSessionOverview(session, { includeAnswers = false } = {}) {
  const steps = await getLabSteps(session.lab_id, { includeAnswers });
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

  return {
    session: {
      id: session.id,
      lab_id: session.lab_id,
      user_id: session.user_id,
      provider: session.provider,
      instance_id: session.instance_id,
      status: session.status,
      cwd: session.cwd,
      history: session.history,
      started_at: session.started_at,
      expires_at: session.expires_at,
      ended_at: session.ended_at,
    },
    steps: stepViews,
    screenshots,
    report: reportRows[0] || null,
    progress: {
      completedRequired,
      requiredTotal: required.length,
      percent: required.length > 0 ? Math.round((completedRequired / required.length) * 10000) / 100 : 100,
      allRequiredCompleted: required.length > 0 && completedRequired === required.length,
    },
  };
}
