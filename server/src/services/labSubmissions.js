import { query, withTransaction } from '../config/db.js';
import fs from 'node:fs';
import path from 'node:path';
import { badRequest, notFound } from '../utils/errors.js';
import { notify, recordActivity } from '../utils/activity.js';
import { isAdmin } from './access.js';

/**
 * Lab submissions: the "completed lab -> instructor review -> admin record"
 * trail. A submission is created from a finished lab session, so the evidence
 * (verified steps, commands, screenshots, server) cannot be edited afterwards.
 */

export const SUBMISSION_STATUSES = ['submitted', 'changes_requested', 'approved'];

const SUBMISSION_COLUMNS = `
  s.id, s.lab_id, s.session_id, s.user_id, s.course_id, s.instructor_id,
  s.status, s.student_note, s.attachment_path, s.attachment_name,
  s.attachment_mime, s.attachment_size, s.evidence, s.instructor_feedback,
  s.reviewed_by, s.reviewed_at, s.admin_acknowledged_by, s.admin_acknowledged_at,
  s.submitted_at, s.updated_at`;

const SUBMISSION_JOINS = `
  FROM lab_submissions s
  JOIN labs l ON l.id = s.lab_id
  JOIN users u ON u.id = s.user_id
  LEFT JOIN users i ON i.id = s.instructor_id
  LEFT JOIN courses c ON c.id = s.course_id`;

function submissionView(row) {
  if (!row) return null;
  const {
    attachment_path: attachmentPath,
    ...rest
  } = row;
  return {
    ...rest,
    has_attachment: Boolean(attachmentPath),
    admin_acknowledged: Boolean(row.admin_acknowledged_at),
  };
}

/**
 * Who reviews this lab? The course instructor; for standalone labs the
 * instructor who created the lab (when it was created by an instructor).
 */
async function resolveInstructorId(lab) {
  if (lab.course_id) {
    const { rows } = await query('SELECT instructor_id FROM courses WHERE id = $1', [lab.course_id]);
    return rows[0]?.instructor_id ?? null;
  }
  if (!lab.created_by) return null;
  const { rows } = await query('SELECT id, role FROM users WHERE id = $1', [lab.created_by]);
  return rows[0]?.role === 'instructor' ? rows[0].id : null;
}

async function buildEvidence(session) {
  const { rows: stepRows } = await query(
    `SELECT st.id, st.title, st.position, st.points, st.is_optional,
            p.command_used, p.output_excerpt, p.completed_at
     FROM lab_steps st
     LEFT JOIN lab_step_progress p ON p.step_id = st.id AND p.session_id = $2
     WHERE st.lab_id = $1
     ORDER BY st.position, st.id`,
    [session.lab_id, session.id]
  );
  const steps = stepRows.map((step) => ({
    title: step.title,
    completed: Boolean(step.completed_at),
    command_used: step.command_used || null,
    output_excerpt: (step.output_excerpt || '').slice(0, 500) || null,
    points: step.points,
    is_optional: step.is_optional,
  }));
  const required = steps.filter((step) => !step.is_optional);
  const completedRequired = required.filter((step) => step.completed).length;

  const { rows: shotRows } = await query(
    `SELECT id, step_id, original_name, file_path, created_at FROM screenshots WHERE session_id = $1 ORDER BY created_at`,
    [session.id]
  );
  const server = session.lab_server_id
    ? (await query('SELECT id, name, location FROM lab_servers WHERE id = $1', [session.lab_server_id])).rows[0] || null
    : null;

  const mode = session.lab_mode === 'real' ? 'real' : 'practice';
  const minEvidence = Math.max(0, Number(session.min_evidence ?? 1));
  const evidenceCount = shotRows.length;

  return {
    lab_title: session.lab_title || null,
    lab_mode: mode,
    task_brief: session.task_brief || null,
    min_evidence: minEvidence,
    lab_server: server ? { id: server.id, name: server.name, location: server.location } : null,
    session: {
      id: session.id,
      instance_id: session.instance_id,
      provider: session.provider,
      started_at: session.started_at,
      ended_at: session.ended_at,
    },
    progress: {
      completed_required: completedRequired,
      required_total: required.length,
      all_required_completed: mode === 'real'
        ? evidenceCount >= minEvidence
        : completedRequired === required.length,
      evidence_count: evidenceCount,
      min_evidence: minEvidence,
    },
    steps,
    screenshots: shotRows.map((shot) => ({
      id: shot.id,
      step_id: shot.step_id,
      name: shot.original_name,
      url: shot.file_path,
    })),
    captured_at: new Date().toISOString(),
  };
}

