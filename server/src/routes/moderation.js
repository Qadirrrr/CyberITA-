import { Router } from 'express';
import { z } from 'zod';
import { query } from '../config/db.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../utils/errors.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, requireModerator } from '../middleware/auth.js';
import {
  getModeratorByUser,
  getModeratorScope,
  assertCourseInScope,
  assertSupervisesModerator,
  REPORT_KINDS,
  REPORT_SEVERITIES,
} from '../services/moderators.js';
import {
  listModerationReports,
  getModerationReport,
  canAccessReport,
  createModerationReport,
  updateModerationReport,
  escalateModerationReport,
  moderationStats,
} from '../services/moderationReports.js';

/**
 * Moderator-facing endpoints (mounted at /api/moderation).
 *
 * Two audiences share this router:
 *   * senior_moderator   -> supervises subject moderators, handles escalations
 *   * subject_moderator  -> manages assigned courses/instructors, content
 *                           quality and student complaints
 *
 * Every query is filtered through the caller's assignment scope. Moderators are
 * never given admin surfaces here (settings, lab servers, Docker, API keys).
 *
 * The report-creation endpoint is intentionally open to any authenticated user
 * (a student or instructor raises a complaint); everything else is moderator-only.
 */

const router = Router();

async function requireModeratorProfile(req) {
  const moderator = await getModeratorByUser(req.user.id);
  if (!moderator) throw forbidden('Your account has no moderator profile.');
  if (moderator.status !== 'active') throw forbidden('Your moderator account is suspended.');
  return moderator;
}

// ---------- shared: raise a report (any authenticated user) ----------

router.post(
  '/reports',
  requireAuth,
  validateBody(
    z.object({
      title: z.string().trim().min(3, 'Give the report a title.').max(220),
      body: z.string().trim().max(10000).default(''),
      kind: z.enum(REPORT_KINDS).default('complaint'),
      severity: z.enum(REPORT_SEVERITIES).default('normal'),
      courseId: z.coerce.number().int().positive().optional().nullable(),
      instructorId: z.coerce.number().int().positive().optional().nullable(),
      studentId: z.coerce.number().int().positive().optional().nullable(),
    })
  ),
  asyncHandler(async (req, res) => {
    const report = await createModerationReport({ user: req.user, ...req.body });
    res.status(201).json({ report });
  })
);

// ---------- moderator: workspace ----------

router.get(
  '/stats',
  requireModerator(),
  asyncHandler(async (req, res) => {
    res.json({ stats: await moderationStats(req.user) });
  })
);

/** Everything a moderator needs for their dashboard, in one request. */
router.get(
  '/workspace',
  requireModerator(),
  asyncHandler(async (req, res) => {
    const moderator = await requireModeratorProfile(req);
    const scope = await getModeratorScope(moderator.id);
    const stats = await moderationStats(req.user);

    if (moderator.tier === 'senior_moderator') {
      const { rows: supervised } = await query(
        `SELECT m.id, m.display_name, m.status, u.full_name, u.email, u.avatar_url,
                (SELECT COUNT(*)::int FROM moderator_assignments ma
                  WHERE ma.moderator_id = m.id AND ma.kind = 'course') AS course_count,
                (SELECT COUNT(*)::int FROM moderator_assignments ma
                  WHERE ma.moderator_id = m.id AND ma.kind = 'instructor') AS instructor_count,
                (SELECT COUNT(*)::int FROM moderation_reports r
                  WHERE r.subject_moderator_id = m.id AND r.status IN ('open', 'in_review')) AS open_reports,
                (SELECT COUNT(*)::int FROM moderation_reports r
                  WHERE r.subject_moderator_id = m.id AND r.status = 'escalated') AS escalated_reports
         FROM moderator_assignments ma
         JOIN moderators m ON m.id = ma.moderator_target_id
         JOIN users u ON u.id = m.user_id
         WHERE ma.moderator_id = $1 AND ma.kind = 'subject_moderator'
         ORDER BY lower(u.full_name)`,
        [moderator.id]
      );
      const { rows: escalated } = await query(
        `SELECT r.id, r.title, r.kind, r.severity, r.status, r.created_at,
                c.title AS course_title, u.full_name AS subject_moderator_name
         FROM moderation_reports r
         LEFT JOIN courses c ON c.id = r.course_id
         LEFT JOIN moderators sm ON sm.id = r.subject_moderator_id
         LEFT JOIN users u ON u.id = sm.user_id
         WHERE r.escalated_to = $1 AND r.status = 'escalated'
         ORDER BY CASE r.severity WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, r.created_at DESC
         LIMIT 20`,
        [moderator.id]
      );
      return res.json({ moderator, role: moderator.tier, stats, supervised, escalated });
    }

    // Subject/Course moderator workspace.
    const { rows: courses } = scope.courseIds.length
      ? await query(
          `SELECT c.id, c.title, c.slug, c.status, c.category, c.instructor_id,
                  u.full_name AS instructor_name,
                  (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id AND e.status <> 'dropped') AS learners,
                  (SELECT COUNT(*)::int FROM labs l WHERE l.course_id = c.id) AS labs,
                  (SELECT COUNT(*)::int FROM lab_submissions s
                    JOIN labs l ON l.id = s.lab_id
                    WHERE l.course_id = c.id AND s.status = 'submitted') AS submissions_pending
           FROM courses c LEFT JOIN users u ON u.id = c.instructor_id
           WHERE c.id = ANY($1::bigint[])
           ORDER BY lower(c.title)`,
          [scope.courseIds]
        )
      : { rows: [] };

    const { rows: instructors } = scope.instructorIds.length
      ? await query(
          `SELECT u.id, u.full_name, u.email, u.avatar_url, u.is_active,
                  (SELECT COUNT(*)::int FROM courses c WHERE c.instructor_id = u.id) AS course_count
           FROM users u WHERE u.id = ANY($1::bigint[]) ORDER BY lower(u.full_name)`,
          [scope.instructorIds]
        )
      : { rows: [] };

    const { rows: recentReports } = await query(
      `SELECT r.id, r.title, r.kind, r.severity, r.status, r.created_at,
              c.title AS course_title
       FROM moderation_reports r LEFT JOIN courses c ON c.id = r.course_id
       WHERE r.subject_moderator_id = $1
       ORDER BY r.created_at DESC LIMIT 10`,
      [moderator.id]
    );

    res.json({
      moderator,
      role: moderator.tier,
      stats,
      subjects: scope.subjects,
      courses,
      instructors,
      recentReports,
    });
  })
);

