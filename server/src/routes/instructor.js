import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../utils/errors.js';
import { validateBody } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { notify, recordActivity } from '../utils/activity.js';
import { emitNotifications } from '../websocket/index.js';

const router = Router();

// Every route below is for teaching staff. Admins may inspect/manage all courses,
// instructors are scoped to the courses they own.
router.use(requireRole('instructor', 'admin'));

const isAdmin = (user) => user.role === 'admin';

async function assertCourseAccess(user, courseId) {
  const { rows } = await query('SELECT id, instructor_id, title FROM courses WHERE id = $1', [courseId]);
  const course = rows[0];
  if (!course) throw notFound('Course not found.');
  if (!isAdmin(user) && course.instructor_id !== user.id) {
    throw forbidden('You can only manage your own courses.');
  }
  return course;
}

/**
 * The exact capabilities of the signed-in staff member. The client renders this
 * on the permissions page so the interface never promises more than the server
 * actually allows.
 */
router.get(
  '/permissions',
  asyncHandler(async (req, res) => {
    const admin = isAdmin(req.user);

    const { rows: scopeRows } = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM courses c WHERE c.instructor_id = $1 OR $2::boolean) AS courses,
         (SELECT COUNT(DISTINCT e.user_id)::int FROM enrollments e
            JOIN courses c ON c.id = e.course_id
            WHERE (c.instructor_id = $1 OR $2::boolean) AND e.status <> 'dropped') AS learners,
         (SELECT COUNT(*)::int FROM labs l JOIN courses c ON c.id = l.course_id
            WHERE c.instructor_id = $1 OR $2::boolean) AS labs,
         (SELECT COUNT(*)::int FROM lab_submissions s
            WHERE (s.instructor_id = $1 OR $2::boolean) AND s.status = 'submitted') AS lab_reviews_pending,
         (SELECT COUNT(*)::int FROM student_projects p
            WHERE (p.instructor_id = $1 OR $2::boolean) AND p.status = 'submitted') AS project_reviews_pending`,
      [req.user.id, admin]
    );

    const permission = (key, area, label, description, allowed = true) => ({
      key,
      area,
      label,
      description,
      allowed,
    });

    const permissions = [
      permission(
        'courses.create',
        'Courses',
        'Create courses',
        'Create new courses. New courses are automatically assigned to you as the instructor.'
      ),
      permission(
        'courses.manage',
        'Courses',
        admin ? 'Manage every course' : 'Manage assigned courses',
        admin
          ? 'Edit, publish and archive any course on the platform.'
          : 'Edit, publish and archive only the courses assigned to you.'
      ),
      permission(
        'courses.delete',
        'Courses',
        'Delete courses',
        'Deleting a course is reserved for administrators.',
        admin
      ),
      permission(
        'curriculum.manage',
        'Curriculum',
        'Manage modules and lessons',
        admin
          ? 'Add, edit and remove modules and lessons in any course.'
          : 'Add, edit and remove modules and lessons inside your own courses.'
      ),
      permission(
        'labs.manage',
        'Labs',
        'Create and manage labs',
        admin
          ? 'Create, edit and delete any lab, including practice labs.'
          : 'Create labs for your courses, edit the labs you own, and author practice labs.'
      ),
      permission(
        'labs.steps',
        'Labs',
        'Author lab steps and checks',
        'Add, edit and delete steps, verification commands, hints and expected output.'
      ),
      permission(
        'labs.sessions',
        'Labs',
        'Inspect learner lab sessions',
        admin
          ? 'Inspect every lab session, its terminal history and screenshots.'
          : 'Inspect sessions only for labs attached to your courses or created by you.'
      ),
      permission(
        'labSubmissions.review',
        'Reviews',
        'Review lab submissions',
        admin
          ? 'Approve or request changes on every lab submission.'
          : 'Approve or request changes on submissions for labs in your courses.'
      ),
      permission(
        'projects.review',
        'Reviews',
        'Review student projects',
        admin
          ? 'Approve or request changes on every student project.'
          : 'Approve or request changes on projects linked to your courses.'
      ),
      permission(
        'reports.review',
        'Reviews',
        'Review practical reports',
        admin
          ? 'Review and publish reports from every lab.'
          : 'Review and publish reports produced from your labs.'
      ),
      permission(
        'students.view',
        'Learners',
        'View learner analytics',
        admin
          ? 'See every learner, their progress, submissions and activity.'
          : 'See only learners enrolled in at least one of your courses.'
      ),
      permission(
        'announcements.send',
        'Communication',
        'Send announcements',
        admin
          ? 'Send announcements to any course or the whole platform.'
          : 'Send announcements to learners enrolled in your courses.'
      ),
      permission(
        'messages.respond',
        'Communication',
        'Reply to learner messages',
        admin
          ? 'Access every conversation on the platform.'
          : 'Access conversations where you are the assigned instructor.'
      ),
      permission(
        'content.generate',
        'Content Studio',
        'Generate labs with Content Studio',
        admin
          ? 'Generate labs for any course or as practice labs.'
          : 'Generate labs for your own courses or as practice labs.'
      ),
      permission(
        'blog.manage',
        'Content',
        'Manage blog articles',
        admin
          ? 'Create, edit and publish any article.'
          : 'Manage your own articles and articles generated from reports for your courses.'
      ),
      permission(
        'admin.manage',
        'Administration',
        'Manage users, infrastructure and settings',
        'User accounts, lab servers, content flags and platform settings are administrator-only.',
        admin
      ),
    ];

    res.json({
      role: req.user.role,
      scope: scopeRows[0],
      permissions,
    });
  })
);

/**
 * Learners enrolled in the instructor's courses, with completion, quiz,
 * assignment and practical-report analytics. Admins see every learner.
 */
router.get(
  '/students',
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        search: z.string().trim().max(120).optional(),
        courseId: z.coerce.number().int().positive().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(60).default(20),
      })
      .safeParse(req.query);
    if (!parsed.success) throw badRequest('Invalid query parameters.');
    const { search, courseId, page, limit } = parsed.data;
    const admin = isAdmin(req.user);
    if (courseId) await assertCourseAccess(req.user, courseId);

    const params = [req.user.id, admin];
    const scope = `(c.instructor_id = $1 OR $2::boolean)`;
    const reportScope = `(COALESCE(c.instructor_id, l.created_by) = $1 OR $2::boolean)`;
    const where = [`u.role = 'student'`];

    if (courseId) {
      params.push(courseId);
      where.push(`EXISTS (
        SELECT 1 FROM enrollments e2 JOIN courses c2 ON c2.id = e2.course_id
        WHERE e2.user_id = u.id AND c2.id = $${params.length}
      )`);
    } else {
      where.push(`EXISTS (
        SELECT 1 FROM enrollments e JOIN courses c ON c.id = e.course_id
        WHERE e.user_id = u.id AND ${scope} AND e.status <> 'dropped'
      )`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const { rows: countRows } = await query(
      `SELECT COUNT(*)::int AS total FROM users u ${whereSql}`,
      params
    );
    params.push(limit, (page - 1) * limit);
    const { rows } = await query(
      `SELECT u.id, u.full_name, u.email, u.avatar_url, u.is_active, u.created_at, u.last_login_at,
         (SELECT COUNT(*)::int FROM enrollments e JOIN courses c ON c.id = e.course_id
           WHERE e.user_id = u.id AND ${scope} AND e.status <> 'dropped') AS course_count,
         (SELECT COALESCE(ROUND(AVG(e.progress_percent), 1), 0) FROM enrollments e JOIN courses c ON c.id = e.course_id
           WHERE e.user_id = u.id AND ${scope} AND e.status <> 'dropped') AS avg_progress,
         (SELECT COUNT(*)::int FROM enrollments e JOIN courses c ON c.id = e.course_id
           WHERE e.user_id = u.id AND ${scope} AND e.status = 'completed') AS completed_courses,
         (SELECT COUNT(*)::int FROM lab_sessions ls JOIN labs l ON l.id = ls.lab_id
           JOIN courses c ON c.id = l.course_id WHERE ls.user_id = u.id AND ${scope}) AS lab_sessions,
         (SELECT COUNT(*)::int FROM lab_submissions sub
           WHERE sub.user_id = u.id AND (sub.instructor_id = $1 OR $2::boolean)) AS lab_submissions_total,
         (SELECT COUNT(*)::int FROM lab_submissions sub
           WHERE sub.user_id = u.id AND (sub.instructor_id = $1 OR $2::boolean) AND sub.status = 'submitted') AS lab_submissions_pending,
         (SELECT COUNT(*)::int FROM lab_submissions sub
           WHERE sub.user_id = u.id AND (sub.instructor_id = $1 OR $2::boolean) AND sub.status = 'approved') AS lab_submissions_approved,
         (SELECT COUNT(*)::int FROM student_projects p
           WHERE p.user_id = u.id AND (p.instructor_id = $1 OR $2::boolean)) AS projects_total,
         (SELECT COUNT(*)::int FROM student_projects p
           WHERE p.user_id = u.id AND (p.instructor_id = $1 OR $2::boolean) AND p.status = 'submitted') AS projects_pending,
         (SELECT COUNT(*)::int FROM reports r JOIN labs l ON l.id = r.lab_id
           LEFT JOIN courses c ON c.id = l.course_id WHERE r.user_id = u.id AND ${reportScope}) AS reports_total,
         (SELECT COUNT(*)::int FROM reports r JOIN labs l ON l.id = r.lab_id
           LEFT JOIN courses c ON c.id = l.course_id
           WHERE r.user_id = u.id AND ${reportScope} AND r.status = 'submitted') AS reports_pending,
         (SELECT COUNT(DISTINCT date_trunc('day', ae.created_at))::int FROM activity_events ae
           WHERE ae.user_id = u.id AND ae.created_at > now() - INTERVAL '30 days') AS active_days_30,
         (SELECT MAX(x.at) FROM (
            SELECT MAX(sub.submitted_at) AS at FROM lab_submissions sub
              WHERE sub.user_id = u.id AND (sub.instructor_id = $1 OR $2::boolean)
            UNION ALL
            SELECT MAX(p.updated_at) FROM student_projects p
              WHERE p.user_id = u.id AND (p.instructor_id = $1 OR $2::boolean)
            UNION ALL
            SELECT MAX(ls.last_activity_at) FROM lab_sessions ls JOIN labs l ON l.id = ls.lab_id
              JOIN courses c ON c.id = l.course_id WHERE ls.user_id = u.id AND ${scope}
            UNION ALL
            SELECT MAX(r.updated_at) FROM reports r JOIN labs l ON l.id = r.lab_id
              LEFT JOIN courses c ON c.id = l.course_id WHERE r.user_id = u.id AND ${reportScope}
          ) x) AS last_activity_at
       FROM users u
       ${whereSql}
       ORDER BY u.full_name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ students: rows, total: countRows[0].total, page, limit });
  })
);