const PRIVATE_ATTACHMENT_DIR = path.resolve(process.cwd(), 'private-uploads', 'lab-submissions');

/** Best-effort removal of a replaced attachment file. */
function removeStoredAttachment(storedPath) {
  if (!storedPath) return;
  const target = path.join(PRIVATE_ATTACHMENT_DIR, path.basename(storedPath));
  if (!target.startsWith(PRIVATE_ATTACHMENT_DIR)) return;
  try {
    fs.rmSync(target, { force: true });
  } catch {
    // A missing file must never block a resubmission.
  }
}

export async function getSubmissionForSession(sessionId) {
  const { rows } = await query(
    `SELECT ${SUBMISSION_COLUMNS} ${SUBMISSION_JOINS} WHERE s.session_id = $1`,
    [sessionId]
  );
  return rows[0] || null;
}

/**
 * Creates a submission for a finished session, or re-opens the student's
 * "changes requested" submission for the same lab. A re-opened submission
 * moves to the session being submitted, so a student who redoes the work in
 * a fresh session resubmits cleanly instead of leaving a duplicate behind.
 * The guided-lab completion check is enforced server-side, never trusted
 * from the client.
 */
export async function submitLabSession({ session, lab, user, note = '', file = null }) {
  if (session.status === 'error') throw badRequest('This lab session failed and cannot be submitted.');
  if (lab.status !== 'published') throw badRequest('Only published labs can be submitted.');
  if (lab.is_practice) {
    throw badRequest('Practice labs are open-ended: there is nothing to submit for review.');
  }

  if (lab.lab_mode === 'real') {
    // Real labs are graded on evidence, not on guided steps. Students submit
    // however much they completed: any number of screenshots may be sent, and
    // the evidence snapshot records evidence_count against min_evidence so the
    // instructor can see whether the submission is partial or complete.
  } else {
    const { rows: remainingRows } = await query(
      `SELECT COUNT(*)::int AS remaining FROM lab_steps s
       WHERE s.lab_id = $1 AND s.is_optional = FALSE
         AND s.id NOT IN (SELECT step_id FROM lab_step_progress WHERE session_id = $2)`,
      [lab.id, session.id]
    );
    if (remainingRows[0].remaining > 0) {
      throw badRequest(`Finish all required steps first (${remainingRows[0].remaining} remaining).`);
    }
  }

  let existing = await getSubmissionForSession(session.id);
  if (existing && existing.status !== 'changes_requested') {
    throw badRequest('This lab session has already been submitted to your instructor.');
  }
  if (existing && existing.user_id !== user.id) {
    throw badRequest('This lab session belongs to another student.');
  }

  if (!existing) {
    // The student may have redone the work in a fresh session after the
    // instructor requested changes on an earlier one. Take that submission
    // over (it moves to this session in the update below) instead of
    // creating a second submission for the same lab.
    const { rows: redoRows } = await query(
      `SELECT * FROM lab_submissions
        WHERE lab_id = $1 AND user_id = $2 AND status = 'changes_requested'
        ORDER BY submitted_at DESC
        LIMIT 1`,
      [lab.id, user.id]
    );
    existing = redoRows[0] || null;
  }

  const evidence = await buildEvidence({
    ...session,
    lab_title: lab.title,
    lab_mode: lab.lab_mode,
    task_brief: lab.task_brief,
    min_evidence: lab.min_evidence,
  });
  const instructorId = await resolveInstructorId(lab);

  let submission;
  if (existing) {
    const { rows } = await query(
      `UPDATE lab_submissions SET
         student_note = $1,
         attachment_path = COALESCE($2, attachment_path),
         attachment_name = COALESCE($3, attachment_name),
         attachment_mime = COALESCE($4, attachment_mime),
         attachment_size = CASE WHEN $2::varchar IS NULL THEN attachment_size ELSE $5::int END,
         evidence = $6,
         session_id = $8,
         status = 'submitted',
         instructor_feedback = '',
         reviewed_by = NULL,
         reviewed_at = NULL,
         submitted_at = now(),
         updated_at = now()
       WHERE id = $7
       RETURNING *`,
      [note, file?.path || null, file?.name || null, file?.mime || null, file?.size || 0, JSON.stringify(evidence), existing.id, session.id]
    );
    submission = rows[0];
    if (file && existing.attachment_path && existing.attachment_path !== file.path) {
      removeStoredAttachment(existing.attachment_path);
    }
  } else {
    let rows;
    try {
      ({ rows } = await query(
        `INSERT INTO lab_submissions
           (lab_id, session_id, user_id, course_id, instructor_id, status, student_note,
            attachment_path, attachment_name, attachment_mime, attachment_size, evidence)
         VALUES ($1, $2, $3, $4, $5, 'submitted', $6, $7, $8, $9, $10, $11)
         RETURNING *`,
        [
          lab.id, session.id, user.id, lab.course_id || null, instructorId, note,
          file?.path || null, file?.name || null, file?.mime || null, file?.size || 0, JSON.stringify(evidence),
        ]
      ));
    } catch (error) {
      // A concurrent double-submit loses the unique(session_id) race.
      if (error.code === '23505') {
        if (file) removeStoredAttachment(file.path);
        throw badRequest('This lab session has already been submitted to your instructor.');
      }
      throw error;
    }
    submission = rows[0];
  }

  await withTransaction(async (client) => {
    await recordActivity(client, {
      userId: user.id,
      action: existing ? 'lab.resubmitted' : 'lab.submitted',
      entityType: 'lab',
      entityId: lab.id,
      metadata: { submissionId: submission.id, sessionId: session.id, instructorId },
    });

    if (instructorId) {
      await notify(client, {
        userIds: [instructorId],
        type: 'lab',
        title: `Lab submission: ${lab.title}`,
        body: `${user.full_name || 'A student'} submitted a completed lab for review.`,
        link: '/instructor/lab-submissions',
      });
    } else {
      const { rows: admins } = await client.query(`SELECT id FROM users WHERE role = 'admin' AND is_active`);
      if (admins.length) {
        await notify(client, {
          userIds: admins.map((admin) => admin.id),
          type: 'lab',
          title: `Unassigned lab submission: ${lab.title}`,
          body: 'This lab has no course instructor. Review it from Lab Infrastructure → submissions.',
          link: '/admin/labs',
        });
      }
    }
  });

  return submissionView(submission);
}

