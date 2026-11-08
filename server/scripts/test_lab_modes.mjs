import { createApp } from '../src/app.js';
import { runMigrations } from '../src/db/migrate.js';
import { query, pool } from '../src/config/db.js';
import { hashPassword, signAccessToken } from '../src/services/authService.js';
import { getProviderForLab } from '../src/labs/providers/index.js';
import fs from 'node:fs';

/**
 * Live HTTP smoke test for lab delivery modes (practice vs real).
 * Creates fixtures, hits the real API on an ephemeral server, then removes
 * every row and uploaded file it created.
 */
await runMigrations({ silent: true });

const app = createApp();
const server = app.listen(0);
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

let failures = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`);
  if (!cond) failures += 1;
};

const api = async (path, { token, method = 'GET', body } = {}) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
};

const upload = async (path, token, buffer, filename = 'evidence.png') => {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'image/png' }), filename);
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
  let data = null;
  try { data = await res.json(); } catch { /* no body */ }
  return { status: res.status, data };
};

const created = { users: [], courses: [], labs: [], sessions: [], submissions: [], screenshots: [] };
const stamp = Date.now();
const pw = await hashPassword('LabMode!2345');

const mkUser = async (email, role) => {
  const { rows } = await query(
    `INSERT INTO users (email,password_hash,full_name,role,is_active,email_verified_at)
     VALUES ($1,$2,$3,$4,TRUE,now()) RETURNING id,email,full_name,role`,
    [email, pw, email, role]
  );
  created.users.push(rows[0].id);
  return rows[0];
};

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

try {
  const instructor = await mkUser(`labmode-instructor-${stamp}@x.io`, 'instructor');
  const student = await mkUser(`labmode-student-${stamp}@x.io`, 'student');
  const instructorToken = signAccessToken(instructor);
  const studentToken = signAccessToken(student);

  const { rows: courseRows } = await query(
    `INSERT INTO courses (title, slug, description, category, level, status, instructor_id)
     VALUES ($1,$2,'','Linux','beginner','published',$3) RETURNING id`,
    [`Lab mode course ${stamp}`, `lab-mode-course-${stamp}`, instructor.id]
  );
  const courseId = courseRows[0].id;
  created.courses.push(courseId);
  await query(
    `INSERT INTO enrollments (user_id, course_id, status) VALUES ($1,$2,'active')`,
    [student.id, courseId]
  );

  // ---------- provider selection: every lab kind is a real container ----------
  check('open practice labs use the docker provider', getProviderForLab({ is_practice: true }).name === 'docker');
  check('guided labs use the docker provider', getProviderForLab({ is_practice: false }).name === 'docker');
  const statusRes = await api('/api/labs/status');
  check(
    'status no longer advertises a simulated practice provider',
    statusRes.status === 200 && !('practice' in (statusRes.data || {})),
    JSON.stringify(statusRes.data)
  );

  // ---------- real lab creation ----------
  const realCreate = await api('/api/labs', {
    token: instructorToken,
    method: 'POST',
    body: {
      title: `Real assessment ${stamp}`,
      courseId,
      status: 'published',
      labMode: 'real',
      taskBrief: '## Your task\nFind the attacking IP in the access log and report it.',
      minEvidence: 2,
      difficulty: 'beginner',
      estimatedMinutes: 30,
      timeLimitMinutes: 25,
    },
  });
  check('create real lab returns 201', realCreate.status === 201, `status=${realCreate.status}`);
  const realLab = realCreate.data?.lab;
  if (realLab) created.labs.push(realLab.id);
  check('real lab stores lab_mode=real', realLab?.lab_mode === 'real');
  check('real lab stores task_brief', String(realLab?.task_brief || '').includes('attacking IP'));
  check('real lab stores min_evidence=2', Number(realLab?.min_evidence) === 2);
  check('real lab stores time_limit_minutes=25', Number(realLab?.time_limit_minutes) === 25, `limit=${realLab?.time_limit_minutes}`);

  // real lab without task brief is rejected
  const noBrief = await api('/api/labs', {
    token: instructorToken,
    method: 'POST',
    body: { title: `No brief ${stamp}`, courseId, status: 'draft', labMode: 'real' },
  });
  check('real lab without task brief rejected', noBrief.status === 400, `status=${noBrief.status}`);

  // real + open-to-all is rejected
  const realPractice = await api('/api/labs', {
    token: instructorToken,
    method: 'POST',
    body: {
      title: `Real practice clash ${stamp}`,
      courseId,
      status: 'draft',
      labMode: 'real',
      taskBrief: 'Do the thing and show evidence.',
      isPractice: true,
    },
  });
  check('real + open-to-all rejected', realPractice.status === 400, `status=${realPractice.status}`);

  // step creation is blocked on real labs
  const stepOnReal = await api(`/api/labs/${realLab?.id}/steps`, {
    token: instructorToken,
    method: 'POST',
    body: { title: 'Should fail', instruction: 'No steps in real labs.', verification: 'manual' },
  });
  check('adding a step to a real lab is blocked', stepOnReal.status === 400, `status=${stepOnReal.status}`);

  // converting the real lab to open-to-all via PUT is blocked
  const putClash = await api(`/api/labs/${realLab?.id}`, {
    token: instructorToken,
    method: 'PUT',
    body: { isPractice: true },
  });
  check('PUT isPractice=true on real lab blocked', putClash.status === 400, `status=${putClash.status}`);

  // ---------- generated real lab ----------
  const generated = await api('/api/labs/generate', {
    token: instructorToken,
    method: 'POST',
    body: {
      title: `Generated real lab ${stamp}`,
      details: 'Investigate a suspicious login log and report the attacker.',
      difficulty: 'intermediate',
      labMode: 'real',
      minEvidence: 3,
      courseId,
      status: 'draft',
      autoSave: true,
    },
  });
  check('generate real lab returns 201', generated.status === 201, `status=${generated.status}`);
  const genLab = generated.data?.lab;
  if (genLab) created.labs.push(genLab.id);
  check('generated real lab has no steps', (generated.data?.steps?.length ?? -1) === 0, `steps=${generated.data?.steps?.length}`);
  check('generated real lab has a task brief', String(genLab?.task_brief || '').length > 20);
  check('generated real lab keeps min_evidence', Number(genLab?.min_evidence) === 3);

  // ---------- practice lab still works ----------
  const practiceCreate = await api('/api/labs', {
    token: instructorToken,
    method: 'POST',
    body: {
      title: `Guided practice ${stamp}`,
      courseId,
      status: 'published',
      labMode: 'practice',
      difficulty: 'beginner',
      estimatedMinutes: 20,
    },
  });
  check('create practice lab returns 201', practiceCreate.status === 201, `status=${practiceCreate.status}`);
  const practiceLab = practiceCreate.data?.lab;
  if (practiceLab) created.labs.push(practiceLab.id);
  check('practice lab defaults to lab_mode=practice', practiceLab?.lab_mode === 'practice');

  const stepCreate = await api(`/api/labs/${practiceLab?.id}/steps`, {
    token: instructorToken,
    method: 'POST',
    body: {
      title: 'List the home directory',
      instruction: 'Run ls -la in your home directory.',
      hint: 'Use ls with the -la flags.',
      verification: 'command',
      expectedCommand: 'ls -la',
      points: 10,
    },
  });
  check('adding a step to a practice lab works', stepCreate.status === 201, `status=${stepCreate.status}`);

  // ---------- real session: question-only + evidence gating ----------
  const { rows: realSessionRows } = await query(
    `INSERT INTO lab_sessions (lab_id, user_id, provider, status, instance_id, expires_at)
     VALUES ($1,$2,'mock','running','fake-real-session', now() + interval '25 minutes') RETURNING id`,
    [realLab.id, student.id]
  );
  const realSessionId = realSessionRows[0].id;
  created.sessions.push(realSessionId);

  const realOverview = await api(`/api/labs/sessions/${realSessionId}`, { token: studentToken });
  check('real session overview loads', realOverview.status === 200, `status=${realOverview.status}`);
  check('real session reports mode=real', realOverview.data?.mode === 'real');
  check('real session exposes no steps', (realOverview.data?.steps?.length ?? -1) === 0);
  check('real session includes task brief', String(realOverview.data?.lab?.task_brief || '').includes('attacking IP'));
  check('real session reports the lab time limit', Number(realOverview.data?.lab?.time_limit_minutes) === 25);
  check(
    'real session reports remaining seconds',
    Number(realOverview.data?.session?.remaining_seconds) > 0 &&
      Number(realOverview.data?.session?.remaining_seconds) <= 25 * 60,
    `remaining=${realOverview.data?.session?.remaining_seconds}`
  );
  check('running session has no ended reason', !realOverview.data?.session?.ended_reason);
  check('real progress needs 2 evidence files', realOverview.data?.progress?.requiredTotal === 2, JSON.stringify(realOverview.data?.progress));
  check('real progress starts incomplete', realOverview.data?.progress?.allRequiredCompleted === false);

  const earlySubmit = await api(`/api/labs/sessions/${realSessionId}/submit`, {
    token: studentToken,
    method: 'POST',
    body: { note: 'Too early' },
  });
  check('submit blocked before min evidence', earlySubmit.status === 400, `status=${earlySubmit.status}`);

  const shot1 = await upload(`/api/labs/sessions/${realSessionId}/screenshots`, studentToken, PNG, 'one.png');
  check('first evidence upload works', shot1.status === 201, `status=${shot1.status}`);
  if (shot1.data?.screenshot) created.screenshots.push(shot1.data.screenshot.id);

  const midOverview = await api(`/api/labs/sessions/${realSessionId}`, { token: studentToken });
  check('one evidence file is not enough', midOverview.data?.progress?.allRequiredCompleted === false);
  check('evidence count is reported', midOverview.data?.progress?.evidenceCount === 1, `count=${midOverview.data?.progress?.evidenceCount}`);

  const shot2 = await upload(`/api/labs/sessions/${realSessionId}/screenshots`, studentToken, PNG, 'two.png');
  check('second evidence upload works', shot2.status === 201, `status=${shot2.status}`);
  if (shot2.data?.screenshot) created.screenshots.push(shot2.data.screenshot.id);

  const readyOverview = await api(`/api/labs/sessions/${realSessionId}`, { token: studentToken });
  check('two evidence files complete real progress', readyOverview.data?.progress?.allRequiredCompleted === true);

  const submit = await api(`/api/labs/sessions/${realSessionId}/submit`, {
    token: studentToken,
    method: 'POST',
    body: { note: 'Evidence attached.' },
  });
  check('submit succeeds with required evidence', submit.status === 201, `status=${submit.status}`);
  if (submit.data?.submission?.id) created.submissions.push(submit.data.submission.id);
  check('submission evidence records mode=real', submit.data?.submission?.evidence?.lab_mode === 'real');
  check('submission evidence records min_evidence', Number(submit.data?.submission?.evidence?.min_evidence) === 2);
  check('submission evidence has 2 screenshots', (submit.data?.submission?.evidence?.screenshots?.length ?? -1) === 2);

  // report generation is blocked for real labs
  const report = await api(`/api/reports/sessions/${realSessionId}/generate`, {
    token: studentToken,
    method: 'POST',
    body: {},
  });
  check('report generation blocked for real labs', report.status === 400, `status=${report.status}`);

  // ---------- practice session exposes steps ----------
  const { rows: practiceSessionRows } = await query(
    `INSERT INTO lab_sessions (lab_id, user_id, provider, status, instance_id)
     VALUES ($1,$2,'mock','running','fake-practice-session') RETURNING id`,
    [practiceLab.id, student.id]
  );
  const practiceSessionId = practiceSessionRows[0].id;
  created.sessions.push(practiceSessionId);

  const practiceOverview = await api(`/api/labs/sessions/${practiceSessionId}`, { token: studentToken });
  check('practice session overview loads', practiceOverview.status === 200, `status=${practiceOverview.status}`);
  check('practice session reports mode=practice', practiceOverview.data?.mode === 'practice');
  check('practice session exposes its steps', (practiceOverview.data?.steps?.length ?? 0) === 1, `steps=${practiceOverview.data?.steps?.length}`);
  check('practice progress uses step totals', practiceOverview.data?.progress?.requiredTotal === 1);

  // ---------- expired sessions are ended as soon as they are loaded ----------
  const { rows: expiredRows } = await query(
    `INSERT INTO lab_sessions (lab_id, user_id, provider, status, instance_id, expires_at)
     VALUES ($1,$2,'mock','running','fake-expired-session', now() - interval '1 minute') RETURNING id`,
    [realLab.id, student.id]
  );
  const expiredSessionId = expiredRows[0].id;
  created.sessions.push(expiredSessionId);

  const expiredOverview = await api(`/api/labs/sessions/${expiredSessionId}`, { token: studentToken });
  check(
    'expired session is ended on load',
    expiredOverview.status === 200 && expiredOverview.data?.session?.status === 'stopped',
    `status=${expiredOverview.data?.session?.status}`
  );
  check('expired session records ended_reason=expired', expiredOverview.data?.session?.ended_reason === 'expired');
  check(
    'expired session has zero remaining seconds',
    Number(expiredOverview.data?.session?.remaining_seconds) === 0
  );

  // ---------- converted lab hides legacy steps ----------
  const convert = await api(`/api/labs/${practiceLab.id}`, {
    token: instructorToken,
    method: 'PUT',
    body: { labMode: 'real', taskBrief: 'Converted task: prove you can list files.', minEvidence: 1 },
  });
  check('practice lab can convert to real', convert.status === 200 && convert.data?.lab?.lab_mode === 'real', `status=${convert.status}`);
  const convertedOverview = await api(`/api/labs/sessions/${practiceSessionId}`, { token: studentToken });
  check('converted real lab hides legacy steps', (convertedOverview.data?.steps?.length ?? -1) === 0);
  check('converted real lab switches to evidence progress', convertedOverview.data?.progress?.requiredTotal === 1);

  // ---------- list + assignment progress fields ----------
  const listRes = await api('/api/labs?limit=60', { token: studentToken });
  check('authenticated lab list loads', listRes.status === 200, `status=${listRes.status}`);
  const listedReal = (listRes.data?.labs || []).find((lab) => Number(lab.id) === Number(realLab.id));
  check('lab list exposes the time limit', Number(listedReal?.time_limit_minutes) === 25);
  check(
    'lab list exposes progress fields',
    listedReal && 'my_progress_percent' in listedReal && 'my_completed' in listedReal
  );
  check('lab list marks the completed real lab', listedReal?.my_completed === true && listedReal?.my_progress_percent === 100);

  const assignmentsRes = await api('/api/me/lab-assignments', { token: studentToken });
  check('lab assignments load', assignmentsRes.status === 200, `status=${assignmentsRes.status}`);
  const assignment = (assignmentsRes.data?.labAssignments || []).find((lab) => Number(lab.id) === Number(realLab.id));
  check('lab assignment exposes the time limit', Number(assignment?.time_limit_minutes) === 25);
  check(
    'lab assignment exposes progress',
    Number.isFinite(Number(assignment?.progress_percent)) && typeof assignment?.is_completed === 'boolean'
  );
  check('lab assignment marks the completed real lab', assignment?.is_completed === true && Number(assignment?.progress_percent) === 100);

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
} catch (error) {
  console.error('SMOKE ERROR:', error);
  failures += 1;
} finally {
  try {
    if (created.screenshots.length) {
      const { rows } = await query('SELECT file_path FROM screenshots WHERE id = ANY($1::bigint[])', [created.screenshots]);
      for (const row of rows) {
        const file = row.file_path.replace(/^\//, '');
        try { fs.rmSync(file, { force: true }); } catch { /* ignore */ }
      }
    }
    if (created.sessions.length) {
      await query('DELETE FROM lab_sessions WHERE id = ANY($1::bigint[])', [created.sessions]);
    }
    if (created.labs.length) {
      await query('DELETE FROM labs WHERE id = ANY($1::bigint[])', [created.labs]);
    }
    if (created.courses.length) {
      await query('DELETE FROM courses WHERE id = ANY($1::bigint[])', [created.courses]);
    }
    if (created.users.length) {
      await query('DELETE FROM users WHERE id = ANY($1::bigint[])', [created.users]);
    }
  } catch (cleanupError) {
    console.error('cleanup warning:', cleanupError.message);
  }
  server.close();
  await pool.end().catch(() => {});
  process.exit(failures === 0 ? 0 : 1);
}
