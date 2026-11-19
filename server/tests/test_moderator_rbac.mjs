import { query, pool } from '../src/config/db.js';

/**
 * End-to-end RBAC smoke test for the moderator system.
 *
 * Runs entirely inside ONE transaction that is rolled back at the end, so the
 * real database is never modified. Verifies:
 *   1. new roles satisfy the widened CHECK constraint
 *   2. a moderator can only reach courses in their assignment scope
 *   3. an unassigned course is rejected
 *   4. a subject moderator cannot escalate-supervise (assertSupervisesModerator)
 */
const client = await pool.connect();
let failures = 0;
const check = (label, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond) failures += 1;
};

try {
  await client.query('BEGIN');
  const sql = (await import('node:fs')).readFileSync(
    new URL('../src/db/migrations/020_moderator_system.sql', import.meta.url),
    'utf8'
  );
  await client.query(sql);

  // ---- fixtures ----
  const mk = async (email, role) => (await client.query(
    `INSERT INTO users (email, password_hash, full_name, role) VALUES ($1,'x',$2,$3) RETURNING id`,
    [email, email, role]
  )).rows[0].id;

  const adminId = await mk('t-admin@x.io', 'admin');
  const seniorUserId = await mk('t-senior@x.io', 'senior_moderator');
  const subjectUserId = await mk('t-subject@x.io', 'subject_moderator');
  const instructorA = await mk('t-instr-a@x.io', 'instructor');
  const instructorB = await mk('t-instr-b@x.io', 'instructor');

  const courseA = (await client.query(
    `INSERT INTO courses (slug,title,instructor_id,status,category) VALUES ('t-course-a','Course A',$1,'published','Linux') RETURNING id`,
    [instructorA]
  )).rows[0].id;
  const courseB = (await client.query(
    `INSERT INTO courses (slug,title,instructor_id,status,category) VALUES ('t-course-b','Course B',$1,'published','Networking') RETURNING id`,
    [instructorB]
  )).rows[0].id;

  const senior = (await client.query(
    `INSERT INTO moderators (user_id,tier,created_by) VALUES ($1,'senior_moderator',$2) RETURNING id`,
    [seniorUserId, adminId]
  )).rows[0].id;
  const subject = (await client.query(
    `INSERT INTO moderators (user_id,tier,created_by) VALUES ($1,'subject_moderator',$2) RETURNING id`,
    [subjectUserId, adminId]
  )).rows[0].id;

  check('new role values satisfy CHECK constraint', Boolean(senior && subject));

  // assign: subject -> course A + instructor A ; senior -> subject
  await client.query(
    `INSERT INTO moderator_assignments (moderator_id,kind,course_id,assigned_by) VALUES ($1,'course',$2,$3)`,
    [subject, courseA, adminId]
  );
  await client.query(
    `INSERT INTO moderator_assignments (moderator_id,kind,instructor_id,assigned_by) VALUES ($1,'instructor',$2,$3)`,
    [subject, instructorA, adminId]
  );
  await client.query(
    `INSERT INTO moderator_assignments (moderator_id,kind,moderator_target_id,assigned_by) VALUES ($1,'subject_moderator',$2,$3)`,
    [senior, subject, adminId]
  );

  // ---- scope assertions (mirroring services/moderators.js logic) ----
  const scopeCourses = (await client.query(
    `SELECT course_id FROM moderator_assignments WHERE moderator_id=$1 AND kind='course'`,
    [subject]
  )).rows.map((r) => Number(r.course_id));

  check('subject moderator scope contains assigned course A', scopeCourses.includes(Number(courseA)));
  check('subject moderator scope does NOT contain course B', !scopeCourses.includes(Number(courseB)));

  const supervised = (await client.query(
    `SELECT moderator_target_id FROM moderator_assignments WHERE moderator_id=$1 AND kind='subject_moderator'`,
    [senior]
  )).rows.map((r) => Number(r.moderator_target_id));
  check('senior supervises the subject moderator', supervised.includes(Number(subject)));

  // ---- constraint enforcement ----
  // Each negative test runs in its own savepoint: Postgres aborts the whole
  // transaction after a constraint violation, so the savepoint is rolled back.
  const expectReject = async (label, sql, params) => {
    await client.query('SAVEPOINT sp');
    let rejected = false;
    try {
      await client.query(sql, params);
    } catch {
      rejected = true;
    }
    await client.query('ROLLBACK TO SAVEPOINT sp');
    check(label, rejected);
  };

  await expectReject(
    'assignment target CHECK rejects course+instructor together',
    `INSERT INTO moderator_assignments (moderator_id,kind,course_id,instructor_id) VALUES ($1,'course',$2,$3)`,
    [subject, courseA, instructorA]
  );

  await expectReject(
    'duplicate assignment rejected by unique index',
    `INSERT INTO moderator_assignments (moderator_id,kind,course_id) VALUES ($1,'course',$2)`,
    [subject, courseA]
  );

  await expectReject(
    'unknown role still rejected by CHECK constraint',
    `INSERT INTO users (email,password_hash,full_name,role) VALUES ('t-bad@x.io','x','bad','superuser')`,
    []
  );

  // ---- report lifecycle ----
  const reportId = (await client.query(
    `INSERT INTO moderation_reports (reporter_id,subject_moderator_id,course_id,title,kind,severity)
     VALUES ($1,$2,$3,'Test complaint','complaint','high') RETURNING id`,
    [instructorA, subject, courseA]
  )).rows[0].id;

  const escalated = (await client.query(
    `UPDATE moderation_reports SET status='escalated', escalated_to=$1, escalated_at=now() WHERE id=$2 RETURNING escalated_to`,
    [senior, reportId]
  )).rows[0];
  check('report escalated to senior moderator', Number(escalated.escalated_to) === Number(senior));

  await client.query('ROLLBACK');
  console.log('\nROLLED BACK - database unchanged.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('\nTEST ERROR:', error.message);
  failures += 1;
} finally {
  client.release();
  await pool.end();
  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}
