import { query, pool } from '../src/config/db.js';
import { getModeratorScope, listModerators, replaceAssignments } from '../src/services/moderators.js';
import { moderationStats, listModerationReports } from '../src/services/moderationReports.js';

/**
 * Exercises the actual service functions against the live schema.
 * Creates fixtures, runs reads, then deletes everything it created.
 */
let failures = 0;
const check = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? `  (${extra})` : ''}`);
  if (!cond) failures += 1;
};

const created = { users: [], moderators: [], courses: [] };

try {
  const mkUser = async (email, role) => {
    const { rows } = await query(
      `INSERT INTO users (email,password_hash,full_name,role) VALUES ($1,'x',$2,$3) RETURNING id`,
      [email, email, role]
    );
    created.users.push(rows[0].id);
    return rows[0].id;
  };

  const adminId = await mkUser(`svc-admin-${Date.now()}@x.io`, 'admin');
  const seniorUserId = await mkUser(`svc-senior-${Date.now()}@x.io`, 'senior_moderator');
  const subjectUserId = await mkUser(`svc-subject-${Date.now()}@x.io`, 'subject_moderator');
  const instructorId = await mkUser(`svc-instr-${Date.now()}@x.io`, 'instructor');

  const { rows: courseRows } = await query(
    `INSERT INTO courses (slug,title,instructor_id,status,category)
     VALUES ($1,'Svc Course',$2,'published','Linux') RETURNING id`,
    [`svc-course-${Date.now()}`, instructorId]
  );
  created.courses.push(courseRows[0].id);
  const courseId = courseRows[0].id;

  const { rows: seniorRows } = await query(
    `INSERT INTO moderators (user_id,tier,created_by) VALUES ($1,'senior_moderator',$2) RETURNING id`,
    [seniorUserId, adminId]
  );
  created.moderators.push(seniorRows[0].id);
  const { rows: subjectRows } = await query(
    `INSERT INTO moderators (user_id,tier,created_by) VALUES ($1,'subject_moderator',$2) RETURNING id`,
    [subjectUserId, adminId]
  );
  created.moderators.push(subjectRows[0].id);
  const seniorId = seniorRows[0].id;
  const subjectId = subjectRows[0].id;

  // ---- service: replaceAssignments (admin actions) ----
  await replaceAssignments({
    moderatorId: subjectId,
    assignments: [
      { kind: 'course', courseId },
      { kind: 'instructor', instructorId },
    ],
    actor: { id: adminId },
  });
  await replaceAssignments({
    moderatorId: seniorId,
    assignments: [{ kind: 'subject_moderator', subjectModeratorId: subjectId }],
    actor: { id: adminId },
  });
  check('replaceAssignments persisted both tiers', true);

  // ---- service: scope resolution ----
  const subjectScope = await getModeratorScope(subjectId);
  check('subject scope has the assigned course', subjectScope.courseIds.includes(Number(courseId)));
  check('subject scope has the assigned instructor', subjectScope.instructorIds.includes(Number(instructorId)));

  const seniorScope = await getModeratorScope(seniorId);
  check('senior scope has the supervised subject moderator', seniorScope.supervisedModeratorIds.includes(Number(subjectId)));

  // ---- service: listModerators (admin roster) ----
  const roster = await listModerators({ search: 'svc-' });
  check('listModerators returns scoped roster', roster.length >= 2, `${roster.length} rows`);
  const decorated = roster.find((m) => m.id === subjectId);
  check('roster decorates assignment counts', decorated?.assignment_counts.courses === 1);

  // ---- service: stats ----
  const adminStats = await moderationStats({ id: adminId, role: 'admin' });
  check('admin moderationStats returns moderator count', Number(adminStats.moderators) >= 2);

  const subjectStats = await moderationStats({ id: subjectUserId, role: 'subject_moderator' });
  check('subject moderationStats returns course count', Number(subjectStats.courses) === 1);

  const seniorStats = await moderationStats({ id: seniorUserId, role: 'senior_moderator' });
  check('senior moderationStats supervised count', Number(seniorStats.supervised_moderators) === 1);

  // ---- service: scoped report listing ----
  const { rows: reportRows } = await query(
    `INSERT INTO moderation_reports (reporter_id,subject_moderator_id,course_id,title,kind)
     VALUES ($1,$2,$3,'Service complaint','complaint') RETURNING id`,
    [instructorId, subjectId, courseId]
  );
  const subjectList = await listModerationReports({ user: { id: subjectUserId, role: 'subject_moderator' } });
  check('subject sees their own report', subjectList.total >= 1);

  const seniorList = await listModerationReports({ user: { id: seniorUserId, role: 'senior_moderator' } });
  check('senior sees reports of supervised moderator', seniorList.total >= 1);

  const seniorStatsAfter = await moderationStats({ id: seniorUserId, role: 'senior_moderator' });
  check('senior moderationStats sees supervised open reports', Number(seniorStatsAfter.open_reports) >= 1);

  await query('DELETE FROM moderation_reports WHERE id = $1', [reportRows[0].id]);
} catch (error) {
  console.error('SERVICE TEST ERROR:', error.message);
  failures += 1;
} finally {
  // Clean up everything this test created (order respects FKs).
  for (const id of created.moderators) await query('DELETE FROM moderators WHERE id = $1', [id]).catch(() => {});
  for (const id of created.courses) await query('DELETE FROM courses WHERE id = $1', [id]).catch(() => {});
  for (const id of created.users) await query('DELETE FROM users WHERE id = $1', [id]).catch(() => {});
  await pool.end();
  console.log(failures === 0 ? '\nALL SERVICE CHECKS PASSED' : `\n${failures} SERVICE CHECK(S) FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}
