import { query, withTransaction } from '../config/db.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { notify, recordActivity } from '../utils/activity.js';
import { hashPassword } from './authService.js';

/**
 * Hierarchical moderator management.
 *
 *   Admin -> Senior Moderator -> Subject/Course Moderator -> Instructors
 *
 * Scope is always derived from rows in `moderator_assignments`, never from the
 * role name alone. A moderator can only ever reach the courses, instructors and
 * reports explicitly assigned to them. Nothing here grants admin capabilities
 * (platform settings, VPS/lab servers, API keys, Docker control).
 */

export const MODERATOR_TIERS = ['senior_moderator', 'subject_moderator'];
export const ASSIGNMENT_KINDS = ['subject_moderator', 'course', 'instructor', 'subject'];
export const REPORT_STATUSES = ['open', 'in_review', 'escalated', 'resolved', 'dismissed'];
export const REPORT_KINDS = ['complaint', 'content_quality', 'moderation_task', 'escalation'];
export const REPORT_SEVERITIES = ['low', 'normal', 'high', 'urgent'];

/** Resolves the moderator profile row (or null) for a user id. */
export async function getModeratorByUser(userId) {
  const { rows } = await query(
    `SELECT m.*, u.email, u.full_name AS user_name, u.avatar_url, u.is_active AS user_active,
            c.full_name AS created_by_name
     FROM moderators m
     JOIN users u ON u.id = m.user_id
     LEFT JOIN users c ON c.id = m.created_by
     WHERE m.user_id = $1`,
    [userId]
  );
  return rows[0] || null;
}

export async function getModeratorOr404(id) {
  const { rows } = await query(
    `SELECT m.*, u.email, u.full_name AS user_name, u.avatar_url, u.is_active AS user_active
     FROM moderators m JOIN users u ON u.id = m.user_id WHERE m.id = $1`,
    [id]
  );
  if (!rows[0]) throw notFound('Moderator not found.');
  return rows[0];
}

async function loadAssignments(moderatorIds) {
  if (!moderatorIds.length) return new Map();
  const { rows } = await query(
    `SELECT ma.id, ma.moderator_id, ma.kind, ma.course_id, ma.instructor_id, ma.moderator_target_id,
            ma.subject, ma.created_at,
            c.title AS course_title, c.slug AS course_slug,
            i.full_name AS instructor_name, i.email AS instructor_email,
            sm.user_id AS subject_moderator_user_id,
            smu.full_name AS subject_moderator_name
     FROM moderator_assignments ma
     LEFT JOIN courses c ON c.id = ma.course_id
     LEFT JOIN users i ON i.id = ma.instructor_id
     LEFT JOIN moderators sm ON sm.id = ma.moderator_target_id
     LEFT JOIN users smu ON smu.id = sm.user_id
     WHERE ma.moderator_id = ANY($1::bigint[])
     ORDER BY ma.kind, ma.id`,
    [moderatorIds]
  );
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.moderator_id)) map.set(row.moderator_id, []);
    map.get(row.moderator_id).push(row);
  }
  return map;
}

function decorate(moderator, assignments = []) {
  return {
    ...moderator,
    assignments,
    assignment_counts: {
      courses: assignments.filter((a) => a.kind === 'course').length,
      instructors: assignments.filter((a) => a.kind === 'instructor').length,
      subjects: assignments.filter((a) => a.kind === 'subject').length,
      subject_moderators: assignments.filter((a) => a.kind === 'subject_moderator').length,
    },
  };
}