/** One learner's progress across the instructor's courses. */
router.get(
  '/students/:id',
  asyncHandler(async (req, res) => {
    const studentId = Number(req.params.id);
    if (!Number.isInteger(studentId) || studentId <= 0) throw badRequest('Invalid learner id.');
    const admin = isAdmin(req.user);

    if (!admin) {
      const { rows } = await query(
        `SELECT 1 FROM enrollments e JOIN courses c ON c.id = e.course_id
         WHERE e.user_id = $1 AND c.instructor_id = $2 AND e.status <> 'dropped' LIMIT 1`,
        [studentId, req.user.id]
      );
      if (!rows[0]) throw forbidden('You can only view learners enrolled in your courses.');
    }

    const { rows: userRows } = await query(
      `SELECT id, email, full_name, role, headline, bio, avatar_url, is_active, created_at, last_login_at
       FROM users WHERE id = $1 AND role = 'student'`,
      [studentId]
    );
    const student = userRows[0];
    if (!student) throw notFound('Learner not found.');

    const scope = `(c.instructor_id = $2 OR $3::boolean)`;
    const reportScope = `(COALESCE(c.instructor_id, l.created_by) = $2 OR $3::boolean)`;
    const params = [studentId, req.user.id, admin];

    const { rows: enrollments } = await query(
      `SELECT e.id, e.status, e.progress_percent, e.enrolled_at, e.completed_at,
              c.id AS course_id, c.title, c.slug, c.cover_image,
              (SELECT COUNT(*)::int FROM lessons l2 WHERE l2.course_id = c.id) AS lesson_count,
              (SELECT COUNT(*)::int FROM lesson_progress lp
                WHERE lp.course_id = c.id AND lp.user_id = e.user_id AND lp.status = 'completed') AS lessons_completed
       FROM enrollments e JOIN courses c ON c.id = e.course_id
       WHERE e.user_id = $1 AND ${scope}
       ORDER BY e.enrolled_at DESC`,
      params
    );

    const { rows: labSubmissions } = await query(
      `SELECT sub.id, sub.status, sub.student_note, sub.instructor_feedback,
              sub.submitted_at, sub.reviewed_at, sub.reviewed_by,
              l.id AS lab_id, l.title AS lab_title, l.due_at,
              c.title AS course_title, c.id AS course_id
       FROM lab_submissions sub
       JOIN labs l ON l.id = sub.lab_id
       LEFT JOIN courses c ON c.id = sub.course_id
       WHERE sub.user_id = $1 AND (sub.instructor_id = $2 OR $3::boolean)
       ORDER BY sub.submitted_at DESC`,
      params
    );

    const { rows: projects } = await query(
      `SELECT p.id, p.title, p.description, p.repo_url, p.status, p.instructor_feedback,
              p.submitted_at, p.reviewed_at, p.updated_at,
              p.attachment_name, p.attachment_size,
              c.title AS course_title, c.id AS course_id
       FROM student_projects p
       LEFT JOIN courses c ON c.id = p.course_id
       WHERE p.user_id = $1 AND (p.instructor_id = $2 OR $3::boolean)
       ORDER BY p.updated_at DESC`,
      params
    );

    const { rows: reports } = await query(
      `SELECT r.id, r.title, r.status, r.score, r.max_score, r.instructor_feedback,
              r.created_at, r.updated_at, r.reviewed_at,
              l.title AS lab_title, c.title AS course_title, c.id AS course_id
       FROM reports r JOIN labs l ON l.id = r.lab_id
       LEFT JOIN courses c ON c.id = l.course_id
       WHERE r.user_id = $1 AND ${reportScope}
       ORDER BY r.updated_at DESC`,
      params
    );

    const { rows: labSessions } = await query(
      `SELECT ls.id, ls.status, ls.started_at, ls.last_activity_at, ls.ended_at,
              l.id AS lab_id, l.title AS lab_title, c.title AS course_title,
              (SELECT COUNT(*)::int FROM lab_steps st WHERE st.lab_id = l.id) AS step_count,
              (SELECT COUNT(*)::int FROM lab_step_progress p WHERE p.session_id = ls.id) AS steps_completed
       FROM lab_sessions ls JOIN labs l ON l.id = ls.lab_id
       JOIN courses c ON c.id = l.course_id
       WHERE ls.user_id = $1 AND ${scope}
       ORDER BY ls.started_at DESC
       LIMIT 30`,
      params
    );

    const { rows: history } = await query(
      `SELECT ae.id, ae.action, ae.entity_type, ae.entity_id, ae.metadata, ae.created_at
       FROM activity_events ae
       WHERE ae.user_id = $1 AND (
         (ae.entity_type = 'course' AND EXISTS (
           SELECT 1 FROM courses c WHERE c.id = ae.entity_id AND (c.instructor_id = $2 OR $3::boolean)))
         OR (ae.entity_type = 'lesson' AND EXISTS (
           SELECT 1 FROM lessons l JOIN courses c ON c.id = l.course_id
           WHERE l.id = ae.entity_id AND (c.instructor_id = $2 OR $3::boolean)))
         OR (ae.entity_type = 'lab' AND EXISTS (
           SELECT 1 FROM labs l JOIN courses c ON c.id = l.course_id
           WHERE l.id = ae.entity_id AND (c.instructor_id = $2 OR $3::boolean)))
         OR (ae.entity_type = 'lab_session' AND EXISTS (
           SELECT 1 FROM lab_sessions s JOIN labs l ON l.id = s.lab_id
           JOIN courses c ON c.id = l.course_id
           WHERE s.id = ae.entity_id AND (c.instructor_id = $2 OR $3::boolean)))
         OR (ae.entity_type = 'report' AND EXISTS (
           SELECT 1 FROM reports r JOIN labs l ON l.id = r.lab_id
           LEFT JOIN courses c ON c.id = l.course_id
           WHERE r.id = ae.entity_id AND (COALESCE(c.instructor_id, l.created_by) = $2 OR $3::boolean)))
         OR (ae.entity_type = 'project' AND EXISTS (
           SELECT 1 FROM student_projects p
           WHERE p.id = ae.entity_id AND (p.instructor_id = $2 OR $3::boolean)))
       )
       ORDER BY ae.created_at DESC LIMIT 40`,
      params
    );

    const { rows: activitySummary } = await query(
      `SELECT COUNT(DISTINCT date_trunc('day', created_at))::int AS active_days_30,
              MAX(created_at) AS last_activity_at
       FROM activity_events
       WHERE user_id = $1 AND created_at > now() - INTERVAL '30 days'`,
      [studentId]
    );

    const completedCourses = enrollments.filter((item) => item.status === 'completed').length;
    const avgProgress = enrollments.length
      ? Math.round((enrollments.reduce((sum, item) => sum + Number(item.progress_percent || 0), 0) / enrollments.length) * 10) / 10
      : 0;

    res.json({
      student,
      enrollments,
      labSubmissions,
      projects,
      reports,
      labSessions,
      history,
      summary: {
        courseCount: enrollments.length,
        completedCourses,
        completionRate: enrollments.length ? Math.round((completedCourses / enrollments.length) * 1000) / 10 : 0,
        avgProgress,
        labSubmissionsTotal: labSubmissions.length,
        labSubmissionsPending: labSubmissions.filter((item) => item.status === 'submitted').length,
        labSubmissionsApproved: labSubmissions.filter((item) => item.status === 'approved').length,
        projectsTotal: projects.length,
        projectsPending: projects.filter((item) => item.status === 'submitted').length,
        projectsApproved: projects.filter((item) => item.status === 'approved').length,
        reportsTotal: reports.length,
        reportsPending: reports.filter((item) => item.status === 'submitted').length,
        labSessions: labSessions.length,
        activeDays30: activitySummary[0]?.active_days_30 ?? 0,
        lastActivityAt: activitySummary[0]?.last_activity_at ?? null,
      },
    });
  })
);

