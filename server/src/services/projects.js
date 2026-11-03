import fs from 'node:fs';
import path from 'node:path';
import { query, withTransaction } from '../config/db.js';
import { badRequest, notFound } from '../utils/errors.js';
import { notify, recordActivity } from '../utils/activity.js';
import { isAdmin } from './access.js';

/**
 * Student projects.
 *
 * A project is a capstone / portfolio upload. Students create it, the
 * instructor of the linked course reviews it, and administrators keep a
 * read-only record. Projects are independent from lab sessions so a student
 * can submit work that is not tied to a single terminal session.
 */

export const PROJECT_STATUSES = ['draft', 'submitted', 'changes_requested', 'approved'];

const PROJECT_COLUMNS = `
  p.id, p.user_id, p.course_id, p.instructor_id, p.title, p.description,
  p.repo_url, p.attachment_path, p.attachment_name, p.attachment_mime,
  p.attachment_size, p.student_note, p.status, p.instructor_feedback,
  p.reviewed_by, p.reviewed_at, p.admin_acknowledged_by, p.admin_acknowledged_at,
  p.submitted_at, p.updated_at`;

const PROJECT_JOINS = `
  FROM student_projects p
  JOIN users u ON u.id = p.user_id
  LEFT JOIN users i ON i.id = p.instructor_id
  LEFT JOIN courses c ON c.id = p.course_id`;

const PRIVATE_ATTACHMENT_DIR = path.resolve(process.cwd(), 'private-uploads', 'projects');

function projectView(row) {
  if (!row) return null;
  const { attachment_path: attachmentPath, ...rest } = row;
  return {
    ...rest,
    has_attachment: Boolean(attachmentPath),
    admin_acknowledged: Boolean(row.admin_acknowledged_at),
  };
}

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

async function resolveCourse(courseId, user) {
  if (!courseId) return null;
  const { rows } = await query(
    'SELECT id, title, instructor_id FROM courses WHERE id = $1',
    [courseId]
  );
  const course = rows[0];
  if (!course) throw badRequest('The selected course does not exist.');
  if (user.role === 'student') {
    const { rows: enrolled } = await query(
      `SELECT 1 FROM enrollments
       WHERE user_id = $1 AND course_id = $2 AND status <> 'dropped'`,
      [user.id, courseId]
    );
    if (!enrolled[0]) throw badRequest('You can only link a project to a course you are enrolled in.');
  }
  return course;
}

async function notifyReviewer({ project, student, course }) {
  const title = `New project: ${project.title}`;
  const body = `${student.full_name || 'A student'} uploaded a project${course ? ` for ${course.title}` : ''}.`;

  await withTransaction(async (client) => {
    if (project.instructor_id) {
      await notify(client, {
        userIds: [project.instructor_id],
        type: 'project',
        title,
        body,
        link: '/instructor/projects',
      });
    } else {
      const { rows: admins } = await client.query(
        `SELECT id FROM users WHERE role = 'admin' AND is_active`
      );
      if (admins.length) {
        await notify(client, {
          userIds: admins.map((admin) => admin.id),
          type: 'project',
          title,
          body: `${body} It is not linked to a course, so review it from the admin record.`,
          link: '/admin/labs',
        });
      }
    }
  });
}

