import { query, withTransaction } from '../config/db.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { notify, recordActivity } from '../utils/activity.js';
import {
  REPORT_STATUSES,
  REPORT_KINDS,
  REPORT_SEVERITIES,
} from './moderators.js';

/**
 * Moderation reports: student/staff complaints, content-quality flags,
 * moderation tasks and escalations.
 *
 * Visibility is derived from the moderator's assignment scope, never the role:
 *   * subject moderator -> reports for their assigned courses/instructors
 *   * senior moderator  -> reports handled by the moderators they supervise
 * Admins keep the platform-wide record.
 */

const REPORT_COLUMNS = `
  r.id, r.reporter_id, r.subject_moderator_id, r.course_id, r.instructor_id, r.student_id,
  r.title, r.body, r.kind, r.severity, r.status, r.escalated_to, r.escalated_at,
  r.resolution, r.resolved_by, r.resolved_at, r.created_at, r.updated_at`;

const REPORT_JOINS = `
  FROM moderation_reports r
  LEFT JOIN users rep ON rep.id = r.reporter_id
  LEFT JOIN users inst ON inst.id = r.instructor_id
  LEFT JOIN users stu ON stu.id = r.student_id
  LEFT JOIN courses c ON c.id = r.course_id
  LEFT JOIN moderators sm ON sm.id = r.subject_moderator_id
  LEFT JOIN users smu ON smu.id = sm.user_id
  LEFT JOIN moderators esc ON esc.id = r.escalated_to
  LEFT JOIN users escu ON escu.id = esc.user_id`;

function reportView(row) {
  if (!row) return null;
  return {
    ...row,
    reporter_name: row.reporter_name || null,
    instructor_name: row.instructor_name || null,
    student_name: row.student_name || null,
    course_title: row.course_title || null,
    subject_moderator_name: row.subject_moderator_name || null,
    escalated_to_name: row.escalated_to_name || null,
    is_escalated: row.status === 'escalated' || Boolean(row.escalated_to),
  };
}

