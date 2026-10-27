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

/** Quizzes across the instructor's courses, including attempt performance. */
router.get(
  '/quizzes',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT q.id, q.title, q.description, q.pass_score, q.lesson_id, q.course_id, q.created_at,
              c.title AS course_title, c.slug AS course_slug,
              l.title AS lesson_title,
              (SELECT COUNT(*)::int FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS question_count,
              (SELECT COALESCE(SUM(qq.points), 0)::int FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS points_total,
              (SELECT COUNT(*)::int FROM quiz_attempts qa WHERE qa.quiz_id = q.id) AS attempt_count,
              (SELECT COUNT(DISTINCT qa.user_id)::int FROM quiz_attempts qa WHERE qa.quiz_id = q.id) AS learner_count,
              (SELECT COUNT(*)::int FROM quiz_attempts qa WHERE qa.quiz_id = q.id AND qa.passed) AS pass_count,
              (SELECT COALESCE(ROUND(AVG(CASE WHEN qa.max_points > 0 THEN qa.score / qa.max_points * 100 END)::numeric, 1), 0)
                 FROM quiz_attempts qa WHERE qa.quiz_id = q.id) AS avg_percent
       FROM quizzes q
       JOIN courses c ON c.id = q.course_id
       LEFT JOIN lessons l ON l.id = q.lesson_id
       WHERE c.instructor_id = $1 OR $2::boolean
       ORDER BY q.id DESC`,
      [req.user.id, isAdmin(req.user)]
    );
    res.json({ quizzes: rows });
  })
);

/** All attempts for one of the instructor's quizzes. */
router.get(
  '/quizzes/:id/attempts',
  asyncHandler(async (req, res) => {
    const { rows: quizRows } = await query(
      `SELECT q.id, q.title, c.instructor_id FROM quizzes q JOIN courses c ON c.id = q.course_id WHERE q.id = $1`,
      [req.params.id]
    );
    const quiz = quizRows[0];
    if (!quiz) throw notFound('Quiz not found.');
    if (!isAdmin(req.user) && quiz.instructor_id !== req.user.id) {
      throw forbidden('You can only view attempts for your own courses.');
    }
    const { rows } = await query(
      `SELECT qa.id, qa.score, qa.max_points, qa.passed, qa.created_at,
              u.id AS user_id, u.full_name, u.email, u.avatar_url
       FROM quiz_attempts qa JOIN users u ON u.id = qa.user_id
       WHERE qa.quiz_id = $1 ORDER BY qa.created_at DESC LIMIT 200`,
      [quiz.id]
    );
    res.json({ quiz: { id: quiz.id, title: quiz.title }, attempts: rows });
  })
);

/** Assignments across the instructor's courses with submission counts. */
router.get(
  '/assignments',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT a.id, a.title, a.description, a.due_at, a.points, a.is_published, a.lesson_id,
              a.course_id, a.created_at,
              c.title AS course_title, c.slug AS course_slug,
              l.title AS lesson_title,
              (SELECT COUNT(*)::int FROM assignment_submissions s WHERE s.assignment_id = a.id) AS submission_count,
              (SELECT COUNT(*)::int FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.status = 'submitted') AS pending_count,
              (SELECT COUNT(*)::int FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.status = 'graded') AS graded_count,
              (SELECT COUNT(*)::int FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.status = 'returned') AS returned_count,
              (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = a.course_id AND e.status <> 'dropped') AS learner_count
       FROM assignments a
       JOIN courses c ON c.id = a.course_id
       LEFT JOIN lessons l ON l.id = a.lesson_id
       WHERE c.instructor_id = $1 OR $2::boolean
       ORDER BY a.due_at ASC NULLS LAST, a.id DESC`,
      [req.user.id, isAdmin(req.user)]
    );
    res.json({ assignments: rows });
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
         (SELECT COUNT(*)::int FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
           JOIN courses c ON c.id = q.course_id WHERE qa.user_id = u.id AND ${scope}) AS quiz_attempts,
         (SELECT COALESCE(ROUND(AVG(CASE WHEN qa.max_points > 0 THEN qa.score / qa.max_points * 100 END)::numeric, 1), 0)
           FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id JOIN courses c ON c.id = q.course_id
           WHERE qa.user_id = u.id AND ${scope}) AS avg_quiz_percent,
         (SELECT COUNT(*)::int FROM reports r JOIN labs l ON l.id = r.lab_id
           LEFT JOIN courses c ON c.id = l.course_id WHERE r.user_id = u.id AND ${reportScope}) AS reports_total,
         (SELECT COUNT(*)::int FROM reports r JOIN labs l ON l.id = r.lab_id
           LEFT JOIN courses c ON c.id = l.course_id
           WHERE r.user_id = u.id AND ${reportScope} AND r.status = 'submitted') AS reports_pending,
         (SELECT COUNT(*)::int FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id
           JOIN courses c ON c.id = a.course_id
           WHERE s.user_id = u.id AND ${scope} AND s.status = 'submitted') AS submissions_pending,
         (SELECT COALESCE(ROUND(AVG(s.grade), 1), 0) FROM assignment_submissions s
           JOIN assignments a ON a.id = s.assignment_id JOIN courses c ON c.id = a.course_id
           WHERE s.user_id = u.id AND ${scope} AND s.grade IS NOT NULL) AS avg_grade,
         (SELECT COUNT(DISTINCT date_trunc('day', ae.created_at))::int FROM activity_events ae
           WHERE ae.user_id = u.id AND ae.created_at > now() - INTERVAL '30 days') AS active_days_30,
         (SELECT MAX(x.at) FROM (
            SELECT MAX(s.submitted_at) AS at FROM assignment_submissions s
              JOIN assignments a ON a.id = s.assignment_id JOIN courses c ON c.id = a.course_id
              WHERE s.user_id = u.id AND ${scope}
            UNION ALL
            SELECT MAX(qa.created_at) FROM quiz_attempts qa JOIN quizzes q ON q.id = qa.quiz_id
              JOIN courses c ON c.id = q.course_id WHERE qa.user_id = u.id AND ${scope}
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

    const { rows: quizzes } = await query(
      `SELECT q.id, q.title, q.pass_score, c.title AS course_title, c.id AS course_id,
              COUNT(qa.id)::int AS attempt_count,
              MAX(CASE WHEN qa.max_points > 0 THEN ROUND(qa.score / qa.max_points * 100) END) AS best_percent,
              MAX(qa.passed::int)::boolean AS has_passed,
              MAX(qa.created_at) AS last_attempt_at
       FROM quizzes q JOIN courses c ON c.id = q.course_id
       LEFT JOIN quiz_attempts qa ON qa.quiz_id = q.id AND qa.user_id = $1
       WHERE ${scope}
       GROUP BY q.id, c.id
       ORDER BY c.title, q.id`,
      params
    );

    const { rows: assignments } = await query(
      `SELECT a.id, a.title, a.points, a.due_at, a.is_published,
              c.title AS course_title, c.id AS course_id,
              s.id AS submission_id, s.status AS submission_status, s.grade, s.feedback,
              s.submitted_at, s.graded_at
       FROM assignments a JOIN courses c ON c.id = a.course_id
       LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.user_id = $1
       WHERE ${scope}
       ORDER BY a.due_at ASC NULLS LAST, a.id DESC`,
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
         OR (ae.entity_type = 'quiz' AND EXISTS (
           SELECT 1 FROM quizzes q JOIN courses c ON c.id = q.course_id
           WHERE q.id = ae.entity_id AND (c.instructor_id = $2 OR $3::boolean)))
         OR (ae.entity_type = 'assignment' AND EXISTS (
           SELECT 1 FROM assignments a JOIN courses c ON c.id = a.course_id
           WHERE a.id = ae.entity_id AND (c.instructor_id = $2 OR $3::boolean)))
         OR (ae.entity_type = 'submission' AND EXISTS (
           SELECT 1 FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id
           JOIN courses c ON c.id = a.course_id
           WHERE s.id = ae.entity_id AND (c.instructor_id = $2 OR $3::boolean)))
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
    const graded = assignments.filter((item) => item.grade != null);
    const avgGrade = graded.length
      ? Math.round((graded.reduce((sum, item) => sum + Number(item.grade), 0) / graded.length) * 10) / 10
      : 0;
    const quizPercents = quizzes
      .map((item) => (item.best_percent == null ? null : Number(item.best_percent)))
      .filter((value) => value != null);

    res.json({
      student,
      enrollments,
      quizzes,
      assignments,
      reports,
      labSessions,
      history,
      summary: {
        courseCount: enrollments.length,
        completedCourses,
        completionRate: enrollments.length ? Math.round((completedCourses / enrollments.length) * 1000) / 10 : 0,
        avgProgress,
        avgGrade,
        gradedSubmissions: graded.length,
        pendingSubmissions: assignments.filter((item) => item.submission_status === 'submitted').length,
        reportsTotal: reports.length,
        reportsPending: reports.filter((item) => item.status === 'submitted').length,
        avgQuizPercent: quizPercents.length
          ? Math.round((quizPercents.reduce((sum, value) => sum + value, 0) / quizPercents.length) * 10) / 10
          : 0,
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
    .refine((value) => !value || value.startsWith('/'), 'Link must be an internal path such as /student/assignments.')
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
