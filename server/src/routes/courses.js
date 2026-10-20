import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { asyncHandler, badRequest, conflict, notFound, forbidden } from '../utils/errors.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, requireRole, isStaff } from '../middleware/auth.js';
import { slugify, percentComplete } from '../utils/helpers.js';

const router = Router();

const LEVELS = ['beginner', 'intermediate', 'advanced'];

const courseColumns = (alias = 'c') => `${alias}.id, ${alias}.slug, ${alias}.title, ${alias}.summary,
  ${alias}.description, ${alias}.category, ${alias}.level, ${alias}.duration_hours, ${alias}.price,
  ${alias}.cover_image, ${alias}.status, ${alias}.tags, ${alias}.created_at, ${alias}.updated_at,
  ${alias}.published_at, ${alias}.instructor_id`;

const courseReturning = `id, slug, title, summary, description, category, level, duration_hours, price,
  cover_image, status, tags, created_at, updated_at, published_at, instructor_id`;

const courseCreateSchema = z.object({
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().max(400).default(''),
  description: z.string().trim().max(20000).default(''),
  category: z.string().trim().max(80).default('General'),
  level: z.enum(LEVELS).default('beginner'),
  durationHours: z.coerce.number().min(0).max(1000).default(0),
  price: z.coerce.number().min(0).max(100000).default(0),
  coverImage: z.string().trim().max(500).optional().nullable(),
  tags: z.array(z.string().trim().max(40)).max(12).default([]),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
});

const courseUpdateSchema = courseCreateSchema.partial();

const moduleSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(1000).optional().nullable(),
  position: z.coerce.number().int().min(0).optional(),
});

const lessonSchema = z.object({
  moduleId: z.coerce.number().int().optional().nullable(),
  title: z.string().trim().min(2).max(200),
  content: z.string().max(100000).default(''),
  videoUrl: z.string().trim().max(500).optional().nullable(),
  durationMinutes: z.coerce.number().int().min(0).max(2000).default(10),
  lessonType: z.enum(['reading', 'video', 'lab']).default('reading'),
  position: z.coerce.number().int().min(0).optional(),
  isFreePreview: z.boolean().default(false),
});

function uniqueSlug(base, prefix = 'course') {
  return `${slugify(base, prefix)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function getCourseOr404(courseId, { staff = false } = {}) {
  const { rows } = await query(
    `SELECT ${courseColumns()}, u.full_name AS instructor_name, u.avatar_url AS instructor_avatar,
       (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id) AS enrolled_count
     FROM courses c LEFT JOIN users u ON u.id = c.instructor_id
     WHERE c.id = $1`,
    [courseId]
  );
  const course = rows[0];
  if (!course) throw notFound('Course not found.');
  if (!staff && course.status !== 'published') throw notFound('Course not found.');
  return course;
}

async function loadCourseTree(courseId) {
  const { rows: modules } = await query(
    `SELECT id, title, description, position FROM modules WHERE course_id = $1 ORDER BY position, id`,
    [courseId]
  );
  const { rows: lessons } = await query(
    `SELECT id, module_id, title, duration_minutes, lesson_type, position, is_free_preview, video_url
     FROM lessons WHERE course_id = $1 ORDER BY position, id`,
    [courseId]
  );
  return modules.map((module) => ({
    ...module,
    lessons: lessons
      .filter((lesson) => lesson.module_id === module.id)
      .sort((a, b) => a.position - b.position || a.id - b.id),
  }));
}

// ---------- public catalog ----------

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        search: z.string().trim().max(120).optional(),
        category: z.string().trim().max(80).optional(),
        level: z.enum(LEVELS).optional(),
        status: z.enum(['draft', 'published', 'archived']).optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(60).default(12),
        sort: z.enum(['newest', 'title', 'popular']).default('newest'),
      })
      .safeParse(req.query);
    if (!parsed.success) throw badRequest('Invalid query parameters.');
    const { search, category, level, status, page, limit, sort } = parsed.data;

    const staffView = isStaff(req.user) && (status || req.query.all === 'true');
    const where = [];
    const params = [];

    if (!staffView) {
      where.push(`c.status = 'published'`);
    } else if (status) {
      params.push(status);
      where.push(`c.status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(c.title ILIKE $${params.length} OR c.summary ILIKE $${params.length} OR c.category ILIKE $${params.length})`);
    }
    if (category) {
      params.push(category);
      where.push(`c.category = $${params.length}`);
    }
    if (level) {
      params.push(level);
      where.push(`c.level = $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const orderBy =
      sort === 'title' ? 'c.title ASC' : sort === 'popular' ? 'enrolled_count DESC, c.created_at DESC' : 'c.created_at DESC';

    const { rows: countRows } = await query(
      `SELECT COUNT(*)::int AS total FROM courses c ${whereSql}`,
      params
    );
    params.push(limit, (page - 1) * limit);
    const { rows } = await query(
      `SELECT ${courseColumns()}, u.full_name AS instructor_name, u.avatar_url AS instructor_avatar,
         (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id) AS enrolled_count,
         (SELECT COUNT(*)::int FROM lessons l WHERE l.course_id = c.id) AS lesson_count
       FROM courses c LEFT JOIN users u ON u.id = c.instructor_id
       ${whereSql}
       ORDER BY ${orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ courses: rows, total: countRows[0].total, page, limit });
  })
);

router.get(
  '/meta/filters',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT DISTINCT category FROM courses WHERE status = 'published' ORDER BY category`
    );
    res.json({ categories: rows.map((row) => row.category), levels: LEVELS });
  })
);

