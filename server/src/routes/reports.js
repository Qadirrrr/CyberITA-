import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../utils/errors.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, requireRole, isStaff } from '../middleware/auth.js';
import { getSessionOr404 } from '../services/labService.js';
import { notify, recordActivity } from '../utils/activity.js';
import { slugify } from '../utils/helpers.js';

const router = Router();

const sectionSchema = z.object({
  stepId: z.coerce.number().int().nullable().optional(),
  title: z.string().trim().min(1).max(200),
  instruction: z.string().trim().max(5000).default(''),
  command: z.string().trim().max(1000).default(''),
  output: z.string().trim().max(10000).default(''),
  result: z.string().trim().max(2000).default(''),
  screenshots: z.array(z.string()).default([]),
  notes: z.string().trim().max(4000).default(''),
});

const reportPatchSchema = z.object({
  title: z.string().trim().min(3).max(220).optional(),
  summary: z.string().trim().max(4000).optional(),
  content: z.string().trim().max(100000).optional(),
  sections: z.array(sectionSchema).max(60).optional(),
});

function buildMarkdown({ title, summary, sections, lab, course, studentName, generatedAt }) {
  const lines = [];
  lines.push(`# ${title}`, '');
  if (summary) lines.push(`> ${summary}`, '');
  lines.push(
    `**Lab:** ${lab.title}  `,
    `**Course:** ${course?.title || 'Independent lab'}  `,
    `**Prepared by:** ${studentName}  `,
    `**Date:** ${new Date(generatedAt).toISOString().slice(0, 10)}`,
    '',
    '---',
    ''
  );
  sections.forEach((section, index) => {
    lines.push(`## ${index + 1}. ${section.title}`, '');
    if (section.instruction) lines.push(`${section.instruction}`, '');
    if (section.command) lines.push('```bash', section.command, '```', '');
    if (section.output) lines.push('**Output:**', '', '```', section.output.slice(0, 4000), '```', '');
    if (section.result) lines.push(`**Result:** ${section.result}`, '');
    if (section.notes) lines.push(`**Notes:** ${section.notes}`, '');
    if (section.screenshots?.length) {
      lines.push('**Screenshots:**', '');
      section.screenshots.forEach((shot) => lines.push(`![screenshot](${shot})`));
      lines.push('');
    }
    lines.push('---', '');
  });
  return lines.join('\n');
}

async function getReport(reportId, user) {
  const { rows } = await query(
    `SELECT r.*, l.title AS lab_title, l.difficulty, l.estimated_minutes,
       u.full_name AS author_name, u.email AS author_email,
       c.title AS course_title, c.slug AS course_slug,
       p.slug AS published_slug
     FROM reports r
     JOIN labs l ON l.id = r.lab_id
     JOIN users u ON u.id = r.user_id
     LEFT JOIN courses c ON c.id = l.course_id
     LEFT JOIN posts p ON p.id = r.published_post_id
     WHERE r.id = $1`,
    [reportId]
  );
  const report = rows[0];
  if (!report) throw notFound('Report not found.');
  const isOwner = report.user_id === user.id;
  const staff = isStaff(user);
  if (!isOwner && !staff) throw forbidden('You do not have access to this report.');
  return report;
}