/** Role-aware submission queue. Students see theirs, instructors their courses. */
export async function listLabSubmissions({ user, status, labId, courseId, search, page = 1, limit = 20 }) {
  const params = [];
  const where = [];

  if (isAdmin(user)) {
    // no restriction
  } else if (user.role === 'instructor') {
    params.push(user.id);
    where.push(`s.instructor_id = $${params.length}`);
  } else {
    params.push(user.id);
    where.push(`s.user_id = $${params.length}`);
  }

  if (status && status !== 'all') {
    params.push(status);
    where.push(`s.status = $${params.length}`);
  }
  if (labId) {
    params.push(labId);
    where.push(`s.lab_id = $${params.length}`);
  }
  if (courseId) {
    params.push(courseId);
    where.push(`s.course_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(l.title ILIKE $${params.length} OR u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total ${SUBMISSION_JOINS} ${whereSql}`,
    params
  );

  const { rows } = await query(
    `SELECT ${SUBMISSION_COLUMNS},
            l.title AS lab_title, l.course_id AS lab_course_id,
            u.full_name AS student_name, u.email AS student_email,
            i.full_name AS instructor_name,
            c.title AS course_title
     ${SUBMISSION_JOINS} ${whereSql}
     ORDER BY CASE s.status WHEN 'submitted' THEN 0 WHEN 'changes_requested' THEN 1 ELSE 2 END,
              s.submitted_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return {
    submissions: rows.map(submissionView),
    total: countRows[0].total,
    page,
    limit,
  };
}

export async function getLabSubmission(id) {
  const { rows } = await query(
    `SELECT ${SUBMISSION_COLUMNS},
            l.title AS lab_title, l.course_id AS lab_course_id,
            u.full_name AS student_name, u.email AS student_email,
            i.full_name AS instructor_name,
            c.title AS course_title
     ${SUBMISSION_JOINS} WHERE s.id = $1`,
    [id]
  );
  if (!rows[0]) throw notFound('Lab submission not found.');
  return submissionView(rows[0]);
}

/** Attachment file reference (kept out of the regular submission payload). */
export async function getSubmissionAttachment(id) {
  const { rows } = await query(
    'SELECT attachment_path, attachment_name, attachment_mime FROM lab_submissions WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

export async function reviewLabSubmission({ submission, reviewer, status, feedback = '' }) {
  if (!['approved', 'changes_requested'].includes(status)) {
    throw badRequest('Review status must be approved or changes_requested.');
  }
  if (status === 'changes_requested' && !feedback.trim()) {
    throw badRequest('Add feedback explaining what the student must improve.');
  }

  const { rows } = await query(
    `UPDATE lab_submissions SET
       status = $1, instructor_feedback = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now()
     WHERE id = $4
     RETURNING *`,
    [status, feedback.trim(), reviewer.id, submission.id]
  );
  const updated = rows[0];

  await withTransaction(async (client) => {
    await recordActivity(client, {
      userId: reviewer.id,
      action: 'lab.submission_reviewed',
      entityType: 'lab',
      entityId: submission.lab_id,
      metadata: { submissionId: submission.id, status, studentId: submission.user_id },
    });
    await notify(client, {
      userIds: [submission.user_id],
      type: 'lab',
      title: status === 'approved'
        ? `Lab approved: ${submission.lab_title}`
        : `Changes requested: ${submission.lab_title}`,
      body: status === 'approved'
        ? 'Your instructor approved your lab submission.'
        : feedback.trim().slice(0, 300),
      link: `/labs/session/${submission.session_id}`,
    });
  });

  return submissionView(updated);
}

export async function acknowledgeLabSubmission(id, adminId) {
  const { rows } = await query(
    `UPDATE lab_submissions SET admin_acknowledged_by = $1, admin_acknowledged_at = now(), updated_at = now()
     WHERE id = $2 RETURNING *`,
    [adminId, id]
  );
  if (!rows[0]) throw notFound('Lab submission not found.');
  await withTransaction((client) =>
    recordActivity(client, {
      userId: adminId,
      action: 'lab.submission_acknowledged',
      entityType: 'lab',
      entityId: rows[0].lab_id,
      metadata: { submissionId: rows[0].id, studentId: rows[0].user_id },
    })
  );
  return submissionView(rows[0]);
}

/** Counts for the instructor queue badge and the admin record header. */
export async function submissionStats(user) {
  const params = [];
  let scope = '';
  if (isAdmin(user)) {
    // everything
  } else if (user.role === 'instructor') {
    params.push(user.id);
    scope = `WHERE instructor_id = $1`;
  } else {
    params.push(user.id);
    scope = `WHERE user_id = $1`;
  }

  const { rows } = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'submitted')::int AS pending,
       COUNT(*) FILTER (WHERE status = 'changes_requested')::int AS changes_requested,
       COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
       COUNT(*) FILTER (WHERE admin_acknowledged_at IS NOT NULL)::int AS acknowledged
     FROM lab_submissions ${scope}`,
    params
  );
  return rows[0];
}
