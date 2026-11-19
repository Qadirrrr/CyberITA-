import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { asyncHandler, badRequest, conflict, notFound } from '../utils/errors.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { certificateSerial, percentComplete } from '../utils/helpers.js';
import { notify, recordActivity } from '../utils/activity.js';

const router = Router();

/** Recomputes course progress for a user, finalizing the course when 100% is reached. */
export async function recomputeCourseProgress(client, userId, courseId) {
  const runner = client || { query: (text, params) => query(text, params) };
  const { rows: totals } = await runner.query(
    `SELECT COUNT(*)::int AS total FROM lessons WHERE course_id = $1`,
    [courseId]
  );
  const { rows: completed } = await runner.query(
    `SELECT COUNT(*)::int AS done FROM lesson_progress
     WHERE user_id = $1 AND course_id = $2 AND status = 'completed'`,
    [userId, courseId]
  );
  const total = totals[0].total;
  const done = completed[0].done;
  const percent = total > 0 ? Math.min(100, percentComplete(done, total)) : 0;

  const { rows: enrollmentRows } = await runner.query(
    `SELECT * FROM enrollments WHERE user_id = $1 AND course_id = $2`,
    [userId, courseId]
  );
  const enrollment = enrollmentRows[0];
  if (!enrollment) return { percent, enrolled: false, completedNow: false };

  const completedNow = total > 0 && percent >= 100 && enrollment.status !== 'completed';
  const newStatus = completedNow ? 'completed' : enrollment.status;

  await runner.query(
    `UPDATE enrollments SET progress_percent = $1, status = $2,
       completed_at = COALESCE(completed_at, $4)
     WHERE id = $3`,
    [percent, newStatus, enrollment.id, completedNow ? new Date() : null]
  );

  let certificate = null;
  if (completedNow) {
    const { rows: existingCert } = await runner.query(
      `SELECT id, serial FROM certificates WHERE user_id = $1 AND course_id = $2`,
      [userId, courseId]
    );
    if (existingCert[0]) {
      certificate = existingCert[0];
    } else {
      const { rows: certRows } = await runner.query(
        `INSERT INTO certificates (serial, user_id, course_id, final_progress)
         VALUES ($1, $2, $3, 100) RETURNING id, serial, issued_at`,
        [certificateSerial(), userId, courseId]
      );
      certificate = certRows[0];
    }
  }
  return { percent, enrolled: true, completedNow, certificate, total, done };
}