/** Builds report sections from the completed steps of a lab session. */
async function generateFromSession(session, user) {
  const { rows: labRows } = await query(
    `SELECT l.*, c.title AS course_title FROM labs l LEFT JOIN courses c ON c.id = l.course_id WHERE l.id = $1`,
    [session.lab_id]
  );
  const lab = labRows[0];
  const { rows: steps } = await query(
    `SELECT s.id, s.title, s.instruction, s.position FROM lab_steps s
     WHERE s.lab_id = $1 ORDER BY s.position, s.id`,
    [session.lab_id]
  );
  const { rows: progress } = await query(
    `SELECT * FROM lab_step_progress WHERE session_id = $1`, [session.id]
  );
  const { rows: shots } = await query(
    `SELECT id, step_id, file_path, created_at FROM screenshots WHERE session_id = $1 ORDER BY created_at`,
    [session.id]
  );
  const progressByStep = new Map(progress.map((p) => [p.step_id, p]));
  const shotsByStep = new Map();
  for (const shot of shots) {
    const key = shot.step_id ?? 0;
    if (!shotsByStep.has(key)) shotsByStep.set(key, []);
    shotsByStep.get(key).push(shot.file_path);
  }

  const sections = steps
    .map((step) => {
      const p = progressByStep.get(step.id);
      return {
        stepId: step.id,
        title: step.title,
        instruction: step.instruction,
        command: p?.command_used || '',
        output: (p?.output_excerpt || '').slice(0, 4000),
        result: p ? 'Completed and verified.' : 'Not completed.',
        screenshots: [
          ...(shotsByStep.get(step.id) || []),
          ...(shotsByStep.get(0) || []),
        ],
        notes: '',
      };
    })
    .filter((s) => s.command || s.output || s.screenshots.length > 0 || s.result === 'Completed and verified.');

  const title = `Practical Report: ${lab.title}`;
  const summary = sections.length
    ? `Hands-on lab report covering ${sections.length} verified step(s) in ${lab.title}.`
    : 'Draft report — complete lab steps to populate this report automatically.';
  const content = buildMarkdown({
    title,
    summary,
    sections,
    lab,
    course: { title: lab.course_title },
    studentName: user.full_name,
    generatedAt: new Date(),
  });

  return { title, summary, sections, content, lab };
}

// ---------- student ----------

router.post(
  '/sessions/:sessionId/generate',
  requireAuth,
  asyncHandler(async (req, res) => {
    const session = await getSessionOr404(req.params.sessionId, req.user);
    if (session.user_id !== req.user.id) throw forbidden('Only the session owner can generate its report.');
    const { rows: existing } = await query('SELECT id, status FROM reports WHERE session_id = $1', [session.id]);
    if (existing[0]) throw badRequest('A report already exists for this lab session.');

    const generated = await generateFromSession(session, req.user);
    const { rows } = await query(
      `INSERT INTO reports (session_id, lab_id, user_id, title, summary, content, sections, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft') RETURNING id`,
      [session.id, session.lab_id, req.user.id, generated.title, generated.summary, generated.content, JSON.stringify(generated.sections)]
    );
    await withTransaction((client) =>
      recordActivity(client, {
        userId: req.user.id,
        action: 'report.generated',
        entityType: 'report',
        entityId: rows[0].id,
        metadata: { title: generated.title, steps: generated.sections.length },
      })
    );
    const report = await getReport(rows[0].id, req.user);
    res.status(201).json({ report });
  })
);

