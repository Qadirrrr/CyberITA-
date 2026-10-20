import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { asyncHandler, notFound, badRequest } from '../utils/errors.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { hashPassword } from '../services/authService.js';
import { recordActivity } from '../utils/activity.js';

const router = Router();

const USER_COLUMNS = `u.id, u.email, u.full_name, u.role, u.headline, u.bio, u.avatar_url,
  u.is_active, u.last_login_at, u.created_at,
  COALESCE((SELECT COUNT(*)::int FROM enrollments e WHERE e.user_id = u.id), 0) AS enrolled_courses,
  COALESCE((SELECT COUNT(*)::int FROM lab_sessions ls WHERE ls.user_id = u.id), 0) AS lab_sessions`;

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120).optional(),
  headline: z.string().trim().max(160).optional().nullable(),
  bio: z.string().trim().max(2000).optional().nullable(),
  avatarUrl: z.string().trim().url().max(500).optional().nullable(),
});

router.put(
  '/me',
  requireAuth,
  validateBody(profileSchema),
  asyncHandler(async (req, res) => {
    const { fullName, headline, bio, avatarUrl } = req.body;
    const { rows } = await query(
      `UPDATE users SET
         full_name = COALESCE($1, full_name),
         headline = COALESCE($2, headline),
         bio = COALESCE($3, bio),
         avatar_url = COALESCE($4, avatar_url)
       WHERE id = $5 RETURNING id, email, full_name, role, headline, bio, avatar_url, is_active, created_at`,
      [fullName ?? null, headline ?? null, bio ?? null, avatarUrl ?? null, req.user.id]
    );
    res.json({ user: rows[0] });
  })
);

const listQuerySchema = z.object({
  role: z.enum(['admin', 'instructor', 'student']).optional(),
  search: z.string().trim().max(120).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

router.get(
  '/',
  requireRole('admin', 'instructor'),
  asyncHandler(async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) throw badRequest('Invalid query parameters.');
    const { role, search, status, page, limit } = parsed.data;

    const where = [];
    const params = [];
    if (role) {
      params.push(role);
      where.push(`u.role = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }
    if (status) {
      where.push(`u.is_active = ${status === 'active' ? 'TRUE' : 'FALSE'}`);
    }
    // Instructors can only see students + themselves; admins see everyone.
    if (req.user.role === 'instructor') {
      where.push(`u.role = 'student' OR u.id = ${Number(req.user.id)}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const countResult = await query(`SELECT COUNT(*)::int AS total FROM users u ${whereSql}`, params);
    params.push(limit, (page - 1) * limit);
    const { rows } = await query(
      `SELECT ${USER_COLUMNS} FROM users u ${whereSql}
       ORDER BY u.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ users: rows, total: countResult.rows[0].total, page, limit });
  })
);

router.get(
  '/:id',
  requireRole('admin', 'instructor'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = $1`, [req.params.id]);
    if (!rows[0]) throw notFound('User not found.');
    const { rows: history } = await query(
      `SELECT id, action, entity_type, entity_id, metadata, created_at
       FROM activity_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
      [req.params.id]
    );
    const { rows: enrollments } = await query(
      `SELECT e.id, e.status, e.progress_percent, e.enrolled_at, e.completed_at,
              c.id AS course_id, c.title, c.slug, c.cover_image
       FROM enrollments e JOIN courses c ON c.id = e.course_id
       WHERE e.user_id = $1 ORDER BY e.enrolled_at DESC`,
      [req.params.id]
    );
    res.json({ user: rows[0], history, enrollments });
  })
);

const adminUpdateSchema = z.object({
  role: z.enum(['admin', 'instructor', 'student']).optional(),
  isActive: z.boolean().optional(),
  fullName: z.string().trim().min(2).max(120).optional(),
  password: z.string().min(8).regex(/[0-9]/).optional(),
});

router.patch(
  '/:id',
  requireRole('admin'),
  validateBody(adminUpdateSchema),
  asyncHandler(async (req, res) => {
    const { role, isActive, fullName, password } = req.body;
    const targetId = Number(req.params.id);
    if (targetId === Number(req.user.id) && (isActive === false || (role && role !== 'admin'))) {
      throw badRequest('You cannot demote or disable your own account.');
    }
    const passwordHash = password ? await hashPassword(password) : null;
    const { rows } = await query(
      `UPDATE users SET
         role = COALESCE($1, role),
         is_active = COALESCE($2, is_active),
         full_name = COALESCE($3, full_name),
         password_hash = COALESCE($4, password_hash)
       WHERE id = $5
       RETURNING id, email, full_name, role, headline, bio, avatar_url, is_active, created_at`,
      [role ?? null, isActive ?? null, fullName ?? null, passwordHash, targetId]
    );
    if (!rows[0]) throw notFound('User not found.');
    await withTransaction((client) =>
      recordActivity(client, {
        userId: req.user.id,
        action: 'admin.user_updated',
        entityType: 'user',
        entityId: targetId,
        metadata: { role: role ?? null, isActive: isActive ?? null },
      })
    );
    res.json({ user: rows[0] });
  })
);

export default router;
