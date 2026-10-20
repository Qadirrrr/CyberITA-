import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { asyncHandler, badRequest, notFound } from '../utils/errors.js';
import { validateBody } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { slugify } from '../utils/helpers.js';

const router = Router();

async function attachCourses(paths) {
  if (paths.length === 0) return paths;
  const ids = paths.map((p) => p.id);
  const { rows: links } = await query(
    `SELECT lpc.path_id, lpc.position,
       c.id, c.slug, c.title, c.summary, c.level, c.duration_hours, c.cover_image, c.category,
       u.full_name AS instructor_name,
       (SELECT COUNT(*)::int FROM lessons l WHERE l.course_id = c.id) AS lesson_count
     FROM learning_path_courses lpc
     JOIN courses c ON c.id = lpc.course_id
     LEFT JOIN users u ON u.id = c.instructor_id
     WHERE lpc.path_id = ANY($1::bigint[]) AND c.status = 'published'
     ORDER BY lpc.position`,
    [ids]
  );
  return paths.map((path) => ({
    ...path,
    courses: links.filter((link) => String(link.path_id) === String(path.id)),
  }));
}

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT id, slug, title, description, level, cover_image, status, created_at
       FROM learning_paths WHERE status = 'published' ORDER BY id`
    );
    res.json({ paths: await attachCourses(rows) });
  })
);

router.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT id, slug, title, description, level, cover_image, status, created_at
       FROM learning_paths WHERE slug = $1`,
      [req.params.slug]
    );
    if (!rows[0]) throw notFound('Learning path not found.');
    const [path] = await attachCourses(rows);
    res.json({ path });
  })
);

const pathSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).default(''),
  level: z.enum(['beginner', 'intermediate', 'advanced']).default('beginner'),
  coverImage: z.string().trim().max(500).optional().nullable(),
  status: z.enum(['draft', 'published']).default('published'),
  courseIds: z.array(z.coerce.number().int()).max(20).default([]),
});

router.post(
  '/',
  requireRole('admin'),
  validateBody(pathSchema),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const slug = `${slugify(b.title, 'path')}-${Math.random().toString(36).slice(2, 5)}`;
    const id = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO learning_paths (slug, title, description, level, cover_image, status)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [slug, b.title, b.description, b.level, b.coverImage ?? null, b.status]
      );
      for (let i = 0; i < b.courseIds.length; i += 1) {
        await client.query(
          `INSERT INTO learning_path_courses (path_id, course_id, position) VALUES ($1,$2,$3)`,
          [rows[0].id, b.courseIds[i], i]
        );
      }
      return rows[0].id;
    });
    res.status(201).json({ id });
  })
);

router.put(
  '/:id',
  requireRole('admin'),
  validateBody(pathSchema.partial()),
  asyncHandler(async (req, res) => {
    const b = req.body;
    const { rows } = await query(
      `UPDATE learning_paths SET
         title = COALESCE($1, title), description = COALESCE($2, description),
         level = COALESCE($3, level), cover_image = COALESCE($4, cover_image),
         status = COALESCE($5, status)
       WHERE id = $6 RETURNING id, slug, title, status`,
      [b.title ?? null, b.description ?? null, b.level ?? null, b.coverImage ?? null, b.status ?? null, req.params.id]
    );
    if (!rows[0]) throw notFound('Learning path not found.');
    if (b.courseIds) {
      await withTransaction(async (client) => {
        await client.query('DELETE FROM learning_path_courses WHERE path_id = $1', [rows[0].id]);
        for (let i = 0; i < b.courseIds.length; i += 1) {
          await client.query(
            `INSERT INTO learning_path_courses (path_id, course_id, position) VALUES ($1,$2,$3)`,
            [rows[0].id, b.courseIds[i], i]
          );
        }
      });
    }
    res.json({ path: rows[0] });
  })
);

router.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const { rowCount } = await query('DELETE FROM learning_paths WHERE id = $1', [req.params.id]);
    if (rowCount === 0) throw notFound('Learning path not found.');
    res.json({ ok: true });
  })
);

export default router;
