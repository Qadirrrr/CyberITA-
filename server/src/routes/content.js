import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../utils/errors.js';
import { validateBody } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { slugify } from '../utils/helpers.js';
import { notify, recordActivity } from '../utils/activity.js';
import { generateLab } from '../services/labGenerator.js';

/**
 * Content Studio — one topic, a complete practical module.
 *
 * CyberITA+ is lab-only: every topic becomes a hands-on lab with verified
 * steps. The lab can be attached to one of the instructor's courses (as a lab
 * assignment with an optional deadline) or published as a practice lab.
 */

const router = Router();

const packSchema = z
  .object({
    title: z.string().trim().min(3, 'Give the topic a title with at least 3 characters.').max(200),
    details: z.string().trim().max(4000).default(''),
    courseId: z.coerce.number().int().optional().nullable(),
    lessonId: z.coerce.number().int().optional().nullable(),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).default('intermediate'),
    publish: z.boolean().default(true),
    stepCount: z.coerce.number().int().min(3).max(12).default(8),
    timeLimitMinutes: z.coerce.number().int().min(0).max(600).default(0),
    isPractice: z.boolean().default(false),
    dueInDays: z.coerce.number().int().min(1).max(120).optional().nullable(),
  })
  .refine((value) => value.isPractice || value.courseId, {
    message: 'Choose a course for the lab, or publish it as a practice lab.',
    path: ['courseId'],
  });

router.post(
  '/generate',
  requireRole('admin', 'instructor'),
  validateBody(packSchema),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const isPractice = Boolean(b.isPractice);
    const courseId = isPractice ? null : b.courseId ?? null;
    const lessonId = isPractice ? null : b.lessonId ?? null;

    let course = null;
    if (courseId) {
      const { rows } = await query('SELECT id, title, instructor_id FROM courses WHERE id = $1', [courseId]);
      course = rows[0];
      if (!course) throw notFound('Course not found.');
      if (req.user.role === 'instructor' && course.instructor_id !== req.user.id) {
        throw forbidden('You can only generate content for your own courses.');
      }
      if (lessonId) {
        const { rows: lessons } = await query('SELECT id FROM lessons WHERE id = $1 AND course_id = $2', [
          lessonId,
          courseId,
        ]);
        if (!lessons[0]) throw badRequest('Lesson does not belong to the selected course.');
      }
    }

    const labDraft = generateLab({
      title: b.title,
      details: b.details,
      difficulty: b.difficulty,
      stepCount: b.stepCount,
      isPractice,
    });

    const dueAt = !isPractice && b.dueInDays
      ? new Date(Date.now() + b.dueInDays * 24 * 60 * 60 * 1000)
      : null;

    const created = await withTransaction(async (client) => {
      const slug = `${slugify(labDraft.title)}-${Math.random().toString(36).slice(2, 6)}`;
      const { rows: labRows } = await client.query(
        `INSERT INTO labs (slug, title, course_id, lesson_id, summary, description, objectives,
           submission_requirements, difficulty, estimated_minutes, terminal_welcome, initial_files,
           initial_cwd, status, created_by, is_practice, due_at, time_limit_minutes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
        [
          slug,
          labDraft.title,
          courseId,
          lessonId,
          labDraft.summary,
          labDraft.description,
          labDraft.objectives,
          labDraft.submissionRequirements,
          labDraft.difficulty,
          labDraft.estimatedMinutes,
          labDraft.terminalWelcome,
          JSON.stringify(labDraft.initialFiles || {}),
          labDraft.initialCwd,
          b.publish ? 'published' : 'draft',
          req.user.id,
          isPractice,
          dueAt,
          Math.max(0, Number(b.timeLimitMinutes) || 0),
        ]
      );
      const labId = labRows[0].id;

      for (const item of labDraft.steps) {
        await client.query(
          `INSERT INTO lab_steps (lab_id, position, title, instruction, hint, verification,
             expected_command, expected_output_pattern, points, is_optional)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            labId,
            item.position,
            item.title,
            item.instruction,
            item.hint ?? null,
            item.verification,
            item.expectedCommand ?? null,
            item.expectedOutputPattern ?? null,
            item.points,
            item.isOptional,
          ]
        );
      }

      await recordActivity(client, {
        userId: req.user.id,
        action: 'lab.created',
        entityType: 'lab',
        entityId: labId,
        metadata: { title: labDraft.title, autoGenerated: true, source: 'content_studio' },
      });

      return { labId };
    });

    if (b.publish) {
      const audience = isPractice
        ? (await query(`SELECT id AS user_id FROM users WHERE role = 'student' AND is_active = TRUE`)).rows
        : course
          ? (await query(`SELECT user_id FROM enrollments WHERE course_id = $1 AND status <> 'dropped'`, [course.id])).rows
          : [];

      const userIds = audience.map((row) => row.user_id);
      if (userIds.length > 0) {
        await notify(null, {
          userIds,
          type: 'lab',
          title: isPractice ? `New practice lab: ${labDraft.title}` : `New lab assignment: ${labDraft.title}`,
          body: isPractice
            ? `A new practice lab "${labDraft.title}" is ready for hands-on practice.`
            : `A new hands-on lab "${labDraft.title}" is available in ${course?.title || 'your course'}.`,
          link: isPractice ? `/labs/${created.labId}` : '/student/lab-assignments',
        });
      }
    }

    const { rows: labRows } = await query('SELECT * FROM labs WHERE id = $1', [created.labId]);

    res.status(201).json({
      saved: true,
      lab: labRows[0] || null,
      generated: { lab: labDraft },
    });
  })
);

export default router;
