import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { validateBody } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { slugify } from '../utils/helpers.js';
import { notify, recordActivity } from '../utils/activity.js';
import { generateLab } from '../services/labGenerator.js';
import { generateQuiz } from '../services/quizGenerator.js';
import { generateAssignment } from '../services/assignmentGenerator.js';

/**
 * Content Studio — one topic, a complete practical module.
 *
 * Given a title and a short brief, this endpoint generates and stores a lab
 * (with verified steps), a quiz (MCQs + scenario questions) and an assignment
 * brief in a single transaction. Every artefact can also be created on its own
 * from the Labs, Quizzes and Assignments pages.
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

    includeLab: z.boolean().default(true),
    labStepCount: z.coerce.number().int().min(3).max(12).default(8),
    labPractice: z.boolean().default(false),

    includeQuiz: z.boolean().default(true),
    quizMcqCount: z.coerce.number().int().min(1).max(30).default(5),
    quizSubjectiveCount: z.coerce.number().int().min(0).max(20).default(2),

    includeAssignment: z.boolean().default(true),
    assignmentPoints: z.coerce.number().int().min(10).max(500).default(100),
    dueInDays: z.coerce.number().int().min(1).max(120).default(7),
  })
  .refine((value) => value.includeLab || value.includeQuiz || value.includeAssignment, {
    message: 'Choose at least one item to generate.',
    path: ['includeLab'],
  })
  .refine(
    (value) => (!value.includeQuiz && !value.includeAssignment) || value.courseId,
    {
      message: 'Quizzes and assignments must belong to one of your courses.',
      path: ['courseId'],
    }
  );

router.post(
  '/generate',
  requireRole('admin', 'instructor'),
  validateBody(packSchema),
  asyncHandler(async (req, res) => {
    const b = req.body;

    let course = null;
    if (b.courseId) {
      const { rows } = await query('SELECT id, title, instructor_id FROM courses WHERE id = $1', [b.courseId]);
      course = rows[0];
      if (!course) throw notFound('Course not found.');
      if (req.user.role === 'instructor' && course.instructor_id !== req.user.id) {
        throw forbidden('You can only generate content for your own courses.');
      }
      if (b.lessonId) {
        const { rows: lessons } = await query('SELECT id FROM lessons WHERE id = $1 AND course_id = $2', [
          b.lessonId,
          b.courseId,
        ]);
        if (!lessons[0]) throw badRequest('Lesson does not belong to the selected course.');
      }
    }
    if (!b.labPractice && b.includeLab && b.lessonId && !course) {
      throw badRequest('Attach the lab to a course before linking a lesson.');
    }

    const labDraft = b.includeLab
      ? generateLab({
          title: b.title,
          details: b.details,
          difficulty: b.difficulty,
          stepCount: b.labStepCount,
          isPractice: b.labPractice,
        })
      : null;
    const quizDraft = b.includeQuiz
      ? generateQuiz({
          title: b.title,
          details: b.details,
          mcqCount: b.quizMcqCount,
          subjectiveCount: b.quizSubjectiveCount,
          difficulty: b.difficulty,
        })
      : null;
    const assignmentDraft = b.includeAssignment
      ? generateAssignment({
          title: b.title,
          details: b.details,
          difficulty: b.difficulty,
          points: b.assignmentPoints,
          dueInDays: b.dueInDays,
        })
      : null;

    const created = await withTransaction(async (client) => {
      const result = { labId: null, quizId: null, assignmentId: null };

      if (labDraft) {
        const slug = `${slugify(labDraft.title)}-${Math.random().toString(36).slice(2, 6)}`;
        const { rows: labRows } = await client.query(
          `INSERT INTO labs (slug, title, course_id, lesson_id, summary, description, objectives,
             submission_requirements, difficulty, estimated_minutes, terminal_welcome, initial_files,
             initial_cwd, status, created_by, is_practice)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
          [
            slug,
            labDraft.title,
            b.labPractice ? null : b.courseId ?? null,
            b.labPractice ? null : b.lessonId ?? null,
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
            b.labPractice,
          ]
        );
        result.labId = labRows[0].id;
        for (const item of labDraft.steps) {
          await client.query(
            `INSERT INTO lab_steps (lab_id, position, title, instruction, hint, verification,
               expected_command, expected_output_pattern, points, is_optional)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              result.labId,
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
          entityId: result.labId,
          metadata: { title: labDraft.title, autoGenerated: true, source: 'content_studio' },
        });
      }

      if (quizDraft) {
        const { rows: quizRows } = await client.query(
          `INSERT INTO quizzes (course_id, lesson_id, title, description, pass_score)
           VALUES ($1,$2,$3,$4,$5) RETURNING id`,
          [course.id, b.lessonId ?? null, quizDraft.title, quizDraft.description, quizDraft.passScore]
        );
        result.quizId = quizRows[0].id;
        for (let index = 0; index < quizDraft.questions.length; index += 1) {
          const question = quizDraft.questions[index];
          await client.query(
            `INSERT INTO quiz_questions (quiz_id, position, question, type, options, correct_option, explanation, points)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              result.quizId,
              index,
              question.question,
              question.type,
              JSON.stringify(question.options),
              question.correctOption,
              question.explanation ?? null,
              question.points,
            ]
          );
        }
        await recordActivity(client, {
          userId: req.user.id,
          action: 'quiz.created',
          entityType: 'quiz',
          entityId: result.quizId,
          metadata: { title: quizDraft.title, autoGenerated: true, source: 'content_studio' },
        });
      }

      if (assignmentDraft) {
        const { rows: assignmentRows } = await client.query(
          `INSERT INTO assignments (course_id, lesson_id, title, description, due_at, points, is_published)
           VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
          [
            course.id,
            b.lessonId ?? null,
            assignmentDraft.title,
            assignmentDraft.description,
            assignmentDraft.dueAt,
            assignmentDraft.points,
            b.publish,
          ]
        );
        result.assignmentId = assignmentRows[0].id;
        await recordActivity(client, {
          userId: req.user.id,
          action: 'assignment.created',
          entityType: 'assignment',
          entityId: result.assignmentId,
          metadata: { title: assignmentDraft.title, autoGenerated: true, source: 'content_studio' },
        });
      }

      return result;
    });

    if (b.publish) {
      const enrolled = course
        ? (await query(`SELECT user_id FROM enrollments WHERE course_id = $1 AND status <> 'dropped'`, [course.id])).rows
        : [];
      const userIds = enrolled.map((row) => row.user_id);

      // Practice labs are open to every learner, so they get their own audience.
      let practiceAudience = [];
      if (labDraft?.isPractice) {
        const { rows: learners } = await query(
          `SELECT id AS user_id FROM users WHERE role = 'student' AND is_active = TRUE`
        );
        practiceAudience = learners.map((row) => row.user_id);
      }

      const notifications = [];
      if (created.labId) {
        notifications.push({
          type: 'lab',
          title: `New lab: ${labDraft.title}`,
          body: labDraft.isPractice
            ? `A new practice lab "${labDraft.title}" is ready for hands-on practice.`
            : `A new hands-on lab "${labDraft.title}" is available in your course.`,
          link: `/labs/${created.labId}`,
          audience: labDraft.isPractice ? practiceAudience : userIds,
        });
      }
      if (created.quizId) {
        notifications.push({
          type: 'quiz',
          title: `New quiz: ${quizDraft.title}`,
          body: `A new quiz "${quizDraft.title}" is ready in ${course?.title || 'your course'}.`,
          link: '/student/quizzes',
          audience: userIds,
        });
      }
      if (created.assignmentId) {
        notifications.push({
          type: 'assignment',
          title: `New assignment: ${assignmentDraft.title}`,
          body: `A new assignment "${assignmentDraft.title}" was published in ${course?.title || 'your course'}.`,
          link: '/student/assignments',
          audience: userIds,
        });
      }
      for (const { audience, ...notification } of notifications) {
        if (audience.length > 0) await notify(null, { userIds: audience, ...notification });
      }
    }

    const [lab, quiz, assignment] = await Promise.all([
      created.labId ? query('SELECT * FROM labs WHERE id = $1', [created.labId]) : null,
      created.quizId ? query('SELECT * FROM quizzes WHERE id = $1', [created.quizId]) : null,
      created.assignmentId ? query('SELECT * FROM assignments WHERE id = $1', [created.assignmentId]) : null,
    ]);

    res.status(201).json({
      saved: true,
      lab: lab?.rows[0] || null,
      quiz: quiz?.rows[0] || null,
      assignment: assignment?.rows[0] || null,
      generated: {
        lab: labDraft,
        quiz: quizDraft,
        assignment: assignmentDraft,
      },
    });
  })
);

export default router;