/** Admin: full moderator roster with their assignments. */
export async function listModerators({ tier, status, search } = {}) {
  const where = [];
  const params = [];
  if (tier && tier !== 'all') {
    params.push(tier);
    where.push(`m.tier = $${params.length}`);
  }
  if (status && status !== 'all') {
    params.push(status);
    where.push(`m.status = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT m.id, m.user_id, m.tier, m.display_name, m.notes, m.status, m.created_by,
            m.created_at, m.updated_at,
            u.email, u.full_name AS user_name, u.avatar_url, u.is_active AS user_active,
            (SELECT COUNT(*)::int FROM moderation_reports r
              WHERE r.subject_moderator_id = m.id AND r.status IN ('open', 'in_review')) AS open_reports
     FROM moderators m JOIN users u ON u.id = m.user_id
     ${whereSql}
     ORDER BY CASE m.tier WHEN 'senior_moderator' THEN 0 ELSE 1 END, lower(u.full_name)`,
    params
  );

  const assignments = await loadAssignments(rows.map((row) => row.id));
  return rows.map((row) => decorate(row, assignments.get(row.id) || []));
}

/**
 * Admin: create a moderator account. Creates the user with the matching role
 * and a moderator profile in one transaction.
 */
export async function createModerator({ admin, email, fullName, password, tier, displayName = '', notes = '', assignments = [] }) {
  if (!MODERATOR_TIERS.includes(tier)) throw badRequest('Choose a valid moderator tier.');
  if (tier === 'senior_moderator' && assignments.some((a) => a.kind === 'instructor' || a.kind === 'course')) {
    // Senior moderators supervise subject moderators; course/instructor scope
    // belongs to the subject moderators they oversee.
    throw badRequest('Senior moderators are assigned subject moderators, not courses or instructors.');
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const { rows: existing } = await query('SELECT id FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
  if (existing[0]) throw conflict('A user with that email already exists.');

  const passwordHash = await hashPassword(password);

  const moderator = await withTransaction(async (client) => {
    const { rows: userRows } = await client.query(
      `INSERT INTO users (email, password_hash, full_name, role, is_active, email_verified_at)
       VALUES ($1, $2, $3, $4, TRUE, now())
       RETURNING id, email, full_name, role`,
      [normalizedEmail, passwordHash, fullName, tier]
    );
    const user = userRows[0];

    const { rows: modRows } = await client.query(
      `INSERT INTO moderators (user_id, tier, display_name, notes, status, created_by)
       VALUES ($1, $2, $3, $4, 'active', $5)
       RETURNING *`,
      [user.id, tier, displayName || fullName, notes, admin.id]
    );

    await recordActivity(client, {
      userId: admin.id,
      action: 'moderator.created',
      entityType: 'moderator',
      entityId: modRows[0].id,
      metadata: { tier, email: normalizedEmail },
    });

    return { ...modRows[0], email: user.email, user_name: user.full_name };
  });

  if (assignments.length) {
    await replaceAssignments({ moderatorId: moderator.id, assignments, actor: admin });
  }

  await withTransaction((client) =>
    notify(client, {
      userIds: [moderator.user_id],
      type: 'moderation',
      title: 'Welcome to the moderation team',
      body: tier === 'senior_moderator'
        ? 'You have been added as a Senior Moderator. Your supervision assignments appear on your dashboard.'
        : 'You have been added as a Subject/Course Moderator. Your assigned courses and instructors appear on your dashboard.',
      link: tier === 'senior_moderator' ? '/moderator/senior' : '/moderator/subject',
    })
  );

  return getModeratorOr404(moderator.id);
}

export async function updateModerator({ id, admin, tier, displayName, notes, status }) {
  const existing = await getModeratorOr404(id);
  const nextTier = tier ?? existing.tier;
  if (!MODERATOR_TIERS.includes(nextTier)) throw badRequest('Choose a valid moderator tier.');

  const updated = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE moderators SET
         tier = COALESCE($1, tier),
         display_name = COALESCE($2, display_name),
         notes = COALESCE($3, notes),
         status = COALESCE($4, status)
       WHERE id = $5 RETURNING *`,
      [tier ?? null, displayName ?? null, notes ?? null, status ?? null, existing.id]
    );
    // Keep the auth role in sync when the tier changes so requireRole stays correct.
    if (tier && tier !== existing.tier) {
      await client.query('UPDATE users SET role = $1 WHERE id = $2', [tier, existing.user_id]);
    }
    await recordActivity(client, {
      userId: admin.id,
      action: 'moderator.updated',
      entityType: 'moderator',
      entityId: existing.id,
      metadata: { tier: nextTier, status: status ?? existing.status },
    });
    return rows[0];
  });

  return { ...updated, email: existing.email, user_name: existing.user_name };
}

/** Admin: remove a moderator entirely (profile + account downgrade). */
export async function deleteModerator({ id, admin }) {
  const existing = await getModeratorOr404(id);
  await withTransaction(async (client) => {
    await client.query('DELETE FROM moderators WHERE id = $1', [existing.id]);
    // Deactivate rather than delete: preserves every record the moderator
    // touched (assignments/reports cascade away, history is retained).
    await client.query(`UPDATE users SET is_active = FALSE, role = 'student' WHERE id = $1`, [existing.user_id]);
    await recordActivity(client, {
      userId: admin.id,
      action: 'moderator.removed',
      entityType: 'moderator',
      entityId: existing.id,
      metadata: { email: existing.email, tier: existing.tier },
    });
  });
  return { ok: true };
}

/**
 * Admin: replace a moderator's full assignment set. Validates every target and
 * rejects cross-tier nonsense (e.g. a subject moderator supervising another
 * moderator, or a senior moderator owning a course).
 */
export async function replaceAssignments({ moderatorId, assignments, actor }) {
  const moderator = await getModeratorOr404(moderatorId);

  const seen = new Set();
  for (const item of assignments) {
    if (!ASSIGNMENT_KINDS.includes(item.kind)) throw badRequest(`Unknown assignment type: ${item.kind}.`);

    if (moderator.tier === 'senior_moderator') {
      if (item.kind !== 'subject_moderator' && item.kind !== 'subject') {
        throw badRequest('Senior moderators can only be assigned subject moderators or subjects.');
      }
    } else if (item.kind === 'subject_moderator') {
      throw badRequest('Only senior moderators supervise other moderators.');
    }

    if (item.kind === 'subject_moderator') {
      const target = await getModeratorOr404(item.subjectModeratorId);
      if (target.tier !== 'subject_moderator') throw badRequest('Only subject moderators can be supervised.');
      item.moderatorTargetId = target.id;
      item.instructorId = null;
    }
    if (item.kind === 'course') {
      const { rows } = await query('SELECT id FROM courses WHERE id = $1', [item.courseId]);
      if (!rows[0]) throw badRequest(`Course ${item.courseId} does not exist.`);
    }
    if (item.kind === 'instructor') {
      const { rows } = await query(`SELECT id FROM users WHERE id = $1 AND role = 'instructor'`, [item.instructorId]);
      if (!rows[0]) throw badRequest(`Instructor ${item.instructorId} does not exist.`);
    }

    const key = `${item.kind}:${item.courseId || 0}:${item.instructorId || 0}:${item.moderatorTargetId || 0}:${item.subject || ''}`;
    if (seen.has(key)) throw badRequest('Duplicate assignment in the same request.');
    seen.add(key);
  }

  await withTransaction(async (client) => {
    await client.query('DELETE FROM moderator_assignments WHERE moderator_id = $1', [moderator.id]);
    for (const item of assignments) {
      await client.query(
        `INSERT INTO moderator_assignments
           (moderator_id, kind, course_id, instructor_id, moderator_target_id, subject, assigned_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          moderator.id,
          item.kind,
          item.courseId ?? null,
          item.instructorId ?? null,
          item.moderatorTargetId ?? null,
          item.subject || null,
          actor.id,
        ]
      );
    }
    await recordActivity(client, {
      userId: actor.id,
      action: 'moderator.assignments_updated',
      entityType: 'moderator',
      entityId: moderator.id,
      metadata: { count: assignments.length, tier: moderator.tier },
    });

    if (assignments.length > 0) {
      await notify(client, {
        userIds: [moderator.user_id],
        type: 'moderation',
        title: 'Your moderation assignments were updated',
        body: `You now have ${assignments.length} assignment${assignments.length === 1 ? '' : 's'}.`,
        link: moderator.tier === 'senior_moderator' ? '/moderator/senior' : '/moderator/subject',
      });
    }
  });

  return getModeratorOr404(moderator.id);
}

