import { Router } from 'express';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/errors.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/**
 * Quizzes across every course the student is enrolled in, with their best
 * attempt so the dashboard can show what is available and what has been passed.
 */
router.get(
  '/me/quizzes',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT q.id, q.title, q.description, q.pass_score, q.course_id, q.lesson_id,
              c.title AS course_title, c.slug AS course_slug,
              (SELECT COUNT(*)::int FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS question_count,
              (SELECT COALESCE(SUM(qq.points), 0)::int FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS total_points,
              (SELECT COUNT(*)::int FROM quiz_attempts qa WHERE qa.quiz_id = q.id AND qa.user_id = $1) AS attempt_count,
              best.score AS best_score,
              best.max_points AS best_max_points,
              COALESCE(best.passed, FALSE) AS has_passed,
              last_attempt.created_at AS last_attempt_at
       FROM quizzes q
       JOIN courses c ON c.id = q.course_id
       JOIN enrollments e ON e.course_id = c.id AND e.user_id = $1 AND e.status <> 'dropped'
       LEFT JOIN LATERAL (
         SELECT qa.score, qa.max_points, qa.passed
         FROM quiz_attempts qa
         WHERE qa.quiz_id = q.id AND qa.user_id = $1
         ORDER BY qa.score DESC, qa.created_at DESC
         LIMIT 1
       ) best ON TRUE
       LEFT JOIN LATERAL (
         SELECT qa.created_at
         FROM quiz_attempts qa
         WHERE qa.quiz_id = q.id AND qa.user_id = $1
         ORDER BY qa.created_at DESC
         LIMIT 1
       ) last_attempt ON TRUE
       ORDER BY c.title, q.title`,
      [req.user.id]
    );
    res.json({ quizzes: rows });
  })
);

/**
 * Published assignments for the student's enrolled courses, including their
 * latest submission and computed overdue state.
 */
router.get(
  '/me/assignments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT a.id, a.title, a.description, a.due_at, a.points, a.course_id, a.lesson_id,
              c.title AS course_title, c.slug AS course_slug,
              s.id AS submission_id, s.status AS submission_status, s.grade, s.file_path,
              s.submitted_at, s.feedback, s.graded_at,
              COALESCE(a.due_at IS NOT NULL AND a.due_at < now() AND s.id IS NULL, FALSE) AS is_overdue
       FROM assignments a
       JOIN courses c ON c.id = a.course_id
       JOIN enrollments e ON e.course_id = c.id AND e.user_id = $1 AND e.status <> 'dropped'
       LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.user_id = $1
       WHERE a.is_published = TRUE
       ORDER BY
         CASE WHEN s.id IS NULL THEN 0 WHEN s.status = 'returned' THEN 1 ELSE 2 END,
         a.due_at ASC NULLS LAST,
         a.id DESC`,
      [req.user.id]
    );
    res.json({ assignments: rows });
  })
);

/**
 * Flat lesson list across enrolled courses. Used by the "My lessons" page so a
 * student can jump straight to any lesson without opening each course first.
 */
router.get(
  '/me/lessons',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT l.id, l.title, l.duration_minutes, l.lesson_type, l.position, l.module_id,
              m.title AS module_title, m.position AS module_position,
              c.id AS course_id, c.title AS course_title, c.slug AS course_slug, c.cover_image,
              lp.status AS progress_status, lp.completed_at
       FROM lessons l
       JOIN courses c ON c.id = l.course_id
       JOIN enrollments e ON e.course_id = c.id AND e.user_id = $1 AND e.status <> 'dropped'
       LEFT JOIN modules m ON m.id = l.module_id
       LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = $1
       ORDER BY c.title, COALESCE(m.position, 0), l.position, l.id`,
      [req.user.id]
    );
    res.json({ lessons: rows });
  })
);

/** Upcoming academic deadlines (assignments with a due date). */
router.get(
  '/me/calendar',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT a.id, a.title, a.due_at, a.points, a.course_id,
              c.title AS course_title, c.slug AS course_slug,
              s.status AS submission_status,
              COALESCE(a.due_at < now() AND s.id IS NULL, FALSE) AS is_overdue
       FROM assignments a
       JOIN courses c ON c.id = a.course_id
       JOIN enrollments e ON e.course_id = c.id AND e.user_id = $1 AND e.status <> 'dropped'
       LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.user_id = $1
       WHERE a.is_published = TRUE AND a.due_at IS NOT NULL
       ORDER BY a.due_at ASC`,
      [req.user.id]
    );
    res.json({ events: rows });
  })
);

export default router;