router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT r.id, r.title, r.status, r.created_at, r.updated_at, r.reviewed_at, r.instructor_feedback,
         l.title AS lab_title, l.difficulty, c.title AS course_title,
         p.slug AS published_slug,
         (SELECT COUNT(*)::int FROM screenshots s JOIN lab_sessions ls ON ls.id = s.session_id WHERE ls.id = r.session_id) AS screenshot_count
       FROM reports r
       JOIN labs l ON l.id = r.lab_id
       LEFT JOIN courses c ON c.id = l.course_id
       LEFT JOIN posts p ON p.id = r.published_post_id
       WHERE r.user_id = $1 ORDER BY r.updated_at DESC`,
      [req.user.id]
    );
    res.json({ reports: rows });
  })
);

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const report = await getReport(req.params.id, req.user);
    const { rows: screenshots } = await query(
      `SELECT id, step_id, original_name, file_path, created_at
       FROM screenshots WHERE session_id = $1 ORDER BY created_at`,
      [report.session_id]
    );
    const { rows: steps } = await query(
      `SELECT s.position, s.title, s.verification, p.completed_at, p.command_used
       FROM lab_step_progress p JOIN lab_steps s ON s.id = p.step_id
       WHERE p.session_id = $1 ORDER BY s.position`,
      [report.session_id]
    );
    res.json({ report, screenshots, completedSteps: steps });
  })
);

router.put(
  '/:id',
  requireAuth,
  validateBody(reportPatchSchema),
  asyncHandler(async (req, res) => {
    const report = await getReport(req.params.id, req.user);
    const canEdit = report.user_id === req.user.id && ['draft', 'rejected'].includes(report.status);
    if (!canEdit) throw forbidden('Only draft or rejected reports you own can be edited.');
    const b = req.body;
    const { rows } = await query(
      `UPDATE reports SET
         title = COALESCE($1, title),
         summary = COALESCE($2, summary),
         content = COALESCE($3, content),
         sections = COALESCE($4::jsonb, sections),
         status = CASE WHEN status = 'rejected' THEN 'draft' ELSE status END,
         instructor_feedback = CASE WHEN status = 'rejected' THEN NULL ELSE instructor_feedback END,
         updated_at = now()
       WHERE id = $5 RETURNING id`,
      [b.title ?? null, b.summary ?? null, b.content ?? null, b.sections ? JSON.stringify(b.sections) : null, report.id]
    );
    const fresh = await getReport(rows[0].id, req.user);
    res.json({ report: fresh });
  })
);

router.post(
  '/:id/submit',
  requireAuth,
  asyncHandler(async (req, res) => {
    const report = await getReport(req.params.id, req.user);
    if (report.user_id !== req.user.id) throw forbidden('Only the author can submit this report.');
    if (report.status !== 'draft' && report.status !== 'rejected') {
      throw badRequest('Only draft reports can be submitted for review.');
    }
    const { rows: progressCount } = await query(
      `SELECT COUNT(*)::int AS n FROM lab_step_progress WHERE session_id = $1`,
      [report.session_id]
    );
    if (progressCount[0].n === 0) throw badRequest('Complete at least one lab step before submitting a report.');

    await query(
      `UPDATE reports SET status = 'submitted', instructor_feedback = NULL, updated_at = now() WHERE id = $1`,
      [report.id]
    );
    const { rows: courseStaff } = await query(
      `SELECT c.instructor_id FROM labs l JOIN courses c ON c.id = l.course_id WHERE l.id = $1`,
      [report.lab_id]
    );
    await withTransaction(async (client) => {
      await recordActivity(client, {
        userId: req.user.id,
        action: 'report.submitted',
        entityType: 'report',
        entityId: report.id,
        metadata: { title: report.title },
      });
      if (courseStaff[0]?.instructor_id) {
        await notify(client, {
          userIds: [courseStaff[0].instructor_id],
          type: 'review',
          title: 'Report submitted for review',
          body: `${req.user.full_name} submitted "${report.title}".`,
          link: `/instructor/reports/${report.id}`,
        });
      }
    });
    const fresh = await getReport(report.id, req.user);
    res.json({ report: fresh });
  })
);

// ---------- staff review / publish ----------

router.get(
  '/',
  requireRole('admin', 'instructor'),
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        status: z.enum(['draft', 'submitted', 'approved', 'rejected', 'published']).optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(60).default(20),
      })
      .safeParse(req.query);
    if (!parsed.success) throw badRequest('Invalid query parameters.');
    const { status, page, limit } = parsed.data;

    const where = [];
    const params = [];
    if (status) {
      params.push(status);
      where.push(`r.status = $${params.length}`);
    } else {
      where.push(`r.status IN ('submitted', 'approved', 'rejected', 'published')`);
    }
    if (req.user.role === 'instructor') {
      params.push(req.user.id);
      where.push(`c.instructor_id = $${params.length}`);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;

    const { rows: countRows } = await query(
      `SELECT COUNT(*)::int AS total FROM reports r
       JOIN labs l ON l.id = r.lab_id LEFT JOIN courses c ON c.id = l.course_id ${whereSql}`,
      params
    );
    params.push(limit, (page - 1) * limit);
    const { rows } = await query(
      `SELECT r.id, r.title, r.status, r.created_at, r.updated_at, r.reviewed_at, r.instructor_feedback,
         l.title AS lab_title, c.title AS course_title,
         u.full_name AS author_name, u.email AS author_email,
         p.slug AS published_slug
       FROM reports r
       JOIN labs l ON l.id = r.lab_id
       JOIN users u ON u.id = r.user_id
       LEFT JOIN courses c ON c.id = l.course_id
       LEFT JOIN posts p ON p.id = r.published_post_id
       ${whereSql}
       ORDER BY CASE r.status WHEN 'submitted' THEN 0 ELSE 1 END, r.updated_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ reports: rows, total: countRows[0].total, page, limit });
  })
);