/**
 * Scope resolver used by every moderator-facing query.
 * Returns the ids this moderator is allowed to see. Admins are not scoped here
 * (they use the admin endpoints); this is strictly for moderator sessions.
 */
export async function getModeratorScope(moderatorId) {
  const moderator = await getModeratorOr404(moderatorId);
  const { rows } = await query(
    `SELECT kind, course_id, instructor_id, moderator_target_id, subject
     FROM moderator_assignments WHERE moderator_id = $1`,
    [moderator.id]
  );

  const courseIds = rows.filter((r) => r.kind === 'course' && r.course_id).map((r) => Number(r.course_id));
  const instructorIds = rows.filter((r) => r.kind === 'instructor' && r.instructor_id).map((r) => Number(r.instructor_id));
  const subjects = rows.filter((r) => r.kind === 'subject' && r.subject).map((r) => r.subject);
  const supervisedModeratorIds = rows
    .filter((r) => r.kind === 'subject_moderator' && r.moderator_target_id)
    .map((r) => Number(r.moderator_target_id));

  // A course assignment implicitly grants oversight of that course's instructor.
  if (courseIds.length) {
    const { rows: ownerRows } = await query(
      `SELECT DISTINCT instructor_id FROM courses WHERE id = ANY($1::bigint[]) AND instructor_id IS NOT NULL`,
      [courseIds]
    );
    for (const row of ownerRows) {
      const id = Number(row.instructor_id);
      if (!instructorIds.includes(id)) instructorIds.push(id);
    }
  }

  return { moderator, courseIds, instructorIds, subjects, supervisedModeratorIds };
}

