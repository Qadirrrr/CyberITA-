import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { asyncHandler, badRequest } from '../utils/errors.js';
import { validateBody } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import {
  listModerators,
  getModeratorOr404,
  createModerator,
  updateModerator,
  deleteModerator,
  replaceAssignments,
  MODERATOR_TIERS,
  ASSIGNMENT_KINDS,
} from '../services/moderators.js';
import { moderationStats } from '../services/moderationReports.js';

/**
 * Admin-only moderator management.
 *
 * Mounted at /api/moderators and gated by requireRole('admin') for the whole
 * router, so nothing here can ever be reached by a moderator or instructor.
 * Moderators never gain admin capabilities: this file only administers their
 * scoped assignments.
 */

const router = Router();

router.use(requireRole('admin'));

const assignmentSchema = z.object({
  kind: z.enum(ASSIGNMENT_KINDS),
  courseId: z.coerce.number().int().positive().optional().nullable(),
  instructorId: z.coerce.number().int().positive().optional().nullable(),
  subjectModeratorId: z.coerce.number().int().positive().optional().nullable(),
  subject: z.string().trim().max(120).optional().nullable(),
});

const createSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').max(255),
  fullName: z.string().trim().min(2, 'Enter the moderator name.').max(120),
  password: z.string().min(8, 'Password must be at least 8 characters.').max(200),
  tier: z.enum(MODERATOR_TIERS),
  displayName: z.string().trim().max(160).optional().default(''),
  notes: z.string().trim().max(4000).optional().default(''),
  assignments: z.array(assignmentSchema).max(200).optional().default([]),
});

const updateSchema = z.object({
  tier: z.enum(MODERATOR_TIERS).optional(),
  displayName: z.string().trim().max(160).optional(),
  notes: z.string().trim().max(4000).optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

const assignmentsSchema = z.object({
  assignments: z.array(assignmentSchema).max(200),
});

// ---------- reference data for the management UI ----------

router.get(
  '/meta',
  asyncHandler(async (_req, res) => {
    const { rows: courses } = await query(
      `SELECT c.id, c.title, c.status, c.category,
              c.instructor_id, u.full_name AS instructor_name
       FROM courses c LEFT JOIN users u ON u.id = c.instructor_id
       ORDER BY lower(c.title)`
    );
    const { rows: instructors } = await query(
      `SELECT id, full_name, email FROM users WHERE role = 'instructor' AND is_active ORDER BY lower(full_name)`
    );
    const { rows: subjectModerators } = await query(
      `SELECT m.id, m.display_name, u.full_name, u.email
       FROM moderators m JOIN users u ON u.id = m.user_id
       WHERE m.tier = 'subject_moderator' AND m.status = 'active'
       ORDER BY lower(u.full_name)`
    );
    const { rows: subjects } = await query(
      `SELECT DISTINCT category AS subject FROM courses
       WHERE category IS NOT NULL AND category <> ''
       UNION
       SELECT DISTINCT subcategory FROM courses
       WHERE subcategory IS NOT NULL AND subcategory <> ''
       ORDER BY 1`
    );
    res.json({
      courses,
      instructors,
      subjectModerators,
      subjects: subjects.map((row) => row.subject),
      tiers: MODERATOR_TIERS,
    });
  })
);

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    res.json({ stats: await moderationStats(req.user) });
  })
);

// ---------- roster ----------

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        tier: z.enum(['all', ...MODERATOR_TIERS]).optional(),
        status: z.enum(['all', 'active', 'suspended']).optional(),
        search: z.string().trim().max(120).optional(),
      })
      .safeParse(req.query);
    if (!parsed.success) throw badRequest('Invalid query parameters.');
    const moderators = await listModerators(parsed.data);
    res.json({ moderators, stats: await moderationStats(req.user) });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const moderator = await getModeratorOr404(req.params.id);
    const { rows: assignments } = await query(
      `SELECT ma.*, c.title AS course_title, i.full_name AS instructor_name,
              sm.user_id AS subject_moderator_user_id, smu.full_name AS subject_moderator_name
       FROM moderator_assignments ma
       LEFT JOIN courses c ON c.id = ma.course_id
       LEFT JOIN users i ON i.id = ma.instructor_id
       LEFT JOIN moderators sm ON sm.id = ma.moderator_target_id
       LEFT JOIN users smu ON smu.id = sm.user_id
       WHERE ma.moderator_id = $1 ORDER BY ma.kind, ma.id`,
      [moderator.id]
    );
    res.json({ moderator: { ...moderator, assignments } });
  })
);

router.post(
  '/',
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const moderator = await createModerator({ admin: req.user, ...req.body });
    res.status(201).json({ moderator });
  })
);

router.put(
  '/:id',
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const moderator = await updateModerator({ id: req.params.id, admin: req.user, ...req.body });
    res.json({ moderator });
  })
);

router.put(
  '/:id/assignments',
  validateBody(assignmentsSchema),
  asyncHandler(async (req, res) => {
    const moderator = await replaceAssignments({
      moderatorId: req.params.id,
      assignments: req.body.assignments,
      actor: req.user,
    });
    res.json({ moderator });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const result = await deleteModerator({ id: req.params.id, admin: req.user });
    res.json(result);
  })
);

export default router;