router.get(
  '/lessons/:lessonId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT l.*, c.slug AS course_slug, c.title AS course_title, c.status AS course_status,
              c.instructor_id, m.title AS module_title
       FROM lessons l JOIN courses c ON c.id = l.course_id
       LEFT JOIN modules m ON m.id = l.module_id WHERE l.id = $1`,
      [req.params.lessonId]
    );
    const lesson = rows[0];
    if (!lesson) throw notFound('Lesson not found.');
    if (lesson.course_status !== 'published' && !isStaff(req.user)) throw notFound('Lesson not found.');

    const { rows: enrollmentRows } = await query(
      `SELECT id, status, progress_percent FROM enrollments WHERE user_id = $1 AND course_id = $2`,
      [req.user.id, lesson.course_id]
    );
    const enrollment = enrollmentRows[0] || null;
    if (!enrollment && !isStaff(req.user) && !lesson.is_free_preview) {
      throw forbidden('Enroll in this course to open this lesson.');
    }

    const tree = await loadCourseTree(lesson.course_id);
    const { rows: progressRows } = await query(
      `SELECT lesson_id, status, completed_at, time_spent_seconds FROM lesson_progress
       WHERE user_id = $1 AND course_id = $2`,
      [req.user.id, lesson.course_id]
    );
    const { rows: quizzes } = await query(
      `SELECT id, title, pass_score,
        (SELECT MAX(score) FROM quiz_attempts qa WHERE qa.quiz_id = quizzes.id AND qa.user_id = $2) AS best_score,
        (SELECT MAX(passed::int) FROM quiz_attempts qa WHERE qa.quiz_id = quizzes.id AND qa.user_id = $2) AS has_passed
       FROM quizzes WHERE lesson_id = $1 ORDER BY id`,
      [lesson.id, req.user.id]
    );
    const { rows: assignments } = await query(
      `SELECT a.id, a.title, a.points, a.due_at,
         (SELECT s.status FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.user_id = $2) AS submission_status,
         (SELECT s.grade FROM assignment_submissions s WHERE s.assignment_id = a.id AND s.user_id = $2) AS grade
       FROM assignments a WHERE a.lesson_id = $1 AND a.is_published = TRUE ORDER BY a.id`,
      [lesson.id, req.user.id]
    );
    const { rows: labs } = await query(
      `SELECT id, slug, title, difficulty, estimated_minutes
       FROM labs WHERE lesson_id = $1 AND status = 'published' ORDER BY id`,
      [lesson.id]
    );

    res.json({
      lesson,
      course: {
        id: lesson.course_id,
        slug: lesson.course_slug,
        title: lesson.course_title,
        instructor_id: lesson.instructor_id,
      },
      modules: tree,
      progress: progressRows,
      quizzes: quizzes.map((q) => ({ ...q, has_passed: Boolean(q.has_passed) })),
      assignments,
      labs,
      enrollment,
    });
  })
);

router.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT ${courseColumns()}, u.full_name AS instructor_name, u.avatar_url AS instructor_avatar,
         u.bio AS instructor_bio, u.headline AS instructor_headline,
         (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id) AS enrolled_count,
         (SELECT COUNT(*)::int FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
         (SELECT COALESCE(SUM(l.duration_minutes), 0)::int FROM lessons l WHERE l.course_id = c.id) AS total_minutes
       FROM courses c LEFT JOIN users u ON u.id = c.instructor_id
       WHERE c.slug = $1`,
      [req.params.slug]
    );
    const course = rows[0];
    if (!course) throw notFound('Course not found.');
    if (course.status !== 'published' && !isStaff(req.user)) throw notFound('Course not found.');

    const tree = await loadCourseTree(course.id);

    let enrollment = null;
    let certificate = null;
    if (req.user) {
      const { rows: enrollmentRows } = await query(
        `SELECT id, status, progress_percent, enrolled_at, completed_at
         FROM enrollments WHERE user_id = $1 AND course_id = $2`,
        [req.user.id, course.id]
      );
      enrollment = enrollmentRows[0] || null;
      const { rows: certRows } = await query(
        `SELECT id, serial, issued_at FROM certificates WHERE user_id = $1 AND course_id = $2`,
        [req.user.id, course.id]
      );
      certificate = certRows[0] || null;
    }

    const { rows: labRows } = await query(
      `SELECT id, slug, title, difficulty, estimated_minutes FROM labs
       WHERE course_id = $1 AND status = 'published' ORDER BY id`,
      [course.id]
    );
    const { rows: quizRows } = await query(
      `SELECT q.id, q.title, q.lesson_id, q.pass_score, COUNT(qq.id)::int AS question_count
       FROM quizzes q LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
       WHERE q.course_id = $1 GROUP BY q.id ORDER BY q.id`,
      [course.id]
    );

    res.json({ course, modules: tree, enrollment, certificate, labs: labRows, quizzes: quizRows });
  })
);

