import { query } from '../config/db.js';
import { forbidden, notFound } from '../utils/errors.js';

/**
 * Central ownership rules for teaching staff.
 *
 * The platform has three roles: students, instructors and admins. An instructor
 * may only touch the courses assigned to them (courses.instructor_id) and the
 * labs, sessions, reports and articles derived from those courses. Admins can
 * inspect everything. A generic `isStaff` check is never enough on its own.
 */

export const isAdmin = (user) => user?.role === 'admin';

export async function getCourseOwner(courseId) {
  if (!courseId) return null;
  const { rows } = await query('SELECT instructor_id FROM courses WHERE id = $1', [courseId]);
  return rows[0] ? rows[0].instructor_id : null;
}

/**
 * Owner of a lab. Labs attached to a course belong to that course's instructor;
 * standalone labs belong to whoever created them.
 */
export async function getLabOwner(lab) {
  if (!lab) return null;
  if (lab.course_id) {
    const owner = await getCourseOwner(lab.course_id);
    if (owner != null) return owner;
  }
  return lab.created_by ?? null;
}

export function canManageCourse(user, course) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  return user.role === 'instructor' && course?.instructor_id === user.id;
}

export function assertCourseManager(user, course) {
  if (canManageCourse(user, course)) return;
  throw forbidden('You can only manage courses assigned to you.');
}

export async function canManageLab(user, lab) {
  if (!user) return false;
  if (isAdmin(user)) return true;
  if (user.role !== 'instructor') return false;
  return (await getLabOwner(lab)) === user.id;
}

export async function assertLabManager(user, lab) {
  if (await canManageLab(user, lab)) return;
  throw forbidden('You can only manage labs for the courses assigned to you.');
}

/**
 * Read access to a lab. Drafts are only visible to the instructor who owns
 * them and to admins. Published practice and standalone labs are open to
 * every learner, but a published course lab is only visible to staff and
 * to students enrolled in that course.
 */
export async function canReadLab(user, lab) {
  if (lab?.status === 'published') {
    if (!lab.course_id || lab.is_practice) return true;
    if (!user) return false;
    if (user.role !== 'student') return true;
    const { rows } = await query(
      `SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2 AND status <> 'dropped'`,
      [user.id, lab.course_id]
    );
    if (rows[0]) return true;
  }
  return canManageLab(user, lab);
}

/** Throws 404 for drafts the caller does not own. */
export async function assertLabReadable(user, lab) {
  if (await canReadLab(user, lab)) return;
  // Drafts from other instructors look like they do not exist.
  throw notFound('Lab not found.');
}

/**
 * Access to a lab session. Owners see their own session; instructors see
 * sessions for labs they manage; admins see everything.
 */
export async function canAccessSession(user, session) {
  if (!user || !session) return false;
  if (session.user_id === user.id) return true;
  if (isAdmin(user)) return true;
  if (user.role !== 'instructor') return false;
  return (await getLabOwner(session)) === user.id;
}

export async function assertSessionAccess(user, session) {
  if (await canAccessSession(user, session)) return;
  throw forbidden('You do not have access to this lab session.');
}

/**
 * Access to a practical report. The author can open their own report and the
 * instructor who owns the lab's course can review it.
 */
export async function canAccessReport(user, report) {
  if (!user || !report) return false;
  if (report.user_id === user.id) return true;
  if (isAdmin(user)) return true;
  if (user.role !== 'instructor') return false;
  return report.owner_instructor_id === user.id;
}

export async function assertReportAccess(user, report) {
  if (await canAccessReport(user, report)) return;
  throw forbidden('You do not have access to this report.');
}

/**
 * Access to a lab submission. The student sees their own submission, the
 * instructor of the lab's course reviews it, admins keep the platform record.
 */
export function canAccessLabSubmission(user, submission) {
  if (!user || !submission) return false;
  if (submission.user_id === user.id) return true;
  if (isAdmin(user)) return true;
  return user.role === 'instructor' && submission.instructor_id === user.id;
}

export async function assertLabSubmissionAccess(user, submission) {
  if (canAccessLabSubmission(user, submission)) return;
  throw forbidden('You do not have access to this lab submission.');
}

/** Only the owning instructor (or an admin) may approve/request changes. */
export function canReviewLabSubmission(user, submission) {
  if (!user || !submission) return false;
  if (isAdmin(user)) return true;
  return user.role === 'instructor' && submission.instructor_id === user.id;
}

/**
 * Access to a student project. The student owns their project, the instructor
 * of the linked course reviews it, and admins keep the platform record.
 */
export function canAccessProject(user, project) {
  if (!user || !project) return false;
  if (project.user_id === user.id) return true;
  if (isAdmin(user)) return true;
  return user.role === 'instructor' && project.instructor_id === user.id;
}

export function assertProjectAccess(user, project) {
  if (canAccessProject(user, project)) return;
  throw forbidden('You do not have access to this project.');
}

/** Only the linked instructor (or an admin) may review a project. */
export function canReviewProject(user, project) {
  if (!user || !project) return false;
  if (isAdmin(user)) return true;
  return user.role === 'instructor' && project.instructor_id === user.id;
}

/**
 * Access to a blog article. Instructors may manage their own articles and
 * articles generated from reports for their courses.
 */
export async function canManagePost(user, post) {
  if (!user || !post) return false;
  if (isAdmin(user)) return true;
  if (post.author_id === user.id) return true;
  if (user.role !== 'instructor') return false;
  if (!post.source_report_id) return false;
  const { rows } = await query(
    `SELECT COALESCE(c.instructor_id, l.created_by) AS owner_instructor_id
     FROM reports r
     JOIN labs l ON l.id = r.lab_id
     LEFT JOIN courses c ON c.id = l.course_id
     WHERE r.id = $1`,
    [post.source_report_id]
  );
  return rows[0]?.owner_instructor_id === user.id;
}

export async function assertPostManager(user, post) {
  if (await canManagePost(user, post)) return;
  throw forbidden('This article is not part of your workspace.');
}

/** True when a student is enrolled in at least one of the instructor's courses. */
export async function studentBelongsToInstructor(studentId, instructorId) {
  const { rows } = await query(
    `SELECT 1 FROM enrollments e
     JOIN courses c ON c.id = e.course_id
     WHERE e.user_id = $1 AND c.instructor_id = $2 AND e.status <> 'dropped'
     LIMIT 1`,
    [studentId, instructorId]
  );
  return Boolean(rows[0]);
}

/** SQL fragment + params that restricts a query alias to a user's courses. */
export function instructorCourseFilter(alias, user, params) {
  if (isAdmin(user)) return 'TRUE';
  params.push(user.id);
  return `${alias}.instructor_id = $${params.length}`;
}
