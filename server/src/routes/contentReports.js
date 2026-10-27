import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { asyncHandler, badRequest, notFound } from '../utils/errors.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, isStaff } from '../middleware/auth.js';
import { recordActivity } from '../utils/activity.js';

const router = Router();

const reportSchema = z.object({
  contentType: z.enum(['post', 'course', 'lab']),
  contentId: z.coerce.number().int().positive(),
  reason: z.enum(['spam', 'misleading', 'plagiarism', 'offensive', 'broken', 'other']),
  details: z.string().trim().max(2000).optional(),
});

const CONTENT_TABLES = {
  post: { table: 'posts', label: 'Article' },
  course: { table: 'courses', label: 'Course' },
  lab: { table: 'labs', label: 'Lab' },
};

async function loadTarget(contentType, contentId) {
  const mapping = CONTENT_TABLES[contentType];
  if (!mapping) throw badRequest('Unsupported content type.');
  const { rows } = await query(
    `SELECT id, title, status FROM ${mapping.table} WHERE id = $1`,
    [contentId]
  );
  return rows[0] || null;
}

router.post(
  '/',
  requireAuth,
  validateBody(reportSchema),
  asyncHandler(async (req, res) => {
    const { contentType, contentId, reason, details } = req.body;
    const target = await loadTarget(contentType, contentId);
    if (!target) throw notFound('The content you tried to report no longer exists.');
    if (target.status !== 'published' && !isStaff(req.user)) {
      throw notFound('The content you tried to report no longer exists.');
    }

    const { rows } = await query(
      `INSERT INTO content_reports (reporter_id, content_type, content_id, reason, details)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (reporter_id, content_type, content_id)
       DO UPDATE SET reason = EXCLUDED.reason, details = EXCLUDED.details,
                     status = 'open', resolved_by = NULL, resolution_note = NULL,
                     resolved_at = NULL, updated_at = now()
       RETURNING id, content_type, content_id, reason, details, status, created_at`,
      [req.user.id, contentType, contentId, reason, details ?? null]
    );

    await withTransaction((client) =>
      recordActivity(client, {
        userId: req.user.id,
        action: 'content.reported',
        entityType: contentType,
        entityId: contentId,
        metadata: { reportId: rows[0].id, reason },
      })
    );

    res.status(201).json({ report: rows[0] });
  })
);

export default router;
