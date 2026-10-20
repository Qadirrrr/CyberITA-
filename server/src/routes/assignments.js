import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../utils/errors.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, requireRole, isStaff } from '../middleware/auth.js';
import { notify, recordActivity } from '../utils/activity.js';

const router = Router();

const assignmentSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(20000).default(''),
  lessonId: z.coerce.number().int().optional().nullable(),
  dueAt: z.string().datetime({ offset: true }).optional().nullable(),
  points: z.coerce.number().int().min(1).max(1000).default(100),
  isPublished: z.boolean().default(true),
});

async function getAssignment(assignmentId, { staffUser = null } = {}) {
  const { rows } = await query(
    `SELECT a.*, c.instructor_id, c.title AS course_title, c.slug AS course_slug
     FROM assignments a JOIN courses c ON c.id = a.course_id WHERE a.id = $1`,
    [assignmentId]
  );
  const assignment = rows[0];
  if (!assignment) throw notFound('Assignment not found.');
  if (staffUser?.role === 'instructor' && assignment.instructor_id !== staffUser.id) {
    throw forbidden('You can only manage your own course content.');
  }
  return assignment;
}

router.get(
  '/courses/:courseId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows: enrollment } = await query(
      `SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2`,
      [req.user.id, req.params.courseId]
    );
    if (!enrollment[0] && !isStaff(req.user)) throw badRequest('You are not enrolled in this course.');
    const { rows } = await query(
      `SELECT a.id, a.title, a.description, a.due_at, a.points, a.is_published, a.lesson_id,
              s.id AS submission_id, s.status AS submission_status, s.grade, s.submitted_at, s.feedback
       FROM assignments a
       LEFT JOIN assignment_submissions s ON s.assignment_id = a.id AND s.user_id = $1
       WHERE a.course_id = $2 AND (a.is_published = TRUE OR $3)
       ORDER BY a.id`,
      [req.user.id, req.params.courseId, isStaff(req.user)]
    );
    res.json({ assignments: rows });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const assignment = await getAssignment(req.params.id, { staffUser: isStaff(req.user) ? req.user : null });
    const { rows } = await query(
      `SELECT * FROM assignment_submissions WHERE assignment_id = $1 AND user_id = $2`,
      [assignment.id, req.user.id]
    );
    res.json({ assignment, submission: rows[0] || null });
  })
);

router.post(
  '/:id/submit',
  requireAuth,
  validateBody(z.object({
    content: z.string().trim().max(20000).default(''),
  })),
  asyncHandler(async (req, res) => {
    const assignment = await getAssignment(req.params.id, { staffUser: isStaff(req.user) ? req.user : null });
    const { rows: enrollment } = await query(
      `SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2`,
      [req.user.id, assignment.course_id]
    );
    if (!enrollment[0]) throw badRequest('You must be enrolled in the course to submit.');
    if (!req.body.content.trim()) throw badRequest('Submission content cannot be empty.');

    const { rows } = await query(
      `INSERT INTO assignment_submissions (assignment_id, user_id, content, status, submitted_at)
       VALUES ($1, $2, $3, 'submitted', now())
       ON CONFLICT (assignment_id, user_id) DO UPDATE SET
         content = EXCLUDED.content, status = 'submitted', grade = NULL, feedback = NULL,
         submitted_at = now(), graded_at = NULL
       RETURNING *`,
      [assignment.id, req.user.id, req.body.content]
    );
    await withTransaction(async (client) => {
      await recordActivity(client, {
        userId: req.user.id,
        action: 'assignment.submitted',
        entityType: 'assignment',
        entityId: assignment.id,
        metadata: { title: assignment.title },
      });
      await notify(client, {
        userIds: [assignment.instructor_id],
        type: 'submission',
        title: 'New assignment submission',
        body: `${req.user.full_name} submitted "${assignment.title}".`,
        link: `/instructor/submissions?assignment=${assignment.id}`,
      });
    });
    res.status(201).json({ submission: rows[0] });
  })
);

// ---------- staff ----------

