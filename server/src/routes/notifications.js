import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { asyncHandler, badRequest, notFound } from '../utils/errors.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { notify } from '../utils/activity.js';
import { emitNotifications } from '../websocket/index.js';

const router = Router();

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 20, 60);
    const { rows: countRows } = await query(
      `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE read_at IS NULL)::int AS unread
       FROM notifications WHERE user_id = $1`,
      [req.user.id]
    );
    const { rows } = await query(
      `SELECT id, type, title, body, link, read_at, created_at
       FROM notifications WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.user.id, limit, (page - 1) * limit]
    );
    res.json({ notifications: rows, total: countRows[0].total, unread: countRows[0].unread, page, limit });
  })
);

router.post(
  '/read-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [req.user.id]);
    res.json({ ok: true });
  })
);

router.post(
  '/read-category',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { category } = req.body || {};
    if (!category) {
      return res.json({ ok: true });
    }
    await query(
      `UPDATE notifications
       SET read_at = now()
       WHERE user_id = $1
         AND read_at IS NULL
         AND (
           type = $2
           OR ($2 = 'quiz' AND (link LIKE '%quiz%' OR LOWER(title) LIKE '%quiz%'))
           OR ($2 = 'assignment' AND (link LIKE '%assignment%' OR LOWER(title) LIKE '%assignment%'))
           OR ($2 = 'submission' AND (link LIKE '%submission%' OR LOWER(title) LIKE '%submission%'))
         )`,
      [req.user.id, category]
    );
    res.json({ ok: true });
  })
);

router.post(
  '/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `UPDATE notifications SET read_at = COALESCE(read_at, now()) WHERE id = $1 AND user_id = $2 RETURNING id, read_at`,
      [req.params.id, req.user.id]
    );
    if (!rows[0]) throw notFound('Notification not found.');
    res.json({ notification: rows[0] });
  })
);

/** Admin broadcast to many users (role or explicit ids). */
router.post(
  '/broadcast',
  requireRole('admin'),
  validateBody(z.object({
    title: z.string().trim().min(3, 'Title must be at least 3 characters.').max(200),
    body: z.string().trim().max(2000, 'Message must be at most 2000 characters.').default(''),
    link: z.string().trim().max(300).optional().nullable(),
    role: z.enum(['all', 'student', 'instructor', 'admin']).default('all'),
    userIds: z.array(z.coerce.number().int()).max(500).optional(),
  })),
  asyncHandler(async (req, res) => {
    const { title, body, link, role, userIds } = req.body;
    let targets = userIds || [];
    if (!userIds || userIds.length === 0) {
      const { rows } =
        role === 'all'
          ? await query(`SELECT id FROM users WHERE is_active = TRUE`)
          : await query(`SELECT id FROM users WHERE is_active = TRUE AND role = $1`, [role]);
      targets = rows.map((row) => row.id);
    }
    if (targets.length === 0) throw badRequest('No recipients matched.');
    await notify(null, { userIds: targets, type: 'announcement', title, body, link: link ?? null });
    emitNotifications(targets, { type: 'announcement', title, body, link: link ?? null, created_at: new Date().toISOString() });
    res.status(201).json({ delivered: targets.length });
  })
);

export default router;