// ---------- staff management ----------

router.post(
  '/',
  requireRole('admin', 'instructor'),
  validateBody(courseCreateSchema),
  asyncHandler(async (req, res) => {
    const body = req.body;
    const slug = uniqueSlug(body.title);
    const { rows } = await query(
      `INSERT INTO courses (slug, title, summary, description, category, level, duration_hours,
         price, cover_image, status, tags, instructor_id, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING ${courseReturning}`,
      [
        slug, body.title, body.summary, body.description, body.category, body.level,
        body.durationHours, body.price, body.coverImage ?? null, body.status, body.tags,
        req.user.id, body.status === 'published' ? new Date() : null,
      ]
    );
    res.status(201).json({ course: rows[0] });
  })
);

router.put(
  '/:id',
  requireRole('admin', 'instructor'),
  validateBody(courseUpdateSchema),
  asyncHandler(async (req, res) => {
    const course = await getCourseOr404(req.params.id, { staff: true });
    if (req.user.role === 'instructor' && course.instructor_id !== req.user.id) {
      throw forbidden('You can only manage your own courses.');
    }
    const b = req.body;
    const { rows } = await query(
      `UPDATE courses SET
         title = COALESCE($1, title),
         summary = COALESCE($2, summary),
         description = COALESCE($3, description),
         category = COALESCE($4, category),
         level = COALESCE($5, level),
         duration_hours = COALESCE($6, duration_hours),
         price = COALESCE($7, price),
         cover_image = COALESCE($8, cover_image),
         status = COALESCE($9, status),
         tags = COALESCE($10, tags),
         published_at = COALESCE(published_at, $12)
       WHERE id = $11 RETURNING ${courseReturning}`,
      [
        b.title ?? null, b.summary ?? null, b.description ?? null, b.category ?? null,
        b.level ?? null, b.durationHours ?? null, b.price ?? null, b.coverImage ?? null,
        b.status ?? null, b.tags ?? null, course.id,
        b.status === 'published' && course.published_at == null ? new Date() : null,
      ]
    );
    res.json({ course: rows[0] });
  })
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { rowCount } = await query('DELETE FROM courses WHERE id = $1', [req.params.id]);
    if (rowCount === 0) throw notFound('Course not found.');
    res.json({ ok: true });
  })
);

