import { createApp } from '../src/app.js';
import { runMigrations } from '../src/db/migrate.js';
import { query, pool } from '../src/config/db.js';
import { hashPassword, signAccessToken } from '../src/services/authService.js';

/**
 * Live HTTP smoke test of the moderator endpoints.
 * Creates fixtures with real bcrypt passwords + signed tokens, hits the API via
 * an ephemeral server, asserts RBAC, then removes every row it created.
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

const created = { users: [], moderators: [], courses: [] };
const stamp = Date.now();
const pw = await hashPassword('Moderator!2345');

const mkUser = async (email, role, passwordHash = pw) => {
  const { rows } = await query(
    `INSERT INTO users (email,password_hash,full_name,role,is_active,email_verified_at)
     VALUES ($1,$2,$3,$4,TRUE,now()) RETURNING id,email,role`,
    [email, passwordHash, email, role]
  );
  created.users.push(rows[0].id);
  return rows[0];
};

try {
  const admin = await mkUser(`smoke-admin-${stamp}@x.io`, 'admin');
  const student = await mkUser(`smoke-student-${stamp}@x.io`, 'student');

  const adminToken = signAccessToken(admin);
  const studentToken = signAccessToken(student);

  // Admin creates a senior moderator through the real API.
  const createRes = await api('/api/moderators', {
    token: adminToken,
    method: 'POST',
    body: {
      email: `smoke-senior-${stamp}@x.io`,
      fullName: 'Smoke Senior',
      password: 'Moderator!2345',
      tier: 'senior_moderator',
    },
  });
  check('admin can create a senior moderator', createRes.status === 201, `status ${createRes.status}`);
  const seniorModeratorId = createRes.data?.moderator?.id;
  if (createRes.data?.moderator) {
    created.moderators.push(seniorModeratorId);
    created.users.push(createRes.data.moderator.user_id);
  }

  // The new moderator can sign in with the password the admin set.
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: { email: `smoke-senior-${stamp}@x.io`, password: 'Moderator!2345' },
  });
  check('new moderator can authenticate', login.status === 200, `status ${login.status}`);
  const seniorToken = login.data?.accessToken || login.data?.token || null;
  check('login returned an access token', Boolean(seniorToken));

  // A student must NOT reach the admin moderator management API.
  const studentBlocked = await api('/api/moderators', { token: studentToken });
  check('student blocked from /api/moderators', studentBlocked.status === 403, `status ${studentBlocked.status}`);

  // A student can raise a complaint.
  const complaint = await api('/api/moderation/reports', {
    token: studentToken,
    method: 'POST',
    body: { title: 'Smoke complaint', body: 'Testing the new system.', kind: 'complaint', severity: 'normal' },
  });
  check('student can raise a moderation complaint', complaint.status === 201, `status ${complaint.status}`);
  const reportId = complaint.data?.report?.id;

  // The senior moderator can read their workspace.
  if (seniorToken) {
    const ws = await api('/api/moderation/workspace', { token: seniorToken });
    check('senior moderator can load workspace', ws.status === 200, `status ${ws.status}`);

    const stats = await api('/api/moderation/stats', { token: seniorToken });
    check('senior moderator can load stats', stats.status === 200, `status ${stats.status}`);
  }

  // A student must NOT reach the moderator workspace.
  const wsBlocked = await api('/api/moderation/workspace', { token: studentToken });
  check('student blocked from moderator workspace', wsBlocked.status === 403, `status ${wsBlocked.status}`);

  // A moderator must NOT reach admin-only infrastructure endpoints.
  if (seniorToken) {
    const infra = await api('/api/admin/lab-servers', { token: seniorToken });
    check('moderator blocked from admin lab servers', infra.status === 403, `status ${infra.status}`);

    const users = await api('/api/admin/users', { token: seniorToken });
    check('moderator blocked from admin users', users.status === 403, `status ${users.status}`);
  }

  if (reportId) await query('DELETE FROM moderation_reports WHERE id = $1', [reportId]);
} catch (error) {
  console.error('SMOKE ERROR:', error.message);
  failures += 1;
} finally {
  for (const id of created.moderators) await query('DELETE FROM moderators WHERE id = $1', [id]).catch(() => {});
  for (const id of created.courses) await query('DELETE FROM courses WHERE id = $1', [id]).catch(() => {});
  for (const id of created.users) await query('DELETE FROM users WHERE id = $1', [id]).catch(() => {});
  server.close();
  await pool.end();
  console.log(failures === 0 ? '\nALL SMOKE CHECKS PASSED' : `\n${failures} SMOKE CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}
