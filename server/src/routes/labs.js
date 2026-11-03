import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import crypto from 'node:crypto';
import { z } from 'zod';
import env from '../config/env.js';
import { query, withTransaction } from '../config/db.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, requireRole, isStaff } from '../middleware/auth.js';
import { slugify } from '../utils/helpers.js';
import logger from '../config/logger.js';
import { notify, recordActivity } from '../utils/activity.js';
import {
    getLab,
    getLabSteps,
    getLab as getLabOr404,
    getSessionOr404,
    startSession,
    stopSession,
    executeInSession,
    getSessionOverview,
    completeManualStep,
} from '../services/labService.js';
import { submitLabSession } from '../services/labSubmissions.js';
import { generateLab } from '../services/labGenerator.js';
import { getProvider } from '../labs/providers/index.js';
import {
    assertLabManager,
    assertLabReadable,
    assertSessionAccess,
    canManageLab,
} from '../services/access.js';

const router = Router();

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Submission attachments are private: they are never served by the static
// /uploads middleware, only through the authorized download endpoint.
const SUBMISSION_DIR = path.resolve(process.cwd(), 'private-uploads', 'lab-submissions');
fs.mkdirSync(SUBMISSION_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
        cb(null, `shot-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext || '.png'}`);
    },
});

const ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const upload = multer({
    storage,
    limits: { fileSize: env.upload.maxBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME.includes(file.mimetype)) {
            return cb(new Error('Only PNG, JPEG, WEBP and GIF images are allowed.'));
        }
        cb(null, true);
    },
});

const uploadMiddleware = (req, res, next) => {
    upload.single('file')(req, res, (error) => {
        if (error) return next(badRequest(error.message));
        next();
    });
};

// Evidence upload for a finished lab (screenshots or a PDF report).
const SUBMISSION_MIME = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
const submissionUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => cb(null, SUBMISSION_DIR),
        filename: (_req, file, cb) => {
            const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
            cb(null, `labsub-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext || '.bin'}`);
        },
    }),
    limits: { fileSize: env.upload.maxBytes, files: 1 },
    fileFilter: (_req, file, cb) => {
        if (!SUBMISSION_MIME.includes(file.mimetype)) {
            return cb(new Error('Attach a PNG, JPEG, WEBP screenshot or a PDF report.'));
        }
        cb(null, true);
    },
});

const submissionUploadMiddleware = (req, res, next) => {
    submissionUpload.single('file')(req, res, (error) => {
        if (error) return next(badRequest(error.message));
        next();
    });
};

const stepSchema = z.object({
    title: z.string().trim().min(2).max(200),
    instruction: z.string().trim().min(2).max(5000),
    hint: z.string().trim().max(2000).optional().nullable(),
    verification: z.enum(['command', 'output', 'manual']).default('command'),
    expectedCommand: z.string().trim().max(500).optional().nullable(),
    expectedOutputPattern: z.string().trim().max(500).optional().nullable(),
    points: z.coerce.number().int().min(0).max(1000).default(10),
    isOptional: z.boolean().default(false),
    position: z.coerce.number().int().min(0).optional(),
});

const labSchema = z.object({
    title: z.string().trim().min(3).max(200),
    courseId: z.coerce.number().int().optional().nullable(),
    lessonId: z.coerce.number().int().optional().nullable(),
    slug: z.string().trim().max(160).optional(),
    summary: z.string().trim().max(400).default(''),
    description: z.string().trim().max(20000).default(''),
    objectives: z.string().trim().max(4000).default(''),
    submissionRequirements: z.string().trim().max(4000).default(''),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
    estimatedMinutes: z.coerce.number().int().min(5).max(600).default(30),
    terminalWelcome: z.string().trim().max(2000).default('Welcome to your CyberITA+ lab environment.'),
    initialCwd: z.string().trim().max(300).default('/home/student'),
    initialFiles: z.record(z.any()).default({}),
    isPractice: z.boolean().default(false),
    dueAt: z.coerce.date().optional().nullable(),
    containerImage: z
        .string()
        .trim()
        .max(255)
        .regex(/^[A-Za-z0-9][A-Za-z0-9._/:@-]*$/, 'Use a valid Docker image reference.')
        .optional()
        .nullable(),
    networkEnabled: z.boolean().optional(),
    status: z.enum(['draft', 'published']).default('draft'),
});

