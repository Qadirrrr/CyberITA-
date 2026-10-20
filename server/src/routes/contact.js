import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { query, withTransaction } from '../config/db.js';
import env from '../config/env.js';
import { asyncHandler } from '../utils/errors.js';
import { validateBody } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';

const router = Router();

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: env.isTest ? 10_000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many messages, please try again later.', code: 'rate_limited' } },
});

const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  subject: z.string().trim().min(3).max(200),
  message: z.string().trim().min(10).max(5000),
});

router.post(
  '/',
  contactLimiter,
  validateBody(contactSchema),
  asyncHandler(async (req, res) => {
    const { name, email, subject, message } = req.body;
    const { rows } = await query(
      `INSERT INTO contact_messages (name, email, subject, message) VALUES ($1, $2, $3, $4)
       RETURNING id, created_at`,
      [name, email, subject, message]
    );
    res.status(201).json({ ok: true, id: rows[0].id });
  })
);

router.get(
  '/',
  requireRole('admin', 'instructor'),
  asyncHandler(async (req, res) => {
    const status = ['new', 'read', 'replied'].includes(req.query.status) ? req.query.status : null;
    const { rows } = await query(
      `SELECT cm.*, u.full_name AS handled_by_name
       FROM contact_messages cm LEFT JOIN users u ON u.id = cm.handled_by
       ${status ? 'WHERE cm.status = $1' : ''}
       ORDER BY cm.created_at DESC LIMIT 200`,
      status ? [status] : []
    );
    res.json({ messages: rows });
  })
);

router.patch(
  '/:id',
  requireRole('admin'),
  validateBody(z.object({ status: z.enum(['new', 'read', 'replied']) })),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `UPDATE contact_messages SET status = $1, handled_by = $2, handled_at = COALESCE(handled_at, $3)
       WHERE id = $4 RETURNING *`,
      [req.body.status, req.user.id, req.body.status === 'replied' ? new Date() : null, req.params.id]
    );
    if (!rows[0]) throw Object.assign(new Error('Message not found.'), { status: 404, expose: true });
    res.json({ message: rows[0] });
  })
);

export default router;
