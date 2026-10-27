import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { asyncHandler, notFound, badRequest, conflict, forbidden } from '../utils/errors.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { hashPassword } from '../services/authService.js';
import { recordActivity } from '../utils/activity.js';
import { emailSchema, fullNameSchema, optionalHttpUrl, passwordSchema } from '../utils/validation.js';
import { generateTemporaryPassword } from '../utils/helpers.js';

const router = Router();

const USER_COLUMNS = `u.id, u.email, u.full_name, u.role, u.headline, u.bio, u.avatar_url,
  u.is_active, u.last_login_at, u.created_at,
  COALESCE((SELECT COUNT(*)::int FROM enrollments e WHERE e.user_id = u.id), 0) AS enrolled_courses,
  COALESCE((SELECT COUNT(*)::int FROM courses c WHERE c.instructor_id = u.id), 0) AS taught_courses,
  COALESCE((SELECT COUNT(*)::int FROM lab_sessions ls WHERE ls.user_id = u.id), 0) AS lab_sessions`;

const profileSchema = z.object({
  fullName: fullNameSchema.optional(),
  headline: z.string().trim().max(160, 'Headline must be at most 160 characters.').optional().nullable(),
  bio: z.string().trim().max(2000, 'Bio must be at most 2000 characters.').optional().nullable(),
  avatarUrl: optionalHttpUrl,
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
         headline = CASE WHEN $6 THEN $2 ELSE headline END,
         bio = CASE WHEN $7 THEN $3 ELSE bio END,
         avatar_url = CASE WHEN $8 THEN $4 ELSE avatar_url END
       WHERE id = $5 RETURNING id, email, full_name, role, headline, bio, avatar_url, is_active, created_at`,
      [
        fullName ?? null,
        headline ?? null,
        bio ?? null,
        avatarUrl ?? null,
        req.user.id,
        req.body.headline !== undefined,
        req.body.bio !== undefined,
        req.body.avatarUrl !== undefined,
      ]
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
      params.push(status === 'active');
      where.push(`u.is_active = $${params.length}`);
    }
    // Instructors can only see students enrolled in their courses + themselves; admins see everyone.
    if (req.user.role === 'instructor') {
      params.push(req.user.id);
      where.push(`(u.id = $${params.length} OR (u.role = 'student' AND EXISTS (
        SELECT 1 FROM enrollments e
        JOIN courses c ON c.id = e.course_id
        WHERE e.user_id = u.id AND c.instructor_id = $${params.length}
      )))`);
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
    const targetUserId = Number(req.params.id);
    if (req.user.role === 'instructor' && targetUserId !== req.user.id) {
      const { rows: authorized } = await query(
        `SELECT 1 FROM enrollments e
         JOIN courses c ON c.id = e.course_id
         WHERE e.user_id = $1 AND c.instructor_id = $2`,
        [targetUserId, req.user.id]
      );
      if (!authorized[0]) throw forbidden('You can only view records for students enrolled in your courses.');
    }

    const { rows } = await query(`SELECT ${USER_COLUMNS} FROM users u WHERE u.id = $1`, [targetUserId]);
    if (!rows[0]) throw notFound('User not found.');

    let history;
    if (req.user.role === 'instructor' && targetUserId !== req.user.id) {
      // Never expose a learner's activity from another instructor's courses.
      ({ rows: history } = await query(
        `SELECT ae.id, ae.action, ae.entity_type, ae.entity_id, ae.metadata, ae.created_at
         FROM activity_events ae
         WHERE ae.user_id = $1 AND (
           (ae.entity_type = 'course' AND EXISTS (
             SELECT 1 FROM courses c WHERE c.id = ae.entity_id AND c.instructor_id = $2))
           OR (ae.entity_type = 'lesson' AND EXISTS (
             SELECT 1 FROM lessons l JOIN courses c ON c.id = l.course_id
             WHERE l.id = ae.entity_id AND c.instructor_id = $2))
           OR (ae.entity_type = 'lab' AND EXISTS (
             SELECT 1 FROM labs l JOIN courses c ON c.id = l.course_id
             WHERE l.id = ae.entity_id AND c.instructor_id = $2))
           OR (ae.entity_type = 'lab_session' AND EXISTS (
             SELECT 1 FROM lab_sessions s JOIN labs l ON l.id = s.lab_id
             JOIN courses c ON c.id = l.course_id
             WHERE s.id = ae.entity_id AND c.instructor_id = $2))
           OR (ae.entity_type = 'report' AND EXISTS (
             SELECT 1 FROM reports r JOIN labs l ON l.id = r.lab_id
             LEFT JOIN courses c ON c.id = l.course_id
             WHERE r.id = ae.entity_id AND COALESCE(c.instructor_id, l.created_by) = $2))
           OR (ae.entity_type = 'quiz' AND EXISTS (
             SELECT 1 FROM quizzes q JOIN courses c ON c.id = q.course_id
             WHERE q.id = ae.entity_id AND c.instructor_id = $2))
           OR (ae.entity_type = 'assignment' AND EXISTS (
             SELECT 1 FROM assignments a JOIN courses c ON c.id = a.course_id
             WHERE a.id = ae.entity_id AND c.instructor_id = $2))
           OR (ae.entity_type = 'submission' AND EXISTS (
             SELECT 1 FROM assignment_submissions s JOIN assignments a ON a.id = s.assignment_id
             JOIN courses c ON c.id = a.course_id
             WHERE s.id = ae.entity_id AND c.instructor_id = $2))
           OR (ae.entity_type = 'conversation' AND EXISTS (
             SELECT 1 FROM conversations cv WHERE cv.id = ae.entity_id AND cv.instructor_id = $2))
         )
         ORDER BY ae.created_at DESC LIMIT 100`,
        [targetUserId, req.user.id]
      ));
    } else {
      ({ rows: history } = await query(
        `SELECT id, action, entity_type, entity_id, metadata, created_at
         FROM activity_events WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`,
        [targetUserId]
      ));
    }

    const enrollWhere = ['e.user_id = $1'];
    const enrollParams = [targetUserId];
    if (req.user.role === 'instructor') {
      enrollParams.push(req.user.id);
      enrollWhere.push(`c.instructor_id = $${enrollParams.length}`);
    }
    const { rows: enrollments } = await query(
      `SELECT e.id, e.status, e.progress_percent, e.enrolled_at, e.completed_at,
              c.id AS course_id, c.title, c.slug, c.cover_image
       FROM enrollments e JOIN courses c ON c.id = e.course_id
       WHERE ${enrollWhere.join(' AND ')} ORDER BY e.enrolled_at DESC`,
      enrollParams
    );
    res.json({ user: rows[0], history, enrollments });
  })
);

const adminUpdateSchema = z.object({
  role: z.enum(['admin', 'instructor', 'student']).optional(),
  isActive: z.boolean().optional(),
  fullName: fullNameSchema.optional(),
  password: passwordSchema.optional(),
});

const createUserSchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema,
  role: z.enum(['admin', 'instructor', 'student']),
  password: passwordSchema.optional(),
  headline: z.string().trim().max(160, 'Headline must be at most 160 characters.').optional(),
});

router.post(
  '/',
  requireRole('admin'),
  validateBody(createUserSchema),
  asyncHandler(async (req, res) => {
    const { fullName, email, role, password, headline } = req.body;
    const existing = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length > 0) throw conflict('An account with this email already exists.');

    const temporaryPassword = password ? null : generateTemporaryPassword();
    const passwordHash = await hashPassword(password ?? temporaryPassword);

    try {
      const user = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO users (email, password_hash, full_name, role, headline)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, email, full_name, role, headline, bio, avatar_url, is_active, created_at`,
          [email.toLowerCase(), passwordHash, fullName, role, headline ?? null]
        );
        await recordActivity(client, {
          userId: req.user.id,
          action: 'admin.user_created',
          entityType: 'user',
          entityId: rows[0].id,
          metadata: { role, email: rows[0].email },
        });
        return rows[0];
      });

      res.status(201).json({ user, temporaryPassword: temporaryPassword ?? undefined });
    } catch (error) {
      if (error.code === '23505') throw conflict('An account with this email already exists.');
      throw error;
    }
  })
);

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