async function assertLabParticipation(lab, user) {
    // Practice labs are open to every learner; course labs require enrollment.
    if (lab.is_practice || isStaff(user) || !lab.course_id) return;
    const { rows } = await query(
        `SELECT id FROM enrollments WHERE user_id = $1 AND course_id = $2 AND status <> 'dropped'`, [user.id, lab.course_id]
    );
    if (!rows[0]) throw badRequest('Enroll in the course before using its labs.');
}

// ---------- status ----------

router.get(
    '/status',
    asyncHandler(async(_req, res) => {
        const provider = getProvider();
        const availability = await provider.isAvailable();
        res.json({
            provider: provider.name,
            available: availability.ok,
            reason: availability.reason || null,
            practice: {
                // Practice terminals are in-process, so they are always available
                // even when the Docker engine is down.
                provider: 'practice',
                available: true,
                reason: 'In-browser practice terminal (no container required).',
            },
            sessionTtlMinutes: env.labs.sessionTtlMinutes,
        });
    })
);

// ---------- catalog (students + staff) ----------

router.get(
        '/',
        asyncHandler(async(req, res) => {
                const parsed = z
                    .object({
                        courseId: z.coerce.number().int().optional(),
                        status: z.enum(['draft', 'published']).optional(),
                        search: z.string().trim().max(120).optional(),
                        mine: z.enum(['true', 'false']).optional(),
                        page: z.coerce.number().int().min(1).default(1),
                        limit: z.coerce.number().int().min(1).max(60).default(24),
                    })
                    .safeParse(req.query);
                if (!parsed.success) throw badRequest('Invalid query parameters.');
                const { courseId, status, search, mine, page, limit } = parsed.data;

                const where = [];
                const params = [];
                const staffView = isStaff(req.user);
                if (!staffView) where.push(`l.status = 'published'`);
                else if (status) {
                    params.push(status);
                    where.push(`l.status = $${params.length}`);
                }
                // Instructors only see other people's published labs; drafts stay private
                // to the instructor who owns the course or created the lab.
                if (staffView && req.user.role === 'instructor') {
                    params.push(req.user.id);
                    where.push(
                        `(l.status = 'published' OR l.created_by = $${params.length} OR c.instructor_id = $${params.length})`
                    );
                }
                if (courseId) {
                    params.push(courseId);
                    where.push(`l.course_id = $${params.length}`);
                }
                if (search) {
                    params.push(`%${search}%`);
                    where.push(`(l.title ILIKE $${params.length} OR l.summary ILIKE $${params.length})`);
                }
                if (mine === 'true' && req.user) {
                    params.push(req.user.id);
                    where.push(`EXISTS (SELECT 1 FROM lab_sessions s WHERE s.lab_id = l.id AND s.user_id = $${params.length})`);
                }

                const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
                const { rows: countRows } = await query(
                    `SELECT COUNT(*)::int AS total FROM labs l LEFT JOIN courses c ON c.id = l.course_id ${whereSql}`,
                    params
                );
                const offset = (page - 1) * limit;
                const paginatedParams = [...params, limit, offset];
                const { rows } = await query(
                        `SELECT l.id, l.slug, l.title, l.summary, l.difficulty, l.estimated_minutes, l.status,
         l.is_practice, l.course_id, l.lesson_id, l.due_at, c.title AS course_title, c.slug AS course_slug,
         l.lab_server_id, srv.name AS lab_server_name,
         (SELECT COUNT(*)::int FROM lab_steps s WHERE s.lab_id = l.id) AS step_count,
         (SELECT COUNT(*)::int FROM lab_sessions s WHERE s.lab_id = l.id) AS session_count,
         ${req.user ? `(SELECT MAX(s.status) FROM lab_sessions s WHERE s.lab_id = l.id AND s.user_id = ${Number(req.user.id)}) AS my_status,` : ''}
         (SELECT s.started_at FROM lab_sessions s WHERE s.lab_id = l.id ${req.user ? `AND s.user_id = ${Number(req.user.id)}` : ''} ORDER BY s.id DESC LIMIT 1) AS last_started_at
       FROM labs l LEFT JOIN courses c ON c.id = l.course_id
       LEFT JOIN lab_servers srv ON srv.id = l.lab_server_id
       ${whereSql}
       ORDER BY l.updated_at DESC
       LIMIT $${paginatedParams.length - 1} OFFSET $${paginatedParams.length}`,
      paginatedParams
    );
    res.json({ labs: rows, total: countRows[0].total, page, limit });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const staffView = isStaff(req.user);
    const lab = await getLabOr404(req.params.id, { staff: staffView });
    await assertLabReadable(req.user, lab);
    const canManage = await canManageLab(req.user, lab);
    const steps = await getLabSteps(lab.id, { includeAnswers: canManage });
    const { rows: courseRows } = await query(
      `SELECT id, title, slug FROM courses WHERE id = $1`, [lab.course_id]
    );
    let sessions = [];
    let mySession = null;
    if (req.user) {
      const { rows } = await query(
        `SELECT id, status, started_at, ended_at, last_activity_at, expires_at, provider, instance_id
         FROM lab_sessions WHERE lab_id = $1 AND user_id = $2 ORDER BY id DESC`,
        [lab.id, req.user.id]
      );
      sessions = rows;
      mySession = rows.find((s) => s.status === 'running') || rows[0] || null;
    }
    const { rows: stepCounts } = await query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_optional = FALSE)::int AS required
       FROM lab_steps WHERE lab_id = $1`,
      [lab.id]
    );
    res.json({
      lab,
      course: courseRows[0] || null,
      steps,
      sessions,
      mySession,
      stepCounts: stepCounts[0],
    });
  })
);

// ---------- student session lifecycle ----------

router.post(
  '/:id/sessions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const lab = await getLabOr404(req.params.id, { staff: isStaff(req.user) });
    await assertLabReadable(req.user, lab);
    await assertLabParticipation(lab, req.user);
    const stepCount = await query('SELECT COUNT(*)::int AS n FROM lab_steps WHERE lab_id = $1', [lab.id]);
    if (stepCount.rows[0].n === 0) throw badRequest('This lab has no steps configured yet.');

    const { session, reused } = await startSession(req.user, lab);
    const overview = await getSessionOverview(session, { includeAnswers: false });
    res.status(reused ? 200 : 201).json({ ...overview, reused });
  })
);

router.get(
  '/sessions/:sessionId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const session = await getSessionOr404(req.params.sessionId, req.user);
    const lab = await getLab(session.lab_id, { staff: true });
    const includeAnswers = await canManageLab(req.user, lab);
    const overview = await getSessionOverview(session, { includeAnswers });
    res.json({
      ...overview,
      lab: {
        id: lab.id,
        title: lab.title,
        terminal_welcome: lab.terminal_welcome,
        submission_requirements: lab.submission_requirements || '',
        is_practice: Boolean(lab.is_practice),
        course_id: lab.course_id,
        due_at: lab.due_at,
      },
    });
  })
);

const execSchema = z.object({
  command: z.string().trim().min(1, 'Command cannot be empty.').max(1000),
});

router.post(
  '/sessions/:sessionId/exec',
  requireAuth,
  validateBody(execSchema),
  asyncHandler(async (req, res) => {
    const session = await getSessionOr404(req.params.sessionId, req.user);
    if (session.user_id !== req.user.id) throw forbidden('Only the session owner can use its terminal.');
    const lab = await getLab(session.lab_id, { staff: true });
    const result = await executeInSession(session, lab, req.body.command);
    res.json({
      output: result.output,
      exitCode: result.exitCode,
      cwd: result.cwd,
      clear: result.clear,
      completedSteps: result.completedSteps,
      completion: result.completion,
    });
  })
);

router.post(
  '/sessions/:sessionId/stop',
  requireAuth,
  asyncHandler(async (req, res) => {
    const session = await getSessionOr404(req.params.sessionId, req.user);
    if (session.user_id !== req.user.id) throw forbidden('Only the session owner can stop it.');
    const stopped = await stopSession(session, req.user);
    res.json({ session: { id: stopped.id, status: stopped.status, ended_at: stopped.ended_at } });
  })
);

router.post(
  '/sessions/:sessionId/steps/:stepId/complete',
  requireAuth,
  validateBody(z.object({ note: z.string().trim().max(1000).optional() })),
  asyncHandler(async (req, res) => {
    const session = await getSessionOr404(req.params.sessionId, req.user);
    if (session.user_id !== req.user.id) throw forbidden('Only the session owner can complete steps.');
    const { rows } = await query(
      `SELECT * FROM lab_steps WHERE id = $1 AND lab_id = $2`,
      [req.params.stepId, session.lab_id]
    );
    const step = rows[0];
    if (!step) throw notFound('Step not found.');
    const result = await completeManualStep(session, step, req.user);
    res.json(result);
  })
);

// ---------- screenshots ----------

router.post(
  '/sessions/:sessionId/screenshots',
  requireAuth,
  uploadMiddleware,
  asyncHandler(async (req, res) => {
    const session = await getSessionOr404(req.params.sessionId, req.user);
    if (session.user_id !== req.user.id) throw forbidden('Only the session owner can upload screenshots.');
    if (!req.file) throw badRequest('No image file received (field name: "file").');

    let stepId = null;
    if (req.body.stepId) {
      const { rows } = await query(`SELECT id FROM lab_steps WHERE id = $1 AND lab_id = $2`, [req.body.stepId, session.lab_id]);
      if (!rows[0]) {
        fs.unlink(req.file.path, () => {});
        throw badRequest('Unknown step for this lab.');
      }
      stepId = rows[0].id;
    }

    const { rows } = await query(
      `INSERT INTO screenshots (session_id, user_id, step_id, file_path, original_name, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, step_id, original_name, file_path, mime_type, size_bytes, created_at`,
      [session.id, req.user.id, stepId, `/uploads/${req.file.filename}`, req.file.originalname, req.file.mimetype, req.file.size]
    );
    await withTransaction((client) =>
      recordActivity(client, {
        userId: req.user.id,
        action: 'lab.screenshot_uploaded',
        entityType: 'lab_session',
        entityId: session.id,
        metadata: { name: req.file.originalname },
      })
    );
    res.status(201).json({ screenshot: rows[0] });
  })
);

router.post(
  '/sessions/:sessionId/submit',
  requireAuth,
  submissionUploadMiddleware,
  asyncHandler(async (req, res) => {
    const session = await getSessionOr404(req.params.sessionId, req.user);
    if (session.user_id !== req.user.id) throw forbidden('Only the session owner can submit this lab.');

    const parsed = z.object({ note: z.string().trim().max(4000).optional().default('') }).safeParse({
      note: typeof req.body?.note === 'string' ? req.body.note : '',
    });
    if (!parsed.success) {
      if (req.file) fs.unlink(req.file.path, () => {});
      throw badRequest('The submission note is too long.');
    }

    const lab = await getLab(session.lab_id, { staff: true });
    await assertLabParticipation(lab, req.user);

    try {
      const submission = await submitLabSession({
        session,
        lab,
        user: req.user,
        note: parsed.data.note,
        file: req.file
          ? {
              path: `/private-uploads/lab-submissions/${req.file.filename}`,
              name: req.file.originalname,
              mime: req.file.mimetype,
              size: req.file.size,
            }
          : null,
      });

      // Automatically clean up container after lab completion/submission while preserving evidence
      await stopSession(session, req.user).catch((cleanupErr) => {
        logger.warn('Failed to stop lab session after submission', {
          sessionId: session.id,
          error: cleanupErr.message,
        });
      });

      res.status(201).json({ submission });
    } catch (error) {
      if (req.file) fs.unlink(req.file.path, () => {});
      throw error;
    }
  })
);

router.delete(
  '/screenshots/:screenshotId',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT s.*, ls.user_id AS owner_id, l.course_id, l.created_by
       FROM screenshots s
       JOIN lab_sessions ls ON ls.id = s.session_id
       JOIN labs l ON l.id = ls.lab_id
       WHERE s.id = $1`,
      [req.params.screenshotId]
    );
    const screenshot = rows[0];
    if (!screenshot) throw notFound('Screenshot not found.');
    await assertSessionAccess(req.user, {
      user_id: screenshot.owner_id,
      course_id: screenshot.course_id,
      created_by: screenshot.created_by,
    });
    await query('DELETE FROM screenshots WHERE id = $1', [screenshot.id]);
    const filePath = path.join(UPLOAD_DIR, path.basename(screenshot.file_path));
    fs.unlink(filePath, () => {});
    res.json({ ok: true });
  })
);

