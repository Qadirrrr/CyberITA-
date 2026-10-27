import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../utils/errors.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, requireRole, isStaff } from '../middleware/auth.js';
import { canManageCourse } from '../services/access.js';
import { notify, recordActivity } from '../utils/activity.js';
import { generateQuiz } from '../services/quizGenerator.js';

const router = Router();

const questionSchema = z.object({
  question: z.string().trim().min(2),
  type: z.enum(['mcq', 'true_false']).default('mcq'),
  options: z.array(z.string().trim().min(1)).min(2).max(6),
  correctOption: z.coerce.number().int().min(0),
  explanation: z.string().trim().max(1000).optional().nullable(),
  points: z.coerce.number().int().min(1).max(100).default(1),
  position: z.coerce.number().int().min(0).optional(),
});

const quizSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000).default(''),
  lessonId: z.coerce.number().int().optional().nullable(),
  passScore: z.coerce.number().min(0).max(100).default(60),
  questions: z.array(questionSchema).min(1).optional(),
});

const generateQuizSchema = z.object({
  title: z.string().trim().min(2).max(200),
  mcqCount: z.coerce.number().int().min(1).max(30).default(5),
  subjectiveCount: z.coerce.number().int().min(0).max(20).default(2),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).default('intermediate'),
  courseId: z.coerce.number().int().optional().nullable(),
  lessonId: z.coerce.number().int().optional().nullable(),
  autoSave: z.boolean().default(false),
});

async function getQuizWithOwnership(quizId, user) {
  const { rows } = await query(
    `SELECT q.*, c.instructor_id, c.title AS course_title, c.slug AS course_slug
     FROM quizzes q JOIN courses c ON c.id = q.course_id WHERE q.id = $1`,
    [quizId]
  );
  const quiz = rows[0];
  if (!quiz) throw notFound('Quiz not found.');
  if (user && user.role === 'instructor' && quiz.instructor_id !== user.id) {
    throw forbidden('You can only manage your own course content.');
  }
  return quiz;
}

// ---------- student facing ----------

router.get(
  '/courses/:courseId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows: enrollment } = await query(
      `SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2`,
      [req.user.id, req.params.courseId]
    );
    const { rows: courseRows } = await query('SELECT id, instructor_id FROM courses WHERE id = $1', [
      req.params.courseId,
    ]);
    if (!courseRows[0]) throw notFound('Course not found.');
    const canManage = canManageCourse(req.user, courseRows[0]);
    if (!enrollment[0] && !canManage) {
      if (isStaff(req.user)) throw forbidden('You can only view quizzes for courses assigned to you.');
      throw badRequest('You are not enrolled in this course.');
    }
    const { rows } = await query(
      `SELECT q.id, q.title, q.description, q.lesson_id, q.pass_score,
              COUNT(qq.id)::int AS question_count,
              (SELECT COUNT(*)::int FROM quiz_questions WHERE quiz_id = q.id) AS points_total,
              (SELECT MAX(qa.score) FROM quiz_attempts qa WHERE qa.quiz_id = q.id AND qa.user_id = $1) AS best_score,
              (SELECT MAX(qa.passed::int) FROM quiz_attempts qa WHERE qa.quiz_id = q.id AND qa.user_id = $1) AS has_passed
       FROM quizzes q LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
       WHERE q.course_id = $1
       GROUP BY q.id ORDER BY q.id`,
      [req.params.courseId]
    );
    res.json({ quizzes: rows.map((q) => ({ ...q, has_passed: Boolean(q.has_passed) })) });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const quiz = await getQuizWithOwnership(req.params.id, req.user);
    const { rows: questions } = await query(
      `SELECT id, position, question, type, options, points, explanation, correct_option
       FROM quiz_questions WHERE quiz_id = $1 ORDER BY position, id`,
      [quiz.id]
    );
    const { rows: attempts } = await query(
      `SELECT id, score, max_points, passed, created_at FROM quiz_attempts
       WHERE quiz_id = $1 AND user_id = $2 ORDER BY created_at DESC`,
      [quiz.id, req.user.id]
    );
    const staffView = isStaff(req.user);
    const safeQuestions = questions.map((q) => ({
      id: q.id,
      position: q.position,
      question: q.question,
      type: q.type,
      options: q.options,
      points: q.points,
      ...(staffView ? { correctOption: q.correct_option, explanation: q.explanation } : {}),
    }));
    res.json({
      quiz: {
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        passScore: Number(quiz.pass_score),
        lessonId: quiz.lesson_id,
        courseSlug: quiz.course_slug,
      },
      questions: safeQuestions,
      attempts,
    });
  })
);

