import { Router } from 'express';
import { query } from '../config/db.js';
import { asyncHandler } from '../utils/errors.js';

const router = Router();

/**
 * Compact public catalog used by the navbar mega-menus.
 * Courses and labs are returned flat; the client groups them by
 * category -> subcategory -> title.
 */
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows: courses } = await query(
      `SELECT c.id, c.slug, c.title, c.category, c.subcategory, c.level, c.duration_hours, c.cover_image
       FROM courses c
       WHERE c.status = 'published'
       ORDER BY c.category, c.subcategory, c.title`
    );

    const { rows: labs } = await query(
      `SELECT l.id, l.slug, l.title, l.difficulty, l.estimated_minutes,
              l.course_id, c.slug AS course_slug, c.title AS course_title,
              c.category, c.subcategory
       FROM labs l
       LEFT JOIN courses c ON c.id = l.course_id
       WHERE l.status = 'published'
       ORDER BY c.category NULLS LAST, c.subcategory NULLS LAST, l.title`
    );

    res.json({ courses, labs });
  })
);

export default router;