router.get(
  '/my-courses',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT e.id, e.status, e.progress_percent, e.enrolled_at, e.completed_at,
              c.id AS course_id, c.slug, c.title, c.summary, c.cover_image, c.category, c.level,
              c.duration_hours, u.full_name AS instructor_name,
              (SELECT COUNT(*)::int FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
              (SELECT COUNT(*)::int FROM lesson_progress lp
                WHERE lp.user_id = e.user_id AND lp.course_id = c.id AND lp.status = 'completed') AS completed_lessons,
              (SELECT l.title FROM lessons l WHERE l.course_id = c.id ORDER BY l.position, l.id
                LIMIT 1 OFFSET (SELECT COUNT(*) FROM lesson_progress lp2
                  WHERE lp2.user_id = e.user_id AND lp2.course_id = c.id AND lp2.status = 'completed')) AS next_lesson_title,
              (SELECT l.id FROM lessons l WHERE l.course_id = c.id ORDER BY l.position, l.id
                LIMIT 1 OFFSET (SELECT COUNT(*) FROM lesson_progress lp2
                  WHERE lp2.user_id = e.user_id AND lp2.course_id = c.id AND lp2.status = 'completed')) AS next_lesson_id,
              (SELECT COUNT(*)::int FROM certificates ct WHERE ct.user_id = e.user_id AND ct.course_id = c.id) AS has_certificate
       FROM enrollments e
       JOIN courses c ON c.id = e.course_id
       LEFT JOIN users u ON u.id = c.instructor_id
       WHERE e.user_id = $1
       ORDER BY e.enrolled_at DESC`,
      [req.user.id]
    );
    res.json({ enrollments: rows });
  })
);

router.post(
  '/courses/:courseId/enroll',
  requireAuth,
  asyncHandler(async (req, res) => {
    const courseId = Number(req.params.courseId);
    const { rows } = await query(`SELECT id, title, slug, status, instructor_id FROM courses WHERE id = $1`, [courseId]);
    const course = rows[0];
    if (!course || course.status !== 'published') throw notFound('Course not found or not open for enrollment.');

    const existing = await query('SELECT id, status FROM enrollments WHERE user_id = $1 AND course_id = $2', [req.user.id, courseId]);
    if (existing.rows.length > 0) {
      if (existing.rows[0].status !== 'dropped') throw conflict('You are already enrolled in this course.');
      await query(
        `UPDATE enrollments SET status = 'active', enrolled_at = now(), progress_percent = 0, completed_at = NULL WHERE id = $1`,
        [existing.rows[0].id]
      );
    } else {
      await query('INSERT INTO enrollments (user_id, course_id) VALUES ($1, $2)', [req.user.id, courseId]);
    }

    await withTransaction(async (client) => {
      await recordActivity(client, {
        userId: req.user.id,
        action: 'course.enrolled',
        entityType: 'course',
        entityId: courseId,
        metadata: { title: course.title },
      });
      await notify(client, {
        userIds: [req.user.id],
        type: 'enrollment',
        title: `Welcome to ${course.title}`,
        body: 'Your enrollment is confirmed. Start with the first lesson whenever you are ready.',
        link: `/learn/${course.slug}`,
      });
      if (course.instructor_id && course.instructor_id !== req.user.id) {
        await notify(client, {
          userIds: [course.instructor_id],
          type: 'enrollment',
          title: 'New student enrolled',
          body: `${req.user.full_name} enrolled in ${course.title}.`,
          link: `/instructor/courses/${course.id}`,
        });
      }
    });

    const { rows: fresh } = await query(
      `SELECT * FROM enrollments WHERE user_id = $1 AND course_id = $2`,
      [req.user.id, courseId]
    );
    res.status(201).json({ enrollment: fresh[0] });
  })
);

router.delete(
  '/courses/:courseId/enroll',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `UPDATE enrollments SET status = 'dropped' WHERE user_id = $1 AND course_id = $2 RETURNING id`,
      [req.user.id, req.params.courseId]
    );
    if (!rows[0]) throw notFound('Enrollment not found.');
    res.json({ ok: true });
  })
);

router.get(
  '/courses/:courseId/progress',
  requireAuth,
  asyncHandler(async (req, res) => {
    const courseId = Number(req.params.courseId);
    const { rows: enrollmentRows } = await query(
      `SELECT * FROM enrollments WHERE user_id = $1 AND course_id = $2`,
      [req.user.id, courseId]
    );
    if (!enrollmentRows[0]) throw notFound('You are not enrolled in this course.');
    const { rows: lessons } = await query(
      `SELECT l.id, l.title, l.position, l.module_id, lp.status, lp.completed_at, lp.time_spent_seconds
       FROM lessons l
       LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.user_id = $1
       WHERE l.course_id = $2 ORDER BY l.position, l.id`,
      [req.user.id, courseId]
    );
    const { rows: labSubmissions } = await query(
      `SELECT s.id, s.lab_id, s.status, s.submitted_at, s.reviewed_at, l.title
       FROM lab_submissions s JOIN labs l ON l.id = s.lab_id
       WHERE s.user_id = $1 AND s.course_id = $2
       ORDER BY s.submitted_at DESC`,
      [req.user.id, courseId]
    );
    const { rows: certRows } = await query(
      `SELECT id, serial, issued_at FROM certificates WHERE user_id = $1 AND course_id = $2`,
      [req.user.id, courseId]
    );
    res.json({
      enrollment: enrollmentRows[0],
      lessons,
      labSubmissions,
      certificate: certRows[0] || null,
      percent: Number(enrollmentRows[0].progress_percent),
    });
  })
);

const progressSchema = z.object({
  completed: z.boolean().optional(),
  timeSpentSeconds: z.coerce.number().int().min(0).max(36000).optional(),
});

router.post(
  '/lessons/:lessonId/progress',
  requireAuth,
  validateBody(progressSchema),
  asyncHandler(async (req, res) => {
    const lessonId = Number(req.params.lessonId);
    const { rows } = await query(`SELECT id, course_id, title FROM lessons WHERE id = $1`, [lessonId]);
    const lesson = rows[0];
    if (!lesson) throw notFound('Lesson not found.');

    const { rows: enrollmentRows } = await query(
      `SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2`,
      [req.user.id, lesson.course_id]
    );
    if (!enrollmentRows[0]) throw badRequest('Enroll in the course before tracking lesson progress.');

    const { completed, timeSpentSeconds } = req.body;
    const wasCompleted = await query(
      `SELECT status FROM lesson_progress WHERE user_id = $1 AND lesson_id = $2`,
      [req.user.id, lessonId]
    );
    const alreadyDone = wasCompleted.rows[0]?.status === 'completed';

    await query(
      `INSERT INTO lesson_progress (user_id, lesson_id, course_id, status, time_spent_seconds, completed_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, lesson_id) DO UPDATE SET
         status = CASE WHEN EXCLUDED.status = 'completed' THEN 'completed' ELSE lesson_progress.status END,
         time_spent_seconds = lesson_progress.time_spent_seconds + EXCLUDED.time_spent_seconds,
         completed_at = COALESCE(lesson_progress.completed_at, EXCLUDED.completed_at),
         updated_at = now()`,
      [req.user.id, lessonId, lesson.course_id, completed ? 'completed' : 'in_progress',
       timeSpentSeconds || 0, completed ? new Date() : null]
    );

    const result = await recomputeCourseProgress(null, req.user.id, lesson.course_id);

    if (completed && !alreadyDone) {
      await withTransaction(async (client) => {
        await recordActivity(client, {
          userId: req.user.id,
          action: 'lesson.completed',
          entityType: 'lesson',
          entityId: lessonId,
          metadata: { title: lesson.title, progress: result.percent },
        });
        if (result.completedNow) {
          await recordActivity(client, {
            userId: req.user.id,
            action: 'course.completed',
            entityType: 'course',
            entityId: lesson.course_id,
          });
          await notify(client, {
            userIds: [req.user.id],
            type: 'certificate',
            title: 'Course completed, certificate issued!',
            body: `Congratulations, you completed the course. Your certificate serial is ${result.certificate?.serial || ''}.`,
            link: '/student/certificates',
          });
        }
      });
    }

    res.json({
      percent: result.percent,
      completedNow: Boolean(result.completedNow),
      certificate: result.certificate || null,
    });
  })
);

export default router;