// ---------- reports ----------

router.get(
  '/reports',
  requireModerator(),
  asyncHandler(async (req, res) => {
    await requireModeratorProfile(req);
    const parsed = z
      .object({
        status: z.enum(['all', 'open', 'in_review', 'escalated', 'resolved', 'dismissed']).optional(),
        kind: z.enum(['all', ...REPORT_KINDS]).optional(),
        severity: z.enum(['all', ...REPORT_SEVERITIES]).optional(),
        search: z.string().trim().max(120).optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(60).default(20),
      })
      .safeParse(req.query);
    if (!parsed.success) throw badRequest('Invalid query parameters.');
    const result = await listModerationReports({ user: req.user, ...parsed.data });
    res.json(result);
  })
);

router.get(
  '/reports/:id',
  requireModerator(),
  asyncHandler(async (req, res) => {
    await requireModeratorProfile(req);
    const report = await getModerationReport(req.params.id);
    if (!(await canAccessReport(req.user, report))) {
      throw forbidden('This report is not part of your moderation scope.');
    }
    res.json({ report });
  })
);

router.patch(
  '/reports/:id',
  requireModerator(),
  validateBody(
    z.object({
      status: z.enum(['open', 'in_review', 'resolved', 'dismissed']).optional(),
      resolution: z.string().trim().max(10000).default(''),
      note: z.string().trim().max(2000).default(''),
    })
  ),
  asyncHandler(async (req, res) => {
    await requireModeratorProfile(req);
    const report = await updateModerationReport({ id: req.params.id, user: req.user, ...req.body });
    res.json({ report });
  })
);