const attemptSchema = z.object({
  answers: z.array(z.object({
    questionId: z.coerce.number().int(),
    option: z.coerce.number().int().min(-1).max(10),
  })),
});

router.post(
  '/:id/attempts',
  requireAuth,
  validateBody(attemptSchema),
  asyncHandler(async (req, res) => {
    const quiz = await getQuizWithOwnership(req.params.id, null);
    const { rows: questions } = await query(
      `SELECT id, question, options, correct_option, points, explanation FROM quiz_questions
       WHERE quiz_id = $1 ORDER BY position, id`,
      [quiz.id]
    );
    if (questions.length === 0) throw badRequest('This quiz has no questions yet.');

    const answerMap = new Map(req.body.answers.map((a) => [String(a.questionId), a.option]));
    let score = 0;
    let maxPoints = 0;
    const detail = questions.map((q) => {
      const chosen = answerMap.has(String(q.id)) ? answerMap.get(String(q.id)) : -1;
      const correct = chosen === q.correct_option;
      maxPoints += q.points;
      if (correct) score += q.points;
      return {
        questionId: q.id,
        question: q.question,
        options: q.options,
        chosen,
        correctOption: q.correct_option,
        correct,
        explanation: q.explanation,
        points: q.points,
      };
    });

    const passed = maxPoints > 0 && (score / maxPoints) * 100 >= Number(quiz.pass_score);
    const { rows } = await query(
      `INSERT INTO quiz_attempts (quiz_id, user_id, score, max_points, passed, answers)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, score, max_points, passed, created_at`,
      [quiz.id, req.user.id, score, maxPoints, passed, JSON.stringify(req.body.answers)]
    );
    const attempt = rows[0];

    await withTransaction(async (client) => {
      await recordActivity(client, {
        userId: req.user.id,
        action: 'quiz.attempted',
        entityType: 'quiz',
        entityId: quiz.id,
        metadata: { title: quiz.title, score, maxPoints, passed },
      });
      await notify(client, {
        userIds: [req.user.id],
        type: 'quiz',
        title: passed ? `Quiz passed: ${quiz.title}` : `Quiz attempt saved: ${quiz.title}`,
        body: `You scored ${score}/${maxPoints}.`,
        link: `/learn/${quiz.course_slug}`,
      });
    });

    res.status(201).json({
      attempt,
      score,
      maxPoints,
      percent: maxPoints > 0 ? Math.round((score / maxPoints) * 10000) / 100 : 0,
      passed,
      passScore: Number(quiz.pass_score),
      detail,
    });
  })
);

router.get(
  '/:id/attempts',
  requireAuth,
  asyncHandler(async (req, res) => {
    await getQuizWithOwnership(req.params.id, null);
    const { rows } = await query(
      `SELECT id, score, max_points, passed, created_at FROM quiz_attempts
       WHERE quiz_id = $1 AND user_id = $2 ORDER BY created_at DESC`,
      [req.params.id, req.user.id]
    );
    res.json({ attempts: rows });
  })
);

// ---------- staff management ----------

