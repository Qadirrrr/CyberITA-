import { Router } from 'express';
import { query } from '../config/db.js';
import { asyncHandler, notFound } from '../utils/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

/** Aggregated numbers for the student dashboard. */
router.get(
  '/me/stats',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { rows: enrollment } = await query(
      `SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
         COUNT(*) FILTER (WHERE status = 'active')::int AS active,
         COALESCE(ROUND(AVG(progress_percent), 1), 0) AS avg_progress
       FROM enrollments WHERE user_id = $1`,
      [userId]
    );
    const { rows: labs } = await query(
      `SELECT COUNT(DISTINCT lab_id)::int AS started,
         COUNT(*) FILTER (WHERE status = 'stopped')::int AS stopped
       FROM lab_sessions WHERE user_id = $1`,
      [userId]
    );
    const { rows: labSteps } = await query(
      `SELECT COUNT(*)::int AS steps FROM lab_step_progress p
       JOIN lab_sessions s ON s.id = p.session_id WHERE s.user_id = $1`,
      [userId]
    );
    const { rows: certificates } = await query(
      `SELECT COUNT(*)::int AS total FROM certificates WHERE user_id = $1`, [userId]
    );
    const { rows: reports } = await query(
      `SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'published')::int AS published,
         COUNT(*) FILTER (WHERE status = 'submitted')::int AS awaiting_review
       FROM reports WHERE user_id = $1`,
      [userId]
    );
    const { rows: quiz } = await query(
      `SELECT COUNT(*)::int AS attempts,
         COUNT(*) FILTER (WHERE passed)::int AS passed
       FROM quiz_attempts WHERE user_id = $1`,
      [userId]
    );
    const { rows: streak } = await query(
      `SELECT COUNT(DISTINCT date_trunc('day', created_at))::int AS active_days
       FROM activity_events WHERE user_id = $1 AND created_at > now() - INTERVAL '30 days'`,
      [userId]
    );
    res.json({
      enrollments: enrollment[0],
      labs: { ...labs[0], stepsCompleted: labSteps[0].steps },
      certificates: certificates[0].total,
      reports: reports[0],
      quizzes: quiz[0],
      activeDays30: streak[0].active_days,
    });
  })
);

/** Learning history feed for the student. */
router.get(
  '/me/history',
  requireAuth,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 30);
    const { rows: countRows } = await query(
      `SELECT COUNT(*)::int AS total FROM activity_events WHERE user_id = $1`, [req.user.id]
    );
    const { rows } = await query(
      `SELECT id, action, entity_type, entity_id, metadata, created_at
       FROM activity_events WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.user.id, limit, (page - 1) * limit]
    );
    res.json({ events: rows, total: countRows[0].total, page, limit });
  })
);

/** Platform overview for the admin panel. */
router.get(
  '/admin/overview',
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    const { rows: users } = await query(
      `SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE role = 'student')::int AS students,
         COUNT(*) FILTER (WHERE role = 'instructor')::int AS instructors,
         COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '7 days')::int AS new_this_week
       FROM users`
    );
    const { rows: courses } = await query(
      `SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'published')::int AS published,
         COUNT(*) FILTER (WHERE status = 'draft')::int AS drafts
       FROM courses`
    );
    const { rows: enrollments } = await query(
      `SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
         COALESCE(ROUND(AVG(progress_percent), 1), 0) AS avg_progress
       FROM enrollments`
    );
    const { rows: labs } = await query(
      `SELECT (SELECT COUNT(*)::int FROM labs) AS labs,
         (SELECT COUNT(*)::int FROM lab_sessions) AS sessions,
         (SELECT COUNT(*)::int FROM screenshots) AS screenshots,
         (SELECT COUNT(*)::int FROM lab_step_progress) AS steps_completed`
    );
    const { rows: content } = await query(
      `SELECT (SELECT COUNT(*)::int FROM reports) AS reports,
         (SELECT COUNT(*)::int FROM reports WHERE status = 'submitted') AS reports_pending,
         (SELECT COUNT(*)::int FROM posts WHERE status = 'published') AS posts,
         (SELECT COUNT(*)::int FROM certificates) AS certificates,
         (SELECT COUNT(*)::int FROM contact_messages WHERE status = 'new') AS new_messages`
    );
    const { rows: signupSeries } = await query(
      `SELECT date_trunc('week', created_at)::date AS week, COUNT(*)::int AS count
       FROM users WHERE created_at > now() - INTERVAL '12 weeks'
       GROUP BY 1 ORDER BY 1`
    );
    const { rows: enrollmentSeries } = await query(
      `SELECT date_trunc('week', enrolled_at)::date AS week, COUNT(*)::int AS count
       FROM enrollments WHERE enrolled_at > now() - INTERVAL '12 weeks'
       GROUP BY 1 ORDER BY 1`
    );
    res.json({
      users: users[0],
      courses: courses[0],
      enrollments: enrollments[0],
      labs: labs[0],
      content: content[0],
      signupSeries,
      enrollmentSeries,
    });
  })
);

/** Instructor panel overview scoped to their own courses. */
router.get(
  '/instructor/overview',
  requireRole('instructor', 'admin'),
  asyncHandler(async (req, res) => {
    const instructorId = req.user.id;
    const admin = req.user.role === 'admin';
    const { rows: courses } = await query(
      `SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'published')::int AS published
       FROM courses WHERE instructor_id = $1 OR $2::boolean`,
      [instructorId, admin]
    );
    const { rows: students } = await query(
      `SELECT COUNT(DISTINCT e.user_id)::int AS learners,
         COUNT(*)::int AS enrollments,
         COALESCE(ROUND(AVG(e.progress_percent), 1), 0) AS avg_progress
       FROM enrollments e JOIN courses c ON c.id = e.course_id
       WHERE c.instructor_id = $1 OR $2::boolean`,
      [instructorId, admin]
    );
    const { rows: pending } = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM reports r JOIN labs l ON l.id = r.lab_id
            LEFT JOIN courses c2 ON c2.id = l.course_id
            WHERE r.status = 'submitted' AND (c2.instructor_id = $1 OR $2::boolean)) AS reports_pending,
         (SELECT COUNT(*)::int FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id
            JOIN courses c3 ON c3.id = a.course_id
            WHERE s.status = 'submitted' AND (c3.instructor_id = $1 OR $2::boolean)) AS submissions_pending`,
      [instructorId, admin]
    );
    const { rows: labs } = await query(
      `SELECT COUNT(*)::int AS labs,
         (SELECT COUNT(*)::int FROM lab_sessions s JOIN labs l2 ON l2.id = s.lab_id
           LEFT JOIN courses c4 ON c4.id = l2.course_id WHERE c4.instructor_id = $1 OR $2::boolean) AS sessions,
         (SELECT COUNT(*)::int FROM screenshots sc JOIN lab_sessions s2 ON s2.id = sc.session_id
           JOIN labs l3 ON l3.id = s2.lab_id LEFT JOIN courses c5 ON c5.id = l3.course_id
           WHERE c5.instructor_id = $1 OR $2::boolean) AS screenshots
       FROM labs l JOIN courses c ON c.id = l.course_id WHERE c.instructor_id = $1 OR $2::boolean`,
      [instructorId, admin]
    );
    res.json({ courses: courses[0], students: students[0], pending: pending[0], labs: labs[0] });
  })
);

export default router;