/** Throws unless the moderator may act on this course. */
export async function assertCourseInScope(moderatorId, courseId) {
  if (!courseId) return;
  const scope = await getModeratorScope(moderatorId);
  if (scope.courseIds.includes(Number(courseId))) return;

  // Subject assignments also grant access to any course in that subject.
  if (scope.subjects.length) {
    const { rows } = await query(
      `SELECT 1 FROM courses
       WHERE id = $1 AND (category = ANY($2::text[]) OR subcategory = ANY($2::text[]))`,
      [courseId, scope.subjects]
    );
    if (rows[0]) return;
  }
  throw forbidden('This course is not part of your assigned moderation scope.');
}

export async function assertInstructorInScope(moderatorId, instructorId) {
  const scope = await getModeratorScope(moderatorId);
  if (scope.instructorIds.includes(Number(instructorId))) return;
  throw forbidden('This instructor is not part of your assigned moderation scope.');
}

/** Guard: a senior moderator may only act on the subject moderators they supervise. */
export async function assertSupervisesModerator(seniorModeratorId, subjectModeratorId) {
  const scope = await getModeratorScope(seniorModeratorId);
  if (scope.supervisedModeratorIds.includes(Number(subjectModeratorId))) return;
  throw forbidden('This subject moderator is not part of your supervision scope.');
}

/** Which moderator(s) own this course/instructor, for routing notifications. */
export async function findModeratorsForCourse(courseId) {
  if (!courseId) return [];
  const { rows } = await query(
    `SELECT DISTINCT m.id, m.tier, m.user_id
     FROM moderators m
     JOIN moderator_assignments ma ON ma.moderator_id = m.id
     WHERE m.status = 'active'
       AND (ma.course_id = $1
            OR ma.instructor_id = (SELECT instructor_id FROM courses WHERE id = $1)
            OR (ma.kind = 'subject'
                AND ma.subject IN (SELECT category FROM courses WHERE id = $1
                                   UNION SELECT subcategory FROM courses WHERE id = $1)))`,
    [courseId]
  );
  return rows;
}

/** Notify the moderators responsible for a course (and their seniors). */
export async function notifyCourseModerators(client, { courseId, type = 'moderation', title, body, link }) {
  const direct = await findModeratorsForCourse(courseId);
  const userIds = new Set(direct.map((row) => Number(row.user_id)));

  if (direct.length) {
    const { rows: seniors } = await query(
      `SELECT DISTINCT sm.user_id
       FROM moderator_assignments ma
       JOIN moderators sm ON sm.id = ma.moderator_id
       WHERE ma.kind = 'subject_moderator'
         AND ma.moderator_target_id = ANY($1::bigint[])`,
      [direct.map((row) => row.id)]
    );
    for (const row of seniors) userIds.add(Number(row.user_id));
  }

  const ids = [...userIds];
  if (ids.length) await notify(client, { userIds: ids, type, title, body, link });
  return ids;
}
