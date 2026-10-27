import { query } from '../config/db.js';
import { MockShell } from '../labs/mock/mockShell.js';
import { normalizeCommand } from '../utils/helpers.js';
import { badRequest, notFound } from '../utils/errors.js';

const MAX_COMMAND_LENGTH = 4000;
const MAX_HISTORY_LINES = 400;

export const PRACTICE_NOTICE =
  'Simulated practice environment. Commands are interpreted by a local simulator and never run on a real server.';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function initialFilesFor(lab) {
  return lab.initial_files && typeof lab.initial_files === 'object' ? lab.initial_files : {};
}

async function getOrCreatePracticeSession(lab, user) {
  const { rows } = await query(
    `INSERT INTO lab_practice_sessions (lab_id, user_id, cwd, fs_state, history, completed_steps)
     VALUES ($1, $2, $3, $4::jsonb, '[]'::jsonb, '[]'::jsonb)
     ON CONFLICT (lab_id, user_id)
     DO UPDATE SET last_activity_at = now()
     RETURNING *`,
    [lab.id, user.id, lab.initial_cwd || '/home/student', JSON.stringify(initialFilesFor(lab))]
  );
  return rows[0];
}

async function loadPracticeSteps(labId) {
  const { rows } = await query(
    `SELECT id, position, title, instruction, hint, verification, points, is_optional,
       practice_command, practice_output, practice_explanation
     FROM lab_steps WHERE lab_id = $1 ORDER BY position, id`,
    [labId]
  );
  return rows;
}

function stepView(step, completed) {
  return {
    id: step.id,
    position: step.position,
    title: step.title,
    instruction: step.instruction,
    hint: step.hint,
    verification: step.verification,
    points: step.points,
    is_optional: step.is_optional,
    practice_command: step.practice_command || '',
    practice_output: step.practice_output || '',
    practice_explanation: step.practice_explanation || '',
    completed: completed.has(String(step.id)),
  };
}

function progressFor(steps, completed) {
  const required = steps.filter((step) => !step.is_optional);
  const done = required.filter((step) => completed.has(String(step.id))).length;
  return {
    completedRequired: done,
    requiredTotal: required.length,
    completedTotal: steps.filter((step) => completed.has(String(step.id))).length,
    percent: required.length > 0 ? Math.round((done / required.length) * 10000) / 100 : 100,
    allRequiredCompleted: required.length > 0 && done === required.length,
  };
}

function buildOverview(session, steps, lab) {
  const completed = new Set(asArray(session.completed_steps).map(String));
  return {
    simulated: true,
    notice: PRACTICE_NOTICE,
    lab: { id: lab.id, title: lab.title, summary: lab.summary },
    session: {
      id: session.id,
      lab_id: session.lab_id,
      user_id: session.user_id,
      cwd: session.cwd,
      history: session.history,
      completed_steps: [...completed],
      started_at: session.started_at,
      last_activity_at: session.last_activity_at,
      reset_at: session.reset_at,
    },
    steps: steps.map((step) => stepView(step, completed)),
    progress: progressFor(steps, completed),
  };
}

export async function getPracticeOverview(lab, user) {
  const session = await getOrCreatePracticeSession(lab, user);
  const steps = await loadPracticeSteps(lab.id);
  return buildOverview(session, steps, lab);
}

export async function runPracticeCommand(lab, user, rawCommand) {
  const command = String(rawCommand ?? '').trim();
  if (!command) throw badRequest('Command cannot be empty.');
  if (command.length > MAX_COMMAND_LENGTH) {
    throw badRequest(`Command is too long (limit ${MAX_COMMAND_LENGTH} characters).`);
  }

  let session = await getOrCreatePracticeSession(lab, user);
  const steps = await loadPracticeSteps(lab.id);
  const completed = new Set(asArray(session.completed_steps).map(String));

  const shell = new MockShell({
    fsState: session.fs_state,
    cwd: session.cwd || lab.initial_cwd || '/home/student',
    welcome: lab.terminal_welcome || '',
    hostname: 'practice-simulator',
    user: 'student',
  });
  const result = shell.execute(command);
  const isClear = result.events.some((event) => event.type === 'clear');

  const newlyCompleted = [];
  for (const step of steps) {
    if (completed.has(String(step.id)) || !step.practice_command) continue;
    if (normalizeCommand(step.practice_command) === normalizeCommand(command)) {
      completed.add(String(step.id));
      newlyCompleted.push({ id: step.id, title: step.title });
    }
  }

  const historyEntry = [
    { role: 'user', text: command, simulated: true, at: new Date().toISOString() },
    ...(isClear
      ? []
      : [{ role: 'output', text: result.output, exitCode: result.exitCode, simulated: true, at: new Date().toISOString() }]),
  ];
  const history = [...asArray(session.history), ...historyEntry].slice(-MAX_HISTORY_LINES);

  const { rows } = await query(
    `UPDATE lab_practice_sessions
     SET fs_state = $1, cwd = $2, history = $3::jsonb, completed_steps = $4::jsonb, last_activity_at = now()
     WHERE id = $5 RETURNING *`,
    [JSON.stringify(result.fsState), result.cwd, JSON.stringify(history), JSON.stringify([...completed]), session.id]
  );
  session = rows[0];

  return {
    ...buildOverview(session, steps, lab),
    output: result.output,
    exitCode: result.exitCode,
    cwd: result.cwd,
    clear: isClear,
    completedSteps: newlyCompleted,
  };
}

export async function markPracticeStep(lab, user, stepId) {
  const steps = await loadPracticeSteps(lab.id);
  const step = steps.find((entry) => String(entry.id) === String(stepId));
  if (!step) throw notFound('Step not found.');
  const session = await getOrCreatePracticeSession(lab, user);
  const completed = new Set(asArray(session.completed_steps).map(String));
  completed.add(String(step.id));
  const { rows } = await query(
    `UPDATE lab_practice_sessions
     SET completed_steps = $1::jsonb, last_activity_at = now()
     WHERE id = $2 RETURNING *`,
    [JSON.stringify([...completed]), session.id]
  );
  return buildOverview(rows[0], steps, lab);
}

export async function resetPractice(lab, user) {
  const { rows } = await query(
    `INSERT INTO lab_practice_sessions (lab_id, user_id, cwd, fs_state, history, completed_steps, reset_at)
     VALUES ($1, $2, $3, $4::jsonb, '[]'::jsonb, '[]'::jsonb, now())
     ON CONFLICT (lab_id, user_id)
     DO UPDATE SET cwd = $3, fs_state = $4::jsonb, history = '[]'::jsonb,
       completed_steps = '[]'::jsonb, reset_at = now(), last_activity_at = now()
     RETURNING *`,
    [lab.id, user.id, lab.initial_cwd || '/home/student', JSON.stringify(initialFilesFor(lab))]
  );
  const steps = await loadPracticeSteps(lab.id);
  return buildOverview(rows[0], steps, lab);
}