router.post(
  '/generate',
  requireRole('admin', 'instructor'),
  validateBody(generateQuizSchema),
  asyncHandler(async (req, res) => {
    const { title, mcqCount, subjectiveCount, difficulty, courseId, lessonId, autoSave } = req.body;

    const generated = generateQuiz({
      title,
      mcqCount,
      subjectiveCount,
      difficulty,
    });

    if (autoSave && courseId) {
      const { rows: courseRows } = await query(
        `SELECT id, instructor_id, title FROM courses WHERE id = $1`, [courseId]
      );
      if (!courseRows[0]) throw notFound('Course not found.');
      if (req.user.role === 'instructor' && courseRows[0].instructor_id !== req.user.id) {
        throw forbidden('You can only manage your own courses.');
      }

      const quizId = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO quizzes (course_id, lesson_id, title, description, pass_score)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [courseRows[0].id, lessonId ?? null, generated.title, generated.description, generated.passScore]
        );
        const id = rows[0].id;
        for (let i = 0; i < generated.questions.length; i += 1) {
          const q = generated.questions[i];
          await client.query(
            `INSERT INTO quiz_questions (quiz_id, position, question, type, options, correct_option, explanation, points)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [id, i, q.question, q.type, JSON.stringify(q.options), q.correctOption, q.explanation ?? null, q.points]
          );
        }
        await recordActivity(client, {
          userId: req.user.id,
          action: 'quiz.created',
          entityType: 'quiz',
          entityId: id,
          metadata: { title: generated.title, courseTitle: courseRows[0].title, autoGenerated: true },
        });

        // Notify all enrolled learners
        const { rows: enrolled } = await client.query(
          `SELECT user_id FROM enrollments WHERE course_id = $1 AND status <> 'dropped'`,
          [courseRows[0].id]
        );
        if (enrolled.length > 0) {
          await notify(client, {
            userIds: enrolled.map((r) => r.user_id),
            type: 'quiz',
            title: `New quiz: ${generated.title}`,
            body: `A new quiz "${generated.title}" is ready for you in ${courseRows[0].title}.`,
            link: `/student/quizzes`,
          });
        }

        return id;
      });

      const savedQuiz = await getQuizWithOwnership(quizId, req.user);
      return res.status(201).json({
        quiz: savedQuiz,
        generated,
        saved: true,
      });
    }

    res.json({
      quiz: {
        title: generated.title,
        description: generated.description,
        passScore: generated.passScore,
        courseId: courseId || null,
        lessonId: lessonId || null,
        difficulty: generated.difficulty,
        counts: generated.counts,
        questions: generated.questions,
      },
      saved: false,
    });
  })
);

router.post(
  '/courses/:courseId',
  requireRole('admin', 'instructor'),
  validateBody(quizSchema),
  asyncHandler(async (req, res) => {
    const { rows: courseRows } = await query(
      `SELECT id, instructor_id, title FROM courses WHERE id = $1`, [req.params.courseId]
    );
    if (!courseRows[0]) throw notFound('Course not found.');
    if (req.user.role === 'instructor' && courseRows[0].instructor_id !== req.user.id) {
      throw forbidden('You can only manage your own courses.');
    }
    const quizId = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO quizzes (course_id, lesson_id, title, description, pass_score)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [courseRows[0].id, req.body.lessonId ?? null, req.body.title, req.body.description, req.body.passScore]
      );
      const id = rows[0].id;
      if (req.body.questions?.length) {
        for (let i = 0; i < req.body.questions.length; i += 1) {
          const q = req.body.questions[i];
          await client.query(
            `INSERT INTO quiz_questions (quiz_id, position, question, type, options, correct_option, explanation, points)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [id, q.position ?? i, q.question, q.type, JSON.stringify(q.options), q.correctOption, q.explanation ?? null, q.points]
          );
        }
      }

      await recordActivity(client, {
        userId: req.user.id,
        action: 'quiz.created',
        entityType: 'quiz',
        entityId: id,
        metadata: { title: req.body.title, courseTitle: courseRows[0].title },
      });

      // Notify all enrolled learners
      const { rows: enrolled } = await client.query(
        `SELECT user_id FROM enrollments WHERE course_id = $1 AND status <> 'dropped'`,
        [courseRows[0].id]
      );
      if (enrolled.length > 0) {
        await notify(client, {
          userIds: enrolled.map((r) => r.user_id),
          type: 'quiz',
          title: `New quiz: ${req.body.title}`,
          body: `A new quiz "${req.body.title}" is ready for you in ${courseRows[0].title}.`,
          link: `/student/quizzes`,
        });
      }

      return id;
    });
    const quiz = await getQuizWithOwnership(quizId, req.user);
    res.status(201).json({ quiz });
  })
);

router.put(
  '/:id',
  requireRole('admin', 'instructor'),
  validateBody(quizSchema.partial()),
  asyncHandler(async (req, res) => {
    const quiz = await getQuizWithOwnership(req.params.id, req.user);
    const b = req.body;
    await query(
      `UPDATE quizzes SET title = COALESCE($1, title), description = COALESCE($2, description),
         lesson_id = COALESCE($3, lesson_id), pass_score = COALESCE($4, pass_score) WHERE id = $5`,
      [b.title ?? null, b.description ?? null, b.lessonId ?? null, b.passScore ?? null, quiz.id]
    );
    if (b.questions) {
      await withTransaction(async (client) => {
        await client.query('DELETE FROM quiz_questions WHERE quiz_id = $1', [quiz.id]);
        for (let i = 0; i < b.questions.length; i += 1) {
          const q = b.questions[i];
          await client.query(
            `INSERT INTO quiz_questions (quiz_id, position, question, type, options, correct_option, explanation, points)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [quiz.id, q.position ?? i, q.question, q.type, JSON.stringify(q.options), q.correctOption, q.explanation ?? null, q.points]
          );
        }
      });
    }
    const fresh = await getQuizWithOwnership(quiz.id, req.user);
    res.json({ quiz: fresh });
  })
);

router.delete(
  '/:id',
  requireRole('admin', 'instructor'),
  asyncHandler(async (req, res) => {
    const quiz = await getQuizWithOwnership(req.params.id, req.user);
    await query('DELETE FROM quizzes WHERE id = $1', [quiz.id]);
    res.json({ ok: true });
  })
);

export default router;