router.get(
  '/:id/manage',
  requireRole('admin', 'instructor'),
  asyncHandler(async (req, res) => {
    const course = await getCourseOr404(req.params.id, { staff: true });
    if (req.user.role === 'instructor' && course.instructor_id !== req.user.id) {
      throw forbidden('You can only manage your own courses.');
    }
    const tree = await loadCourseTree(course.id);
    const { rows: quizzes } = await query(
      `SELECT q.*, COUNT(qq.id)::int AS question_count FROM quizzes q
       LEFT JOIN quiz_questions qq ON qq.quiz_id = q.id
       WHERE q.course_id = $1 GROUP BY q.id ORDER BY q.id`,
      [course.id]
    );
    const { rows: assignments } = await query(
      `SELECT a.*, (SELECT COUNT(*)::int FROM assignment_submissions s WHERE s.assignment_id = a.id) AS submission_count
       FROM assignments a WHERE a.course_id = $1 ORDER BY a.id`,
      [course.id]
    );
    const { rows: labs } = await query(
      `SELECT l.*, (SELECT COUNT(*)::int FROM lab_steps s WHERE s.lab_id = l.id) AS step_count
       FROM labs l WHERE l.course_id = $1 ORDER BY l.id`,
      [course.id]
    );
    const { rows: enrollments } = await query(
      `SELECT e.id, e.status, e.progress_percent, e.enrolled_at, e.completed_at,
              u.id AS user_id, u.full_name, u.email, u.avatar_url
       FROM enrollments e JOIN users u ON u.id = e.user_id
       WHERE e.course_id = $1 ORDER BY e.enrolled_at DESC`,
      [course.id]
    );
    res.json({ course, modules: tree, quizzes, assignments, labs, enrollments });
  })
);

// ---------- modules ----------

router.post(
  '/:id/modules',
  requireRole('admin', 'instructor'),
  validateBody(moduleSchema),
  asyncHandler(async (req, res) => {
    const course = await getCourseOr404(req.params.id, { staff: true });
    if (req.user.role === 'instructor' && course.instructor_id !== req.user.id) {
      throw forbidden('You can only manage your own courses.');
    }
    let position = req.body.position;
    if (position == null) {
      const { rows } = await query('SELECT COALESCE(MAX(position) + 1, 0) AS next FROM modules WHERE course_id = $1', [course.id]);
      position = rows[0].next;
    }
    const { rows } = await query(
      `INSERT INTO modules (course_id, title, description, position)
       VALUES ($1, $2, $3, $4) RETURNING id, title, description, position`,
      [course.id, req.body.title, req.body.description ?? null, position]
    );
    res.status(201).json({ module: rows[0] });
  })
);

router.put(
  '/modules/:moduleId',
  requireRole('admin', 'instructor'),
  validateBody(moduleSchema.partial()),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT m.*, c.instructor_id FROM modules m JOIN courses c ON c.id = m.course_id WHERE m.id = $1`,
      [req.params.moduleId]
    );
    const module = rows[0];
    if (!module) throw notFound('Module not found.');
    if (req.user.role === 'instructor' && module.instructor_id !== req.user.id) {
      throw forbidden('You can only manage your own courses.');
    }
    const { rows: updated } = await query(
      `UPDATE modules SET title = COALESCE($1, title), description = COALESCE($2, description),
         position = COALESCE($3, position)
       WHERE id = $4 RETURNING id, title, description, position`,
      [req.body.title ?? null, req.body.description ?? null, req.body.position ?? null, module.id]
    );
    res.json({ module: updated[0] });
  })
);

router.delete(
  '/modules/:moduleId',
  requireRole('admin', 'instructor'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT m.id, c.instructor_id FROM modules m JOIN courses c ON c.id = m.course_id WHERE m.id = $1`,
      [req.params.moduleId]
    );
    if (!rows[0]) throw notFound('Module not found.');
    if (req.user.role === 'instructor' && rows[0].instructor_id !== req.user.id) {
      throw forbidden('You can only manage your own courses.');
    }
    await query('DELETE FROM modules WHERE id = $1', [req.params.moduleId]);
    res.json({ ok: true });
  })
);