router.post(
  '/courses/:courseId',
  requireRole('admin', 'instructor'),
  validateBody(assignmentSchema),
  asyncHandler(async (req, res) => {
    const { rows: courseRows } = await query(`SELECT id, instructor_id FROM courses WHERE id = $1`, [req.params.courseId]);
    if (!courseRows[0]) throw notFound('Course not found.');
    if (req.user.role === 'instructor' && courseRows[0].instructor_id !== req.user.id) {
      throw forbidden('You can only manage your own courses.');
    }
    const b = req.body;
    const { rows } = await query(
      `INSERT INTO assignments (course_id, lesson_id, title, description, due_at, points, is_published)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [courseRows[0].id, b.lessonId ?? null, b.title, b.description, b.dueAt ?? null, b.points, b.isPublished]
    );
    res.status(201).json({ assignment: rows[0] });
  })
);

router.put(
  '/:id',
  requireRole('admin', 'instructor'),
  validateBody(assignmentSchema.partial()),
  asyncHandler(async (req, res) => {
    const assignment = await getAssignment(req.params.id, { staffUser: req.user });
    const b = req.body;
    const { rows } = await query(
      `UPDATE assignments SET
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         lesson_id = COALESCE($3, lesson_id),
         due_at = COALESCE($4, due_at),
         points = COALESCE($5, points),
         is_published = COALESCE($6, is_published)
       WHERE id = $7 RETURNING *`,
      [b.title ?? null, b.description ?? null, b.lessonId ?? null, b.dueAt ?? null,
       b.points ?? null, 'isPublished' in b ? b.isPublished : null, assignment.id]
    );
    res.json({ assignment: rows[0] });
  })
);

router.delete(
  '/:id',
  requireRole('admin', 'instructor'),
  asyncHandler(async (req, res) => {
    const assignment = await getAssignment(req.params.id, { staffUser: req.user });
    await query('DELETE FROM assignments WHERE id = $1', [assignment.id]);
    res.json({ ok: true });
  })
);

router.get(
  '/:id/submissions',
  requireRole('admin', 'instructor'),
  asyncHandler(async (req, res) => {
    const assignment = await getAssignment(req.params.id, { staffUser: req.user });
    const { rows } = await query(
      `SELECT s.*, u.full_name, u.email, u.avatar_url
       FROM assignment_submissions s JOIN users u ON u.id = s.user_id
       WHERE s.assignment_id = $1 ORDER BY s.submitted_at DESC`,
      [assignment.id]
    );
    res.json({ assignment, submissions: rows });
  })
);

const gradeSchema = z.object({
  grade: z.coerce.number().min(0),
  feedback: z.string().trim().max(5000).default(''),
  status: z.enum(['graded', 'returned']).default('graded'),
});

router.post(
  '/submissions/:submissionId/grade',
  requireRole('admin', 'instructor'),
  validateBody(gradeSchema),
  asyncHandler(async (req, res) => {
    const { rows: existing } = await query(
      `SELECT s.*, a.points, a.title, c.instructor_id FROM assignment_submissions s
       JOIN assignments a ON a.id = s.assignment_id
       JOIN courses c ON c.id = a.course_id
       WHERE s.id = $1`,
      [req.params.submissionId]
    );
    const submission = existing[0];
    if (!submission) throw notFound('Submission not found.');
    if (req.user.role === 'instructor' && submission.instructor_id !== req.user.id) {
      throw forbidden('You can only grade submissions for your own courses.');
    }
    if (req.body.grade > submission.points) throw badRequest(`Grade cannot exceed ${submission.points} points.`);

    const { rows } = await query(
      `UPDATE assignment_submissions SET grade = $1, feedback = $2, status = $3,
         grader_id = $4, graded_at = now()
       WHERE id = $5 RETURNING *`,
      [req.body.grade, req.body.feedback, req.body.status, req.user.id, submission.id]
    );
    await withTransaction(async (client) => {
      await notify(client, {
        userIds: [submission.user_id],
        type: 'grade',
        title: req.body.status === 'graded' ? 'Assignment graded' : 'Assignment returned for changes',
        body: `"${submission.title}": ${req.body.grade}/${submission.points}. ${req.body.feedback}`.slice(0, 500),
        link: `/learn/assignments/${submission.assignment_id}`,
      });
      await recordActivity(client, {
        userId: req.user.id,
        action: 'assignment.graded',
        entityType: 'submission',
        entityId: submission.id,
        metadata: { grade: req.body.grade },
      });
    });
    res.json({ submission: rows[0] });
  })
);

export default router;