const reviewSchema = z.object({
  action: z.enum(['approve', 'reject']),
  feedback: z.string().trim().max(5000).default(''),
});

router.post(
  '/:id/review',
  requireRole('admin', 'instructor'),
  validateBody(reviewSchema),
  asyncHandler(async (req, res) => {
    const report = await getReport(req.params.id, req.user);
    if (!['submitted', 'approved', 'rejected'].includes(report.status)) {
      throw badRequest('Only submitted reports can be reviewed.');
    }
    if (req.user.role === 'instructor') {
      const { rows } = await query(
        `SELECT c.instructor_id FROM labs l LEFT JOIN courses c ON c.id = l.course_id WHERE l.id = $1`,
        [report.lab_id]
      );
      if (rows[0]?.instructor_id && rows[0].instructor_id !== req.user.id) {
        throw forbidden('You can only review reports for your own courses.');
      }
    }
    const newStatus = req.body.action === 'approve' ? 'approved' : 'rejected';
    await query(
      `UPDATE reports SET status = $1, instructor_feedback = $2, reviewed_by = $3, reviewed_at = now(), updated_at = now()
       WHERE id = $4`,
      [newStatus, req.body.feedback || null, req.user.id, report.id]
    );
    await withTransaction(async (client) => {
      await notify(client, {
        userIds: [report.user_id],
        type: 'review',
        title: newStatus === 'approved' ? 'Report approved' : 'Report needs changes',
        body: `"${report.title}" was ${newStatus}.${req.body.feedback ? ` Feedback: ${req.body.feedback.slice(0, 200)}` : ''}`,
        link: `/student/reports/${report.id}`,
      });
      await recordActivity(client, {
        userId: req.user.id,
        action: `report.${newStatus}`,
        entityType: 'report',
        entityId: report.id,
      });
    });
    const fresh = await getReport(report.id, req.user);
    res.json({ report: fresh });
  })
);

router.post(
  '/:id/publish',
  requireRole('admin', 'instructor'),
  validateBody(z.object({
    title: z.string().trim().min(3).max(240).optional(),
    excerpt: z.string().trim().max(400).optional(),
    tags: z.array(z.string().trim().max(40)).max(10).optional(),
    coverImage: z.string().trim().max(500).optional().nullable(),
  })),
  asyncHandler(async (req, res) => {
    const report = await getReport(req.params.id, req.user);
    if (report.status !== 'approved') throw badRequest('Only approved reports can be published as blog articles.');
    if (report.published_post_id) throw badRequest('This report has already been published.');

    const tags = req.body.tags || ['lab-report', report.difficulty];
    const slug = `${slugify(req.body.title || report.title)}-${Math.random().toString(36).slice(2, 6)}`;
    const excerpt = req.body.excerpt || report.summary.slice(0, 390);

    const postId = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO posts (slug, title, excerpt, content, cover_image, author_id, source_report_id, status, tags, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'published', $8, now()) RETURNING id`,
        [slug, req.body.title || report.title, excerpt, report.content, req.body.coverImage ?? null,
         report.user_id, report.id, tags]
      );
      await client.query(
        `UPDATE reports SET status = 'published', published_post_id = $1, updated_at = now() WHERE id = $2`,
        [rows[0].id, report.id]
      );
      await recordActivity(client, {
        userId: report.user_id,
        action: 'report.published',
        entityType: 'report',
        entityId: report.id,
        metadata: { slug },
      });
      await notify(client, {
        userIds: [report.user_id],
        type: 'blog',
        title: 'Your report is live on the CyberITA+ blog!',
        body: `"${req.body.title || report.title}" was published as a technical article.`,
        link: `/blog/${slug}`,
      });
      return rows[0].id;
    });

    const { rows } = await query('SELECT id, slug, title, status, published_at FROM posts WHERE id = $1', [postId]);
    res.status(201).json({ post: rows[0], report: { id: report.id, status: 'published' } });
  })
);

export default router;