// ---------- staff: lab management ----------

const generateLabSchema = z.object({
  title: z.string().trim().min(3, 'Give the lab a title with at least 3 characters.').max(200),
  details: z.string().trim().max(4000).default(''),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
  stepCount: z.coerce.number().int().min(3).max(12).default(8),
  isPractice: z.boolean().default(false),
  courseId: z.coerce.number().int().optional().nullable(),
  lessonId: z.coerce.number().int().optional().nullable(),
  status: z.enum(['draft', 'published']).default('draft'),
  autoSave: z.boolean().default(true),
});

router.post(
  '/generate',
  requireRole('admin', 'instructor'),
  validateBody(generateLabSchema),
  asyncHandler(async (req, res) => {
    const b = req.body;
    // Practice labs are open to every learner, so they never belong to a course.
    const labCourseId = b.isPractice ? null : b.courseId ?? null;
    const labLessonId = b.isPractice ? null : b.lessonId ?? null;

    if (labCourseId) {
      const { rows } = await query('SELECT id, instructor_id, title FROM courses WHERE id = $1', [labCourseId]);
      if (!rows[0]) throw badRequest('Course not found.');
      if (req.user.role === 'instructor' && rows[0].instructor_id !== req.user.id) {
        throw forbidden('You can only attach labs to your own courses.');
      }
    }
    if (labLessonId) {
      const { rows } = await query('SELECT id FROM lessons WHERE id = $1 AND course_id = $2', [
        labLessonId,
        labCourseId,
      ]);
      if (!rows[0]) throw badRequest('Lesson does not belong to the selected course.');
    }

    const generated = generateLab({
      title: b.title,
      details: b.details,
      difficulty: b.difficulty,
      stepCount: b.stepCount,
      isPractice: b.isPractice,
    });

    if (!b.autoSave) {
      return res.json({ saved: false, generated });
    }

    const slug = `${slugify(generated.title)}-${Math.random().toString(36).slice(2, 6)}`;
    const { rows: dup } = await query('SELECT id FROM labs WHERE slug = $1', [slug]);
    if (dup[0]) throw conflict('A lab with this slug already exists. Try a slightly different title.');

    const labId = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO labs (slug, title, course_id, lesson_id, summary, description, objectives,
           submission_requirements, difficulty, estimated_minutes, terminal_welcome, initial_files,
           initial_cwd, status, created_by, is_practice)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
        [
          slug,
          generated.title,
          labCourseId,
          labLessonId,
          generated.summary,
          generated.description,
          generated.objectives,
          generated.submissionRequirements,
          generated.difficulty,
          generated.estimatedMinutes,
          generated.terminalWelcome,
          JSON.stringify(generated.initialFiles || {}),
          generated.initialCwd,
          b.status,
          req.user.id,
          b.isPractice,
        ]
      );
      const id = rows[0].id;
      for (const item of generated.steps) {
        await client.query(
          `INSERT INTO lab_steps (lab_id, position, title, instruction, hint, verification,
             expected_command, expected_output_pattern, points, is_optional)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            id,
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
        entityId: id,
        metadata: { title: generated.title, autoGenerated: true, practice: Boolean(b.isPractice) },
      });
      return id;
    });

    if (b.status === 'published' && b.isPractice) {
      const { rows: learners } = await query(
        `SELECT id AS user_id FROM users WHERE role = 'student' AND is_active = TRUE`
      );
      if (learners.length > 0) {
        await notify(null, {
          userIds: learners.map((row) => row.user_id),
          type: 'lab',
          title: `New practice lab: ${generated.title}`,
          body: `A new practice lab "${generated.title}" is ready for hands-on practice.`,
          link: `/labs/${labId}`,
        });
      }
    } else if (b.status === 'published' && labCourseId) {
      const { rows: enrolled } = await query(
        `SELECT user_id FROM enrollments WHERE course_id = $1 AND status <> 'dropped'`,
        [labCourseId]
      );
      if (enrolled.length > 0) {
        await notify(null, {
          userIds: enrolled.map((row) => row.user_id),
          type: 'lab',
          title: `New lab: ${generated.title}`,
          body: `A new hands-on lab "${generated.title}" is available in your course.`,
          link: `/labs/${labId}`,
        });
      }
    }

    const lab = await getLab(labId, { staff: true });
    const steps = await getLabSteps(labId, { includeAnswers: true });
    res.status(201).json({ saved: true, lab, steps, generated });
  })
);

router.post(
  '/',
  requireRole('admin', 'instructor'),
  validateBody(labSchema),
  asyncHandler(async (req, res) => {
    const b = req.body;
    // Practice labs are open to every learner, so they never belong to a course.
    const labCourseId = b.isPractice ? null : b.courseId ?? null;
    const labLessonId = b.isPractice ? null : b.lessonId ?? null;
    if (labCourseId) {
      const { rows } = await query('SELECT id, instructor_id FROM courses WHERE id = $1', [labCourseId]);
      if (!rows[0]) throw badRequest('Course not found.');
      if (req.user.role === 'instructor' && rows[0].instructor_id !== req.user.id) {
        throw forbidden('You can only attach labs to your own courses.');
      }
    }
    if (labLessonId) {
      const { rows } = await query('SELECT id FROM lessons WHERE id = $1 AND course_id = $2', [
        labLessonId,
        labCourseId,
      ]);
      if (!rows[0]) throw badRequest('Lesson does not belong to the selected course.');
    }
    const slug = b.slug ? slugify(b.slug) : `${slugify(b.title)}-${Math.random().toString(36).slice(2, 6)}`;
    const { rows: dup } = await query('SELECT id FROM labs WHERE slug = $1', [slug]);
    if (dup[0]) throw conflict('A lab with this slug already exists.');

    const { rows } = await query(
      `INSERT INTO labs (slug, title, course_id, lesson_id, summary, description, objectives,
         submission_requirements, difficulty, estimated_minutes, terminal_welcome, initial_files,
         initial_cwd, container_image, network_enabled, status, created_by, is_practice, due_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [slug, b.title, labCourseId, labLessonId, b.summary, b.description,
       b.objectives, b.submissionRequirements, b.difficulty, b.estimatedMinutes, b.terminalWelcome,
       JSON.stringify(b.initialFiles), b.initialCwd, b.containerImage || null,
       'networkEnabled' in b ? Boolean(b.networkEnabled) : true, b.status, req.user.id, b.isPractice,
       labCourseId ? b.dueAt ?? null : null]
    );
    res.status(201).json({ lab: rows[0] });
  })
);

router.put(
  '/:id',
  requireRole('admin', 'instructor'),
  validateBody(labSchema.partial()),
  asyncHandler(async (req, res) => {
    const lab = await getLab(req.params.id, { staff: true });
    await assertLabManager(req.user, lab);
    const b = req.body;
    const nextIsPractice = 'isPractice' in b ? Boolean(b.isPractice) : Boolean(lab.is_practice);
    // Practice labs are open to every learner, so they never belong to a course.
    const nextCourseId = nextIsPractice ? null : 'courseId' in b ? b.courseId ?? null : lab.course_id;
    const nextLessonId = nextIsPractice ? null : 'lessonId' in b ? b.lessonId ?? null : lab.lesson_id;
    const setCourse = nextIsPractice || 'courseId' in b;
    const setLesson = nextIsPractice || 'lessonId' in b;
    if (setCourse && nextCourseId) {
      const { rows: courseRows } = await query('SELECT id, instructor_id FROM courses WHERE id = $1', [nextCourseId]);
      if (!courseRows[0]) throw badRequest('Course not found.');
      if (req.user.role === 'instructor' && courseRows[0].instructor_id !== req.user.id) {
        throw forbidden('You can only attach labs to your own courses.');
      }
    }
    if (nextLessonId) {
      const { rows: lessonRows } = await query('SELECT id FROM lessons WHERE id = $1 AND course_id = $2', [
        nextLessonId,
        nextCourseId,
      ]);
      if (!lessonRows[0]) throw badRequest('Lesson does not belong to the selected course.');
    }
    const { rows } = await query(
      `UPDATE labs SET
         title = COALESCE($1, title),
         summary = COALESCE($2, summary),
         description = COALESCE($3, description),
         difficulty = COALESCE($4, difficulty),
         estimated_minutes = COALESCE($5, estimated_minutes),
         terminal_welcome = COALESCE($6, terminal_welcome),
         initial_cwd = COALESCE($7, initial_cwd),
         initial_files = COALESCE($8::jsonb, initial_files),
         status = COALESCE($9, status),
         course_id = CASE WHEN $10::boolean THEN $11::bigint ELSE course_id END,
         lesson_id = CASE WHEN $12::boolean THEN $13::bigint ELSE lesson_id END,
         container_image = CASE WHEN $14::boolean THEN $15::varchar ELSE container_image END,
         network_enabled = COALESCE($16, network_enabled),
         objectives = COALESCE($18, objectives),
         submission_requirements = COALESCE($19, submission_requirements),
         is_practice = COALESCE($20, is_practice),
         due_at = CASE WHEN $21::boolean THEN $22::timestamptz ELSE due_at END
       WHERE id = $17 RETURNING *`,
      [
        b.title ?? null, b.summary ?? null, b.description ?? null, b.difficulty ?? null,
        b.estimatedMinutes ?? null, b.terminalWelcome ?? null, b.initialCwd ?? null,
        b.initialFiles ? JSON.stringify(b.initialFiles) : null, b.status ?? null,
        setCourse, nextCourseId, setLesson, nextLessonId,
        'containerImage' in b, b.containerImage || null, 'networkEnabled' in b ? b.networkEnabled : null,
        lab.id, b.objectives ?? null, b.submissionRequirements ?? null,
        'isPractice' in b ? b.isPractice : null,
        'dueAt' in b, nextIsPractice ? null : b.dueAt ?? null,
      ]
    );
    res.json({ lab: rows[0] });
  })
);

router.delete(
  '/:id',
  requireRole('admin', 'instructor'),
  asyncHandler(async (req, res) => {
    const lab = await getLab(req.params.id, { staff: true });
    await assertLabManager(req.user, lab);
    await query('DELETE FROM labs WHERE id = $1', [lab.id]);
    res.json({ ok: true });
  })
);

router.get(
  '/:id/manage',
  requireRole('admin', 'instructor'),
  asyncHandler(async (req, res) => {
    const lab = await getLab(req.params.id, { staff: true });
    await assertLabManager(req.user, lab);
    const steps = await getLabSteps(lab.id, { includeAnswers: true });
    const { rows: serverRows } = lab.lab_server_id
      ? await query('SELECT name, location, status FROM lab_servers WHERE id = $1', [lab.lab_server_id])
      : { rows: [] };
    const { rows: stats } = await query(
      `SELECT COUNT(*)::int AS sessions,
         COUNT(DISTINCT user_id)::int AS learners,
         (SELECT COUNT(*)::int FROM lab_step_progress p JOIN lab_sessions s2 ON s2.id = p.session_id WHERE s2.lab_id = $1) AS steps_completed
       FROM lab_sessions WHERE lab_id = $1`,
      [lab.id]
    );
    res.json({
      lab: {
        ...lab,
        lab_server_name: serverRows[0]?.name || null,
        lab_server_location: serverRows[0]?.location || null,
        lab_server_status: serverRows[0]?.status || null,
      },
      steps,
      stats: stats[0],
    });
  })
);

router.post(
  '/:id/steps',
  requireRole('admin', 'instructor'),
  validateBody(stepSchema),
  asyncHandler(async (req, res) => {
    const lab = await getLab(req.params.id, { staff: true });
    await assertLabManager(req.user, lab);
    const b = req.body;
    let position = b.position;
    if (position == null) {
      const { rows } = await query('SELECT COALESCE(MAX(position) + 1, 0) AS next FROM lab_steps WHERE lab_id = $1', [lab.id]);
      position = rows[0].next;
    }
    const { rows } = await query(
      `INSERT INTO lab_steps (lab_id, position, title, instruction, hint, verification,
         expected_command, expected_output_pattern, points, is_optional)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [lab.id, position, b.title, b.instruction, b.hint ?? null, b.verification,
       b.expectedCommand ?? null, b.expectedOutputPattern ?? null, b.points, b.isOptional]
    );
    res.status(201).json({ step: rows[0] });
  })
);

router.put(
  '/steps/:stepId',
  requireRole('admin', 'instructor'),
  validateBody(stepSchema.partial()),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT s.*, l.created_by, l.course_id FROM lab_steps s
       JOIN labs l ON l.id = s.lab_id WHERE s.id = $1`,
      [req.params.stepId]
    );
    const step = rows[0];
    if (!step) throw notFound('Step not found.');
    await assertLabManager(req.user, { course_id: step.course_id, created_by: step.created_by });
    const b = req.body;
    const { rows: updated } = await query(
      `UPDATE lab_steps SET
         title = COALESCE($1, title),
         instruction = COALESCE($2, instruction),
         hint = COALESCE($3, hint),
         verification = COALESCE($4, verification),
         expected_command = COALESCE($5, expected_command),
         expected_output_pattern = COALESCE($6, expected_output_pattern),
         points = COALESCE($7, points),
         is_optional = COALESCE($8, is_optional),
         position = COALESCE($9, position)
       WHERE id = $10 RETURNING *`,
      [b.title ?? null, b.instruction ?? null, b.hint ?? null, b.verification ?? null,
       b.expectedCommand ?? null, b.expectedOutputPattern ?? null, b.points ?? null,
       'isOptional' in b ? b.isOptional : null, b.position ?? null, step.id]
    );
    res.json({ step: updated[0] });
  })
);

router.delete(
  '/steps/:stepId',
  requireRole('admin', 'instructor'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT s.*, l.created_by, l.course_id FROM lab_steps s
       JOIN labs l ON l.id = s.lab_id WHERE s.id = $1`,
      [req.params.stepId]
    );
    const step = rows[0];
    if (!step) throw notFound('Step not found.');
    await assertLabManager(req.user, { course_id: step.course_id, created_by: step.created_by });
    await query('DELETE FROM lab_steps WHERE id = $1', [step.id]);
    res.json({ ok: true });
  })
);

export { getLabOr404 as getLabForRoutes };
export default router;