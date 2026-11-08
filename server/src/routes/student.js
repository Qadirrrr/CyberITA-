import { Router } from 'express';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/errors.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

/**
 * Lab assignments across every course the student is enrolled in. A lab
 * assignment is a published course lab; its submission (when present) is the
 * work the instructor reviews.
 */
router.get(
  '/me/lab-assignments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT l.id, l.slug, l.title, l.summary, l.difficulty, l.estimated_minutes,
              l.time_limit_minutes, l.due_at, l.course_id, l.lesson_id, l.lab_mode, l.min_evidence,
              c.title AS course_title, c.slug AS course_slug,
              (SELECT COUNT(*)::int FROM lab_steps st WHERE st.lab_id = l.id) AS step_count,
              (SELECT COUNT(*)::int FROM lab_steps st
                WHERE st.lab_id = l.id AND st.is_optional = FALSE) AS required_step_count,
              sub.id AS submission_id, sub.status AS submission_status,
              sub.submitted_at, sub.reviewed_at, sub.instructor_feedback,
              sess.id AS session_id, sess.status AS session_status,
              mp.completed_steps, mp.evidence_count, mp.submission_approved,
              COALESCE(l.due_at IS NOT NULL AND l.due_at < now() AND sub.id IS NULL, FALSE) AS is_overdue
       FROM labs l
       JOIN courses c ON c.id = l.course_id
       JOIN enrollments e ON e.course_id = c.id AND e.user_id = $1 AND e.status <> 'dropped'
       LEFT JOIN LATERAL (
         SELECT ls.id, ls.status, ls.submitted_at, ls.reviewed_at, ls.instructor_feedback
         FROM lab_submissions ls
         WHERE ls.lab_id = l.id AND ls.user_id = $1
         ORDER BY ls.submitted_at DESC
         LIMIT 1
       ) sub ON TRUE
       LEFT JOIN LATERAL (
         SELECT s.id, s.status
         FROM lab_sessions s
         WHERE s.lab_id = l.id AND s.user_id = $1
         ORDER BY s.id DESC
         LIMIT 1
       ) sess ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           COALESCE(MAX(x.completed_required), 0) AS completed_steps,
           COALESCE(MAX(x.evidence_count), 0) AS evidence_count,
           BOOL_OR(x.approved) AS submission_approved
         FROM (
           SELECT
             (SELECT COUNT(*)::int FROM lab_step_progress p
                JOIN lab_steps st ON st.id = p.step_id
               WHERE p.session_id = s.id AND st.is_optional = FALSE) AS completed_required,
             (SELECT COUNT(*)::int FROM screenshots sc WHERE sc.session_id = s.id) AS evidence_count,
             EXISTS (SELECT 1 FROM lab_submissions ls
                      WHERE ls.session_id = s.id AND ls.status = 'approved') AS approved
           FROM lab_sessions s
           WHERE s.lab_id = l.id AND s.user_id = $1
         ) x
       ) mp ON TRUE
       WHERE l.status = 'published' AND l.is_practice = FALSE
       ORDER BY
         CASE WHEN sub.id IS NULL THEN 0 WHEN sub.status = 'changes_requested' THEN 1 ELSE 2 END,
         l.due_at ASC NULLS LAST,
         l.id DESC`,
      [req.user.id]
    );
    const labAssignments = rows.map((row) => {
      const isReal = row.lab_mode === 'real';
      const requiredSteps = Number(row.required_step_count) || 0;
      const completedSteps = Number(row.completed_steps) || 0;
      const evidenceCount = Number(row.evidence_count) || 0;
      const minEvidence = Math.max(1, Number(row.min_evidence) || 1);
      const percent = isReal
        ? Math.min(100, Math.round((evidenceCount / minEvidence) * 100))
        : requiredSteps > 0
          ? Math.min(100, Math.round((completedSteps / requiredSteps) * 100))
          : (row.session_id ? 100 : 0);
      return {
        ...row,
        progress_percent: percent,
        is_completed: isReal
          ? Boolean(row.submission_approved) || evidenceCount >= minEvidence
          : requiredSteps > 0 && completedSteps >= requiredSteps,
      };
    });
    res.json({ labAssignments });
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

/** Upcoming lab assignment deadlines for the student's enrolled courses. */
router.get(
  '/me/calendar',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT l.id, l.title, l.due_at, l.course_id, l.slug AS lab_slug,
              c.title AS course_title, c.slug AS course_slug,
              sub.status AS submission_status,
              COALESCE(l.due_at < now() AND sub.id IS NULL, FALSE) AS is_overdue
       FROM labs l JOIN courses c ON c.id = l.course_id
       JOIN enrollments e ON e.course_id = c.id AND e.user_id = $1 AND e.status <> 'dropped'
       LEFT JOIN LATERAL (
         SELECT ls.id, ls.status FROM lab_submissions ls
         WHERE ls.lab_id = l.id AND ls.user_id = $1
         ORDER BY ls.submitted_at DESC LIMIT 1
       ) sub ON TRUE
       WHERE l.status = 'published' AND l.is_practice = FALSE AND l.due_at IS NOT NULL
       ORDER BY l.due_at ASC`,
      [req.user.id]
    );
    res.json({ events: rows });
  })
);

export default router;