/** Role-aware project queue. */
export async function listProjects({ user, status, courseId, search, page = 1, limit = 20 }) {
  const params = [];
  const where = [];

  if (isAdmin(user)) {
    // no restriction
  } else if (user.role === 'instructor') {
    params.push(user.id);
    where.push(`p.instructor_id = $${params.length}`);
  } else {
    params.push(user.id);
    where.push(`p.user_id = $${params.length}`);
  }

  if (status && status !== 'all') {
    params.push(status);
    where.push(`p.status = $${params.length}`);
  }
  if (courseId) {
    params.push(courseId);
    where.push(`p.course_id = $${params.length}`);
  }
  if (search) {
    params.push(`%${search}%`);
    where.push(`(p.title ILIKE $${params.length} OR u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const offset = (page - 1) * limit;

  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total ${PROJECT_JOINS} ${whereSql}`,
    params
  );

  const { rows } = await query(
    `SELECT ${PROJECT_COLUMNS},
            u.full_name AS student_name, u.email AS student_email,
            i.full_name AS instructor_name,
            c.title AS course_title
     ${PROJECT_JOINS} ${whereSql}
     ORDER BY CASE p.status
                WHEN 'submitted' THEN 0
                WHEN 'changes_requested' THEN 1
                ELSE 2
              END,
              p.submitted_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );

  return {
    projects: rows.map(projectView),
    total: countRows[0].total,
    page,
    limit,
  };
}

export async function getProject(id) {
  const { rows } = await query(
    `SELECT ${PROJECT_COLUMNS},
            u.full_name AS student_name, u.email AS student_email,
            i.full_name AS instructor_name,
            c.title AS course_title
     ${PROJECT_JOINS} WHERE p.id = $1`,
    [id]
  );
  if (!rows[0]) throw notFound('Project not found.');
  return projectView(rows[0]);
}

export async function getProjectAttachment(id) {
  const { rows } = await query(
    'SELECT attachment_path, attachment_name, attachment_mime FROM student_projects WHERE id = $1',
    [id]
  );
  return rows[0] || null;
}

export async function createProject({ user, title, description = '', repoUrl = '', studentNote = '', courseId = null, file = null }) {
  const course = await resolveCourse(courseId, user);
  const instructorId = course?.instructor_id ?? null;

  const { rows } = await query(
    `INSERT INTO student_projects
       (user_id, course_id, instructor_id, title, description, repo_url, student_note,
        attachment_path, attachment_name, attachment_mime, attachment_size, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'submitted')
     RETURNING *`,
    [
      user.id,
      course?.id ?? null,
      instructorId,
      title,
      description,
      repoUrl || null,
      studentNote,
      file?.path || null,
      file?.name || null,
      file?.mime || null,
      file?.size || 0,
    ]
  );
  const project = rows[0];

  await withTransaction(async (client) => {
    await recordActivity(client, {
      userId: user.id,
      action: 'project.submitted',
      entityType: 'project',
      entityId: project.id,
      metadata: { title: project.title, courseId: course?.id ?? null, instructorId },
    });
  });
  await notifyReviewer({ project, student: user, course });

  return projectView({ ...project, student_name: user.full_name, student_email: user.email, course_title: course?.title || null });
}

/** Students can revise a project until it is approved. */
export async function updateProject({ project, user, title, description, repoUrl, studentNote, courseId, file = null }) {
  if (project.user_id !== user.id) throw badRequest('This project belongs to another student.');
  if (project.status === 'approved') throw badRequest('Approved projects cannot be edited.');

  const course = courseId === undefined ? null : await resolveCourse(courseId, user);
  const nextCourseId = courseId === undefined ? project.course_id : course?.id ?? null;
  const nextInstructorId = courseId === undefined ? project.instructor_id : course?.instructor_id ?? null;

  const { rows: previousRows } = await query(
    'SELECT attachment_path FROM student_projects WHERE id = $1',
    [project.id]
  );
  const previousAttachment = previousRows[0]?.attachment_path || null;

  const { rows } = await query(
    `UPDATE student_projects SET
       title = $1,
       description = $2,
       repo_url = $3,
       student_note = $4,
       course_id = $5,
       instructor_id = $6,
       attachment_path = COALESCE($7, attachment_path),
       attachment_name = COALESCE($8, attachment_name),
       attachment_mime = COALESCE($9, attachment_mime),
       attachment_size = CASE WHEN $7::varchar IS NULL THEN attachment_size ELSE $10::int END,
       status = 'submitted',
       instructor_feedback = '',
       reviewed_by = NULL,
       reviewed_at = NULL,
       submitted_at = now(),
       updated_at = now()
     WHERE id = $11
     RETURNING *`,
    [
      title,
      description,
      repoUrl || null,
      studentNote,
      nextCourseId,
      nextInstructorId,
      file?.path || null,
      file?.name || null,
      file?.mime || null,
      file?.size || 0,
      project.id,
    ]
  );
  const updated = rows[0];

  if (file && previousAttachment && previousAttachment !== file.path) {
    removeStoredAttachment(previousAttachment);
  }

  await withTransaction(async (client) => {
    await recordActivity(client, {
      userId: user.id,
      action: 'project.resubmitted',
      entityType: 'project',
      entityId: project.id,
      metadata: { title: updated.title, courseId: nextCourseId },
    });
  });
  await notifyReviewer({
    project: updated,
    student: user,
    course: course || (nextCourseId ? { id: nextCourseId, title: project.course_title } : null),
  });

  return projectView(updated);
}

export async function reviewProject({ project, reviewer, status, feedback = '' }) {
  if (!['approved', 'changes_requested'].includes(status)) {
    throw badRequest('Review status must be approved or changes_requested.');
  }
  if (status === 'changes_requested' && !feedback.trim()) {
    throw badRequest('Add feedback explaining what the student must improve.');
  }

  const { rows } = await query(
    `UPDATE student_projects SET
       status = $1, instructor_feedback = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now()
     WHERE id = $4
     RETURNING *`,
    [status, feedback.trim(), reviewer.id, project.id]
  );
  const updated = rows[0];

  await withTransaction(async (client) => {
    await recordActivity(client, {
      userId: reviewer.id,
      action: 'project.reviewed',
      entityType: 'project',
      entityId: project.id,
      metadata: { status, studentId: project.user_id },
    });
    await notify(client, {
      userIds: [project.user_id],
      type: 'project',
      title: status === 'approved'
        ? `Project approved: ${project.title}`
        : `Changes requested: ${project.title}`,
      body: status === 'approved'
        ? 'Your instructor approved your project.'
        : feedback.trim().slice(0, 300),
      link: '/student/projects',
    });
  });

  return projectView(updated);
}

export async function acknowledgeProject(id, adminId) {
  const { rows } = await query(
    `UPDATE student_projects
     SET admin_acknowledged_by = $1, admin_acknowledged_at = now(), updated_at = now()
     WHERE id = $2 RETURNING *`,
    [adminId, id]
  );
  if (!rows[0]) throw notFound('Project not found.');
  await withTransaction((client) =>
    recordActivity(client, {
      userId: adminId,
      action: 'project.acknowledged',
      entityType: 'project',
      entityId: rows[0].id,
      metadata: { studentId: rows[0].user_id },
    })
  );
  return projectView(rows[0]);
}

export async function deleteProject({ project, user }) {
  if (project.user_id !== user.id && !isAdmin(user)) {
    throw badRequest('You can only delete your own project.');
  }
  const { rows } = await query('SELECT attachment_path FROM student_projects WHERE id = $1', [project.id]);
  await query('DELETE FROM student_projects WHERE id = $1', [project.id]);
  removeStoredAttachment(rows[0]?.attachment_path);
  return { ok: true };
}

/** Counts for the instructor review badge and the student overview. */
export async function projectStats(user) {
  const params = [];
  let scope = '';
  if (isAdmin(user)) {
    // everything
  } else if (user.role === 'instructor') {
    params.push(user.id);
    scope = 'WHERE instructor_id = $1';
  } else {
    params.push(user.id);
    scope = 'WHERE user_id = $1';
  }

  const { rows } = await query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status = 'submitted')::int AS pending,
       COUNT(*) FILTER (WHERE status = 'changes_requested')::int AS changes_requested,
       COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
       COUNT(*) FILTER (WHERE admin_acknowledged_at IS NOT NULL)::int AS acknowledged
     FROM student_projects ${scope}`,
    params
  );
  return rows[0];
}