/** Role-aware list. Admin sees all; moderators see their scoped slice. */
export async function listModerationReports({ user, status, kind, severity, search, page = 1, limit = 20 }) {
  const params = [];
  const where = [];

  if (user.role === 'admin') {
    // no scope restriction
  } else {
    const { rows: me } = await query('SELECT id, tier FROM moderators WHERE user_id = $1', [user.id]);
    const moderator = me[0];
    if (!moderator) throw forbidden('Your account has no moderator profile.');

    if (moderator.tier === 'senior_moderator') {
      // Reports escalated to them, plus everything handled by the subject
      // moderators they supervise.
      params.push(moderator.id);
      where.push(
        `(r.escalated_to = $${params.length} OR r.subject_moderator_id IN (
            SELECT ma.moderator_target_id FROM moderator_assignments ma
            WHERE ma.moderator_id = $${params.length} AND ma.kind = 'subject_moderator'
         ))`
      );
    } else {
      params.push(moderator.id);
      where.push(`r.subject_moderator_id = $${params.length}`);
    }
  }

  if (status && status !== 'all') {
    params.push(status);
    where.push(`r.status = $${params.length}`);
  }
  if (kind && kind !== 'all') {
    params.push(kind);
    where.push(`r.kind = $${params.length}`);
  }
  if (severity && severity !== 'all') {
    params.push(severity);
    where.push(`r.severity = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(r.title ILIKE $${params.length} OR r.body ILIKE $${params.length})`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total ${REPORT_JOINS} ${whereSql}`,
    params
  );

  const { rows } = await query(
    `SELECT ${REPORT_COLUMNS},
            rep.full_name AS reporter_name,
            inst.full_name AS instructor_name,
            stu.full_name AS student_name,
            c.title AS course_title,
            smu.full_name AS subject_moderator_name,
            escu.full_name AS escalated_to_name
     ${REPORT_JOINS} ${whereSql}
     ORDER BY CASE r.status WHEN 'escalated' THEN 0 WHEN 'open' THEN 1 WHEN 'in_review' THEN 2 ELSE 3 END,
              CASE r.severity WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
              r.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return { reports: rows.map(reportView), total: countRows[0].total, page, limit };
}

export async function getModerationReport(id) {
  const { rows } = await query(
    `SELECT ${REPORT_COLUMNS},
            rep.full_name AS reporter_name, rep.email AS reporter_email,
            inst.full_name AS instructor_name,
            stu.full_name AS student_name,
            c.title AS course_title,
            smu.full_name AS subject_moderator_name,
            escu.full_name AS escalated_to_name
     ${REPORT_JOINS} WHERE r.id = $1`,
    [id]
  );
  if (!rows[0]) throw notFound('Moderation report not found.');
  return reportView(rows[0]);
}

/** Central access rule for a single report. */
export async function canAccessReport(user, report) {
  if (!user || !report) return false;
  if (user.role === 'admin') return true;

  const { rows } = await query('SELECT id, tier FROM moderators WHERE user_id = $1', [user.id]);
  const moderator = rows[0];
  if (!moderator) return false;

  if (moderator.tier === 'senior_moderator') {
    if (report.escalated_to === moderator.id) return true;
    const { rows: supervised } = await query(
      `SELECT 1 FROM moderator_assignments
       WHERE moderator_id = $1 AND kind = 'subject_moderator' AND moderator_target_id = $2`,
      [moderator.id, report.subject_moderator_id]
    );
    return Boolean(supervised[0]);
  }

  return report.subject_moderator_id === moderator.id;
}

/** Creates a report. Students and instructors may raise complaints. */
export async function createModerationReport({ user, title, body, kind = 'complaint', severity = 'normal', courseId = null, instructorId = null, studentId = null }) {
  if (!REPORT_KINDS.includes(kind)) throw badRequest('Choose a valid report type.');
  if (!REPORT_SEVERITIES.includes(severity)) throw badRequest('Choose a valid severity.');

  // Resolve which subject moderator owns the target so it lands on the right desk.
  const { rows: targets } = await query(
    `SELECT m.id
     FROM moderators m
     JOIN moderator_assignments ma ON ma.moderator_id = m.id
     WHERE m.tier = 'subject_moderator' AND m.status = 'active'
       AND (
         ($1::bigint IS NOT NULL AND ma.course_id = $1)
         OR ($2::bigint IS NOT NULL AND ma.instructor_id = $2)
       )
     LIMIT 1`,
    [courseId, instructorId]
  );
  const ownerId = targets[0]?.id ?? null;

  const report = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO moderation_reports
         (reporter_id, subject_moderator_id, course_id, instructor_id, student_id,
          title, body, kind, severity, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open')
       RETURNING *`,
      [user.id, ownerId, courseId, instructorId, studentId, title, body, kind, severity]
    );
    await recordActivity(client, {
      userId: user.id,
      action: 'moderation.report_created',
      entityType: 'moderation_report',
      entityId: rows[0].id,
      metadata: { kind, severity, courseId },
    });

    if (ownerId) {
      const { rows: ownerUser } = await client.query('SELECT user_id FROM moderators WHERE id = $1', [ownerId]);
      if (ownerUser[0]) {
        await notify(client, {
          userIds: [ownerUser[0].user_id],
          type: 'moderation',
          title: `New ${kind.replace('_', ' ')}: ${title}`,
          body: body.slice(0, 300),
          link: '/moderator/reports',
        });
      }
    } else {
      const { rows: admins } = await client.query(`SELECT id FROM users WHERE role = 'admin' AND is_active`);
      if (admins.length) {
        await notify(client, {
          userIds: admins.map((a) => a.id),
          type: 'moderation',
          title: `Unassigned ${kind.replace('_', ' ')}: ${title}`,
          body: 'No subject moderator is assigned to this course yet. Assign one from Moderator Management.',
          link: '/admin/moderators',
        });
      }
    }
    return rows[0];
  });

  return getModerationReport(report.id);
}

/** Subject moderator / senior moderator: move a report through its lifecycle. */
export async function updateModerationReport({ id, user, status, resolution = '', note = '' }) {
  const report = await getModerationReport(id);
  if (!(await canAccessReport(user, report))) {
    throw forbidden('This report is not part of your moderation scope.');
  }
  if (status && !REPORT_STATUSES.includes(status)) throw badRequest('Unknown report status.');
  if (status === 'resolved' && !resolution.trim() && !report.resolution) {
    throw badRequest('Add a resolution before closing this report.');
  }

  const updated = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE moderation_reports SET
         status = COALESCE($1, status),
         resolution = CASE WHEN $2 = '' THEN resolution ELSE $2 END,
         resolved_by = CASE WHEN $1 = 'resolved' THEN $3 ELSE resolved_by END,
         resolved_at = CASE WHEN $1 = 'resolved' THEN now() ELSE resolved_at END
       WHERE id = $4 RETURNING *`,
      [status ?? null, resolution.trim(), user.id, report.id]
    );
    await recordActivity(client, {
      userId: user.id,
      action: 'moderation.report_updated',
      entityType: 'moderation_report',
      entityId: report.id,
      metadata: { status: status ?? report.status, note },
    });
    if (report.reporter_id && status) {
      await notify(client, {
        userIds: [report.reporter_id],
        type: 'moderation',
        title: `Your ${report.kind.replace('_', ' ')} was updated`,
        body: `Status: ${status.replace('_', ' ')}.${resolution ? ` ${resolution.slice(0, 200)}` : ''}`,
        link: '/student/support',
      });
    }
    return rows[0];
  });

  return getModerationReport(updated.id);
}