// ---------- lessons ----------

async function assertLessonAccess(lessonId, user) {
  const { rows } = await query(
    `SELECT l.*, c.instructor_id, c.status AS course_status FROM lessons l
     JOIN courses c ON c.id = l.course_id WHERE l.id = $1`,
    [lessonId]
  );
  const lesson = rows[0];
  if (!lesson) throw notFound('Lesson not found.');
  if (user.role === 'instructor' && lesson.instructor_id !== user.id) {
    throw forbidden('You can only manage your own courses.');
  }
  return lesson;
}

router.post(
  '/:id/lessons',
  requireRole('admin', 'instructor'),
  validateBody(lessonSchema),
  asyncHandler(async (req, res) => {
    const course = await getCourseOr404(req.params.id, { staff: true });
    if (req.user.role === 'instructor' && course.instructor_id !== req.user.id) {
      throw forbidden('You can only manage your own courses.');
    }
    if (req.body.moduleId) {
      const { rows } = await query('SELECT id FROM modules WHERE id = $1 AND course_id = $2', [req.body.moduleId, course.id]);
      if (!rows[0]) throw badRequest('Module does not belong to this course.');
    }
    let position = req.body.position;
    if (position == null) {
      const { rows } = await query('SELECT COALESCE(MAX(position) + 1, 0) AS next FROM lessons WHERE course_id = $1', [course.id]);
      position = rows[0].next;
    }
    const b = req.body;
    const { rows } = await query(
      `INSERT INTO lessons (course_id, module_id, title, content, video_url, duration_minutes,
         lesson_type, position, is_free_preview)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, course_id, module_id, title, content, video_url, duration_minutes, lesson_type, position, is_free_preview`,
      [course.id, b.moduleId ?? null, b.title, b.content, b.videoUrl ?? null, b.durationMinutes, b.lessonType, position, b.isFreePreview]
    );
    res.status(201).json({ lesson: rows[0] });
  })
);

router.put(
  '/lessons/:lessonId',
  requireRole('admin', 'instructor'),
  validateBody(lessonSchema.partial()),
  asyncHandler(async (req, res) => {
    const lesson = await assertLessonAccess(req.params.lessonId, req.user);
    const b = req.body;
    if (b.moduleId) {
      const { rows } = await query('SELECT id FROM modules WHERE id = $1 AND course_id = $2', [b.moduleId, lesson.course_id]);
      if (!rows[0]) throw badRequest('Module does not belong to this course.');
    }
    const { rows } = await query(
      `UPDATE lessons SET
         module_id = CASE WHEN $1::boolean THEN $2 ELSE module_id END,
         title = COALESCE($3, title),
         content = COALESCE($4, content),
         video_url = COALESCE($5, video_url),
         duration_minutes = COALESCE($6, duration_minutes),
         lesson_type = COALESCE($7, lesson_type),
         position = COALESCE($8, position),
         is_free_preview = COALESCE($9, is_free_preview)
       WHERE id = $10
       RETURNING id, course_id, module_id, title, content, video_url, duration_minutes, lesson_type, position, is_free_preview`,
      [
        'moduleId' in b, b.moduleId ?? null, b.title ?? null, b.content ?? null, b.videoUrl ?? null,
        b.durationMinutes ?? null, b.lessonType ?? null, b.position ?? null,
        'isFreePreview' in b ? b.isFreePreview : null, lesson.id,
      ]
    );
    res.json({ lesson: rows[0] });
  })
);

router.delete(
  '/lessons/:lessonId',
  requireRole('admin', 'instructor'),
  asyncHandler(async (req, res) => {
    await assertLessonAccess(req.params.lessonId, req.user);
    await query('DELETE FROM lessons WHERE id = $1', [req.params.lessonId]);
    res.json({ ok: true });
  })
);

export { getCourseOr404, loadCourseTree, percentComplete };
export default router;