const announcementSchema = z.object({
  title: z.string().trim().min(3, 'Title must be at least 3 characters.').max(200),
  body: z.string().trim().min(5, 'Message must be at least 5 characters.').max(5000),
  courseId: z.coerce.number().int().positive().optional().nullable(),
  link: z
    .string()
    .trim()
    .max(300)
    .refine((value) => !value || value.startsWith('/'), 'Link must be an internal path such as /student/lab-assignments.')
    .optional()
    .nullable(),
});

/** Announcements previously sent by this instructor (admins see all). */
router.get(
  '/announcements',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT a.id, a.title, a.body, a.link, a.recipient_count, a.created_at,
              a.course_id, c.title AS course_title,
              u.id AS author_id, u.full_name AS author_name
       FROM announcements a
       JOIN users u ON u.id = a.author_id
       LEFT JOIN courses c ON c.id = a.course_id
       WHERE a.author_id = $1 OR $2::boolean
       ORDER BY a.created_at DESC LIMIT 100`,
      [req.user.id, isAdmin(req.user)]
    );
    res.json({ announcements: rows });
  })
);

/**
 * Send an announcement to every active learner enrolled in the instructor's
 * courses, or to one course when courseId is supplied.
 */
router.post(
  '/announcements',
  validateBody(announcementSchema),
  asyncHandler(async (req, res) => {
    const { title, body, link } = req.body;
    const courseId = req.body.courseId ?? null;

    if (courseId) await assertCourseAccess(req.user, courseId);

    const { rows: courseRows } = courseId
      ? { rows: [{ id: courseId }] }
      : await query(
          `SELECT id FROM courses WHERE instructor_id = $1 OR $2::boolean`,
          [req.user.id, isAdmin(req.user)]
        );
    if (courseRows.length === 0) {
      throw badRequest('Create or publish a course before sending an announcement.');
    }
    const courseIds = courseRows.map((row) => row.id);

    const { rows: recipientRows } = await query(
      `SELECT DISTINCT e.user_id
       FROM enrollments e
       JOIN users u ON u.id = e.user_id
       WHERE e.course_id = ANY($1::bigint[]) AND u.is_active = TRUE AND e.status <> 'dropped'`,
      [courseIds]
    );
    if (recipientRows.length === 0) {
      throw badRequest('No enrolled learners are available to receive this announcement yet.');
    }
    const recipientIds = recipientRows.map((row) => Number(row.user_id));

    const announcement = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO announcements (author_id, course_id, title, body, link, recipient_count)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, title, body, link, recipient_count, created_at, course_id`,
        [req.user.id, courseId, title, body, link || null, recipientIds.length]
      );
      await notify(client, {
        userIds: recipientIds,
        type: 'announcement',
        title,
        body,
        link: link || '/student/notifications',
      });
      await recordActivity(client, {
        userId: req.user.id,
        action: 'announcement.sent',
        entityType: 'announcement',
        entityId: rows[0].id,
        metadata: { title, recipients: recipientIds.length, courseId },
      });
      return rows[0];
    });

    emitNotifications(recipientIds, {
      type: 'announcement',
      title,
      body,
      link: link || '/student/notifications',
      created_at: new Date().toISOString(),
    });

    res.status(201).json({ announcement, delivered: recipientIds.length });
  })
);

export default router;