/** Subject moderator escalates to the senior moderator who supervises them. */
export async function escalateModerationReport({ id, user, reason = '', severity }) {
  const report = await getModerationReport(id);
  if (!(await canAccessReport(user, report))) {
    throw forbidden('This report is not part of your moderation scope.');
  }

  const { rows: me } = await query('SELECT id, tier FROM moderators WHERE user_id = $1', [user.id]);
  const moderator = me[0];
  if (!moderator) throw forbidden('Only moderators can escalate reports.');
  if (moderator.tier === 'senior_moderator') throw badRequest('This report is already with a senior moderator.');

  const { rows: seniors } = await query(
    `SELECT ma.moderator_id, m.user_id
     FROM moderator_assignments ma
     JOIN moderators m ON m.id = ma.moderator_id
     WHERE ma.kind = 'subject_moderator' AND ma.moderator_target_id = $1 AND m.status = 'active'
     LIMIT 1`,
    [moderator.id]
  );
  const senior = seniors[0] || null;

  const updated = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `UPDATE moderation_reports SET
         status = 'escalated',
         escalated_to = $1,
         escalated_at = now(),
         severity = COALESCE($2, severity),
         resolution = CASE WHEN $3 = '' THEN resolution ELSE $3 END
       WHERE id = $4 RETURNING *`,
      [senior?.moderator_id ?? null, severity ?? null, reason.trim(), report.id]
    );
    await recordActivity(client, {
      userId: user.id,
      action: 'moderation.report_escalated',
      entityType: 'moderation_report',
      entityId: report.id,
      metadata: { toSeniorId: senior?.moderator_id ?? null, reason },
    });
    if (senior) {
      await notify(client, {
        userIds: [senior.user_id],
        type: 'moderation',
        title: `Escalated: ${report.title}`,
        body: reason.trim().slice(0, 300) || 'A subject moderator escalated this report to you.',
        link: '/moderator/senior',
      });
    } else {
      const { rows: admins } = await client.query(`SELECT id FROM users WHERE role = 'admin' AND is_active`);
      if (admins.length) {
        await notify(client, {
          userIds: admins.map((a) => a.id),
          type: 'moderation',
          title: `Escalated (no senior assigned): ${report.title}`,
          body: reason.trim().slice(0, 300) || 'Assign a senior moderator to route this escalation.',
          link: '/admin/moderators',
        });
      }
    }
    return rows[0];
  });

  return getModerationReport(updated.id);
}

/** Counts for dashboards and badges, scoped to the caller. */
export async function moderationStats(user) {
  if (user.role === 'admin') {
    const { rows } = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM moderators WHERE status = 'active') AS moderators,
         (SELECT COUNT(*)::int FROM moderators WHERE tier = 'senior_moderator' AND status = 'active') AS senior_moderators,
         (SELECT COUNT(*)::int FROM moderators WHERE tier = 'subject_moderator' AND status = 'active') AS subject_moderators,
         (SELECT COUNT(*)::int FROM moderation_reports WHERE status IN ('open', 'in_review')) AS open_reports,
         (SELECT COUNT(*)::int FROM moderation_reports WHERE status = 'escalated') AS escalated_reports,
         (SELECT COUNT(*)::int FROM moderation_reports WHERE status = 'resolved') AS resolved_reports`
    );
    return rows[0];
  }

  const { rows: me } = await query('SELECT id, tier FROM moderators WHERE user_id = $1', [user.id]);
  const moderator = me[0];
  if (!moderator) {
    return { moderators: 0, open_reports: 0, escalated_reports: 0, resolved_reports: 0 };
  }

  if (moderator.tier === 'senior_moderator') {
    const { rows } = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM moderator_assignments
           WHERE moderator_id = $1 AND kind = 'subject_moderator') AS supervised_moderators,
         (SELECT COUNT(*)::int FROM moderation_reports
           WHERE escalated_to = $1 AND status = 'escalated') AS escalated_reports,
         (SELECT COUNT(*)::int FROM moderation_reports r
           WHERE r.subject_moderator_id IN (
             SELECT ma.moderator_target_id FROM moderator_assignments ma
             WHERE ma.moderator_id = $1 AND ma.kind = 'subject_moderator'
           ) AND r.status IN ('open', 'in_review')) AS open_reports,
         (SELECT COUNT(*)::int FROM moderation_reports r
           WHERE r.subject_moderator_id IN (
             SELECT ma.moderator_target_id FROM moderator_assignments ma
             WHERE ma.moderator_id = $1 AND ma.kind = 'subject_moderator'
           ) AND r.status = 'resolved') AS resolved_reports`,
      [moderator.id]
    );
    return rows[0];
  }

  const { rows } = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM moderator_assignments
         WHERE moderator_id = $1 AND kind = 'course') AS courses,
       (SELECT COUNT(*)::int FROM moderator_assignments
         WHERE moderator_id = $1 AND kind = 'instructor') AS instructors,
       (SELECT COUNT(*)::int FROM moderation_reports
         WHERE subject_moderator_id = $1 AND status IN ('open', 'in_review')) AS open_reports,
       (SELECT COUNT(*)::int FROM moderation_reports
         WHERE subject_moderator_id = $1 AND status = 'escalated') AS escalated_reports,
       (SELECT COUNT(*)::int FROM moderation_reports
         WHERE subject_moderator_id = $1 AND status = 'resolved') AS resolved_reports`,
    [moderator.id]
  );
  return rows[0];
}
