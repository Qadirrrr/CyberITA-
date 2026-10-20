import { Router } from 'express';
import { query } from '../config/db.js';
import { asyncHandler, notFound } from '../utils/errors.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get(
  '/mine',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT ct.id, ct.serial, ct.issued_at, ct.final_progress,
         c.title AS course_title, c.slug AS course_slug, c.cover_image, c.duration_hours,
         u.full_name AS student_name
       FROM certificates ct
       JOIN courses c ON c.id = ct.course_id
       JOIN users u ON u.id = ct.user_id
       WHERE ct.user_id = $1 ORDER BY ct.issued_at DESC`,
      [req.user.id]
    );
    res.json({ certificates: rows });
  })
);

/** Public verification endpoint used by employers/recruiters. */
router.get(
  '/verify/:serial',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT ct.serial, ct.issued_at, ct.final_progress,
         u.full_name AS student_name,
         c.title AS course_title, c.duration_hours, c.level
       FROM certificates ct
       JOIN users u ON u.id = ct.user_id
       JOIN courses c ON c.id = ct.course_id
       WHERE LOWER(ct.serial) = LOWER($1)`,
      [req.params.serial]
    );
    if (!rows[0]) throw notFound('No certificate matches this serial number.');
    res.json({ certificate: rows[0], valid: true });
  })
);

export default router;