router.post(
  '/reports/:id/escalate',
  requireModerator('subject_moderator'),
  validateBody(
    z.object({
      reason: z.string().trim().max(4000).default(''),
      severity: z.enum(REPORT_SEVERITIES).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    await requireModeratorProfile(req);
    const report = await escalateModerationReport({ id: req.params.id, user: req.user, ...req.body });
    res.json({ report });
  })
);

// ---------- scoped read access to courses / instructors ----------

router.get(
  '/courses/:id',
  requireModerator('subject_moderator'),
  asyncHandler(async (req, res) => {
    const moderator = await requireModeratorProfile(req);
    const courseId = Number(req.params.id);
    if (!Number.isInteger(courseId) || courseId <= 0) throw badRequest('Invalid course id.');
    await assertCourseInScope(moderator.id, courseId);

    const { rows } = await query(
      `SELECT c.id, c.title, c.slug, c.status, c.category, c.subcategory, c.level,
              c.updated_at, c.instructor_id, u.full_name AS instructor_name,
              (SELECT COUNT(*)::int FROM modules m WHERE m.course_id = c.id) AS module_count,
              (SELECT COUNT(*)::int FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
              (SELECT COUNT(*)::int FROM labs l WHERE l.course_id = c.id) AS lab_count,
              (SELECT COUNT(*)::int FROM labs l WHERE l.course_id = c.id AND l.status = 'published') AS published_labs,
              (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id AND e.status <> 'dropped') AS learners
       FROM courses c LEFT JOIN users u ON u.id = c.instructor_id
       WHERE c.id = $1`,
      [courseId]
    );
    if (!rows[0]) throw notFound('Course not found.');

    const { rows: labs } = await query(
      `SELECT l.id, l.title, l.slug, l.status, l.due_at,
              (SELECT COUNT(*)::int FROM lab_steps s WHERE s.lab_id = l.id) AS step_count,
              (SELECT COUNT(*)::int FROM lab_submissions s WHERE s.lab_id = l.id) AS submission_count
       FROM labs l WHERE l.course_id = $1 ORDER BY lower(l.title)`,
      [courseId]
    );

    res.json({ course: rows[0], labs });
  })
);

router.get(
  '/instructors/:id',
  requireModerator('subject_moderator'),
  asyncHandler(async (req, res) => {
    const moderator = await requireModeratorProfile(req);
    const instructorId = Number(req.params.id);
    if (!Number.isInteger(instructorId) || instructorId <= 0) throw badRequest('Invalid instructor id.');

    const scope = await getModeratorScope(moderator.id);
    if (!scope.instructorIds.includes(instructorId)) {
      throw forbidden('This instructor is not part of your assigned moderation scope.');
    }

    const { rows: instructorRows } = await query(
      `SELECT id, full_name, email, avatar_url, is_active, headline, created_at
       FROM users WHERE id = $1 AND role = 'instructor'`,
      [instructorId]
    );
    if (!instructorRows[0]) throw notFound('Instructor not found.');

    const { rows: courses } = await query(
      `SELECT c.id, c.title, c.slug, c.status, c.category,
              (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id AND e.status <> 'dropped') AS learners,
              (SELECT COUNT(*)::int FROM labs l WHERE l.course_id = c.id) AS labs
       FROM courses c WHERE c.instructor_id = $1 ORDER BY lower(c.title)`,
      [instructorId]
    );

    res.json({ instructor: instructorRows[0], courses, scopeSubjects: scope.subjects });
  })
);

// ---------- senior moderator: supervise subject moderators ----------

router.get(
  '/supervised/:id',
  requireModerator('senior_moderator'),
  asyncHandler(async (req, res) => {
    const senior = await requireModeratorProfile(req);
    await assertSupervisesModerator(senior.id, req.params.id);

    const { rows: moderatorRows } = await query(
      `SELECT m.id, m.display_name, m.status, u.full_name, u.email, u.avatar_url
       FROM moderators m JOIN users u ON u.id = m.user_id WHERE m.id = $1`,
      [req.params.id]
    );

    const { rows: assignments } = await query(
      `SELECT ma.kind, ma.subject, c.title AS course_title, i.full_name AS instructor_name
       FROM moderator_assignments ma
       LEFT JOIN courses c ON c.id = ma.course_id
       LEFT JOIN users i ON i.id = ma.instructor_id
       WHERE ma.moderator_id = $1`,
      [req.params.id]
    );

    const { rows: reports } = await query(
      `SELECT r.id, r.title, r.kind, r.severity, r.status, r.created_at, c.title AS course_title
       FROM moderation_reports r LEFT JOIN courses c ON c.id = r.course_id
       WHERE r.subject_moderator_id = $1
       ORDER BY r.created_at DESC LIMIT 30`,
      [req.params.id]
    );

    res.json({ moderator: moderatorRows[0] || null, assignments, reports });
  })
);

// ---------- "my complaint" for students/instructors ----------

router.get(
  '/my-reports',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT r.id, r.title, r.kind, r.severity, r.status, r.resolution,
              r.created_at, r.resolved_at, c.title AS course_title,
              u.full_name AS moderator_name
       FROM moderation_reports r
       LEFT JOIN courses c ON c.id = r.course_id
       LEFT JOIN moderators m ON m.id = r.subject_moderator_id
       LEFT JOIN users u ON u.id = m.user_id
       WHERE r.reporter_id = $1
       ORDER BY r.created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ reports: rows });
  })
);

export default router;
