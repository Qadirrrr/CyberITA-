import os from 'node:os';
import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import env from '../config/env.js';
import { asyncHandler, notFound, badRequest } from '../utils/errors.js';
import { validateBody } from '../middleware/validate.js';
import { requireRole } from '../middleware/auth.js';
import { getProvider } from '../labs/providers/index.js';
import { stopSession, cleanupExpiredLabSessions } from '../services/labService.js';
import { recordActivity } from '../utils/activity.js';
import {
  createLabServer,
  deleteLabServer,
  getLabServer,
  listLabServers,
  updateLabServer,
  LAB_SERVER_STATUSES,
} from '../services/labServers.js';
import {
  acknowledgeLabSubmission,
  getLabSubmission,
  listLabSubmissions,
  submissionStats,
} from '../services/labSubmissions.js';
import {
  getLiveContainers,
  getContainerDetails,
  getContainerLogs,
  startContainer,
  stopContainer,
  restartContainer,
  resetContainer,
  removeContainer,
} from '../services/dockerMonitor.js';
import { isTerminalConnected, broadcastContainerUpdate } from '../websocket/index.js';

const router = Router();

// Protect all admin endpoints
router.use(requireRole('admin'));

/** Platform system & infrastructure health overview */
router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    let dbStatus = 'ok';
    let dbLatencyMs = 0;
    try {
      const start = Date.now();
      await query('SELECT 1');
      dbLatencyMs = Date.now() - start;
    } catch {
      dbStatus = 'error';
    }

    let dockerStatus = { available: false, provider: env.labs.provider, reason: null };
    try {
      const provider = getProvider('docker');
      const check = await provider.isAvailable();
      dockerStatus = {
        available: check.ok,
        provider: 'docker',
        reason: check.reason || null,
      };
    } catch (err) {
      dockerStatus = {
        available: false,
        provider: env.labs.provider,
        reason: err.message,
      };
    }

    const { rows: sessionCounts } = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'running')::int AS running,
         COUNT(*) FILTER (WHERE status = 'provisioning')::int AS provisioning,
         COUNT(*) FILTER (WHERE status = 'error')::int AS error,
         COUNT(*) FILTER (WHERE status = 'stopped')::int AS stopped,
         COUNT(*)::int AS total
       FROM lab_sessions`
    );

    const memoryUsage = process.memoryUsage();
    const systemMemory = {
      totalBytes: os.totalmem(),
      freeBytes: os.freemem(),
      processRssBytes: memoryUsage.rss,
      processHeapUsedBytes: memoryUsage.heapUsed,
    };

    const { rows: providerRows } = await query(
      `SELECT provider, status, COUNT(*)::int AS count
       FROM lab_sessions GROUP BY provider, status ORDER BY provider, status`
    );
    const { rows: failures } = await query(
      `SELECT s.id, s.provider, s.instance_id, s.status, s.started_at, s.ended_at,
              l.title AS lab_title, u.email AS user_email, u.full_name AS user_name
       FROM lab_sessions s
       JOIN labs l ON l.id = s.lab_id
       JOIN users u ON u.id = s.user_id
       WHERE s.status = 'error'
       ORDER BY s.started_at DESC LIMIT 5`
    );
    const { rows: labCatalog } = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM labs) AS labs,
         (SELECT COUNT(*)::int FROM labs WHERE status = 'published') AS published_labs,
         (SELECT COUNT(*)::int FROM lab_steps) AS steps,
         (SELECT COUNT(*)::int FROM screenshots) AS screenshots`
    );

    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      system: {
        platform: os.platform(),
        release: os.release(),
        cpuCount: os.cpus().length,
        loadAvg: os.loadavg(),
      },
      memory: systemMemory,
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      infrastructure: {
        configuredProvider: env.labs.provider,
        docker: dockerStatus,
        sessionStats: sessionCounts[0],
        providerBreakdown: providerRows,
        failures,
        catalog: labCatalog[0],
        limits: {
          sessionTtlMinutes: env.labs.sessionTtlMinutes,
          cleanupIntervalMinutes: env.labs.cleanupIntervalMinutes,
          image: env.labs.docker.image,
          memoryMb: env.labs.docker.memoryMb,
          cpus: env.labs.docker.cpus,
          pidsLimit: env.labs.docker.pidsLimit,
          commandTimeoutMs: env.labs.docker.commandTimeoutMs,
          provisionTimeoutMs: env.labs.docker.provisionTimeoutMs,
          maxOutputBytes: env.labs.docker.maxOutputBytes,
          networkEnabled: env.labs.docker.networkEnabled,
        },
      },
    });
  })
);

/** List and filter all lab sessions across the entire platform */
router.get(
  '/lab-sessions',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const status = req.query.status ? String(req.query.status).trim() : null;
    const search = req.query.search ? String(req.query.search).trim() : null;

    const where = [];
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      where.push(`s.status = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      where.push(`(u.email ILIKE $${params.length} OR u.full_name ILIKE $${params.length} OR l.title ILIKE $${params.length} OR s.id::text ILIKE $${params.length})`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows: countRows } = await query(
      `SELECT COUNT(*)::int AS total
       FROM lab_sessions s
       JOIN users u ON u.id = s.user_id
       JOIN labs l ON l.id = s.lab_id
       ${whereClause}`,
      params
    );

    params.push(limit, (page - 1) * limit);
    const { rows } = await query(
      `SELECT
         s.id, s.lab_id, s.user_id, s.status, s.provider, s.instance_id,
         s.started_at, s.expires_at, s.ended_at, s.last_activity_at,
         u.email AS user_email, u.full_name AS user_name,
         l.title AS lab_title, l.slug AS lab_slug,
         (SELECT COUNT(*)::int FROM lab_step_progress p WHERE p.session_id = s.id) AS completed_steps,
         (SELECT COUNT(*)::int FROM screenshots sc WHERE sc.session_id = s.id) AS screenshot_count
       FROM lab_sessions s
       JOIN users u ON u.id = s.user_id
       JOIN labs l ON l.id = s.lab_id
       ${whereClause}
       ORDER BY s.started_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      sessions: rows,
      total: countRows[0]?.total || 0,
      page,
      limit,
    });
  })
);

/** Admin force-stop a lab session */
router.post(
  '/lab-sessions/:id/stop',
  asyncHandler(async (req, res) => {
    const sessionId = Number(req.params.id);
    const { rows } = await query('SELECT * FROM lab_sessions WHERE id = $1', [sessionId]);
    const session = rows[0];
    if (!session) throw notFound('Session not found.');

    const result = await stopSession(session);
    await withTransaction((client) =>
      recordActivity(client, {
        userId: req.user.id,
        action: 'admin.lab_session_stopped',
        entityType: 'lab_session',
        entityId: session.id,
        metadata: { targetUserId: session.user_id, previousStatus: session.status },
      })
    );

    res.json({ ok: true, session: result });
  })
);

/** Trigger background cleanup on demand */
router.post(
  '/lab-sessions/cleanup',
  asyncHandler(async (req, res) => {
    const result = await cleanupExpiredLabSessions({ limit: 100 });
    await withTransaction((client) =>
      recordActivity(client, {
        userId: req.user.id,
        action: 'admin.cleanup_triggered',
        entityType: 'system',
        entityId: null,
        metadata: result,
      })
    );
    res.json({ ok: true, result });
  })
);

/** ================= Live Docker Container Monitoring ================= */

/** List all students' Docker containers with live CPU/RAM/Duration/Terminal status */
router.get(
  '/docker/containers',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const status = req.query.status ? String(req.query.status).trim() : 'all';
    const search = req.query.search ? String(req.query.search).trim() : '';

    const data = await getLiveContainers({ status, search, page, limit }, isTerminalConnected);
    res.json(data);
  })
);

/** Get container inspect details & lifecycle events */
router.get(
  '/docker/containers/:id',
  asyncHandler(async (req, res) => {
    const sessionId = Number(req.params.id);
    const data = await getContainerDetails(sessionId);
    res.json(data);
  })
);

/** Get container stdout/stderr logs */
router.get(
  '/docker/containers/:id/logs',
  asyncHandler(async (req, res) => {
    const sessionId = Number(req.params.id);
    const tail = Number(req.query.tail) || 250;
    const data = await getContainerLogs(sessionId, { tail });
    res.json(data);
  })
);

/** Start container */
router.post(
  '/docker/containers/:id/start',
  asyncHandler(async (req, res) => {
    const sessionId = Number(req.params.id);
    const result = await startContainer(sessionId, req.user);
    broadcastContainerUpdate().catch(() => {});
    res.json(result);
  })
);

/** Stop container */
router.post(
  '/docker/containers/:id/stop',
  asyncHandler(async (req, res) => {
    const sessionId = Number(req.params.id);
    const result = await stopContainer(sessionId, req.user);
    broadcastContainerUpdate().catch(() => {});
    res.json(result);
  })
);

/** Restart container */
router.post(
  '/docker/containers/:id/restart',
  asyncHandler(async (req, res) => {
    const sessionId = Number(req.params.id);
    const result = await restartContainer(sessionId, req.user);
    broadcastContainerUpdate().catch(() => {});
    res.json(result);
  })
);

/** Reset container: re-creates a clean environment while preserving progress */
router.post(
  '/docker/containers/:id/reset',
  asyncHandler(async (req, res) => {
    const sessionId = Number(req.params.id);
    const result = await resetContainer(sessionId, req.user);
    broadcastContainerUpdate().catch(() => {});
    res.json(result);
  })
);

/** Remove container: deprovisions container, marks session stopped, keeps records */
router.post(
  '/docker/containers/:id/remove',
  asyncHandler(async (req, res) => {
    const sessionId = Number(req.params.id);
    const result = await removeContainer(sessionId, req.user);
    broadcastContainerUpdate().catch(() => {});
    res.json(result);
  })
);

/** Platform audit & security event logs */
router.get(
  '/audit-logs',
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const action = req.query.action ? String(req.query.action).trim() : null;
    const entityType = req.query.entityType ? String(req.query.entityType).trim() : null;
    const search = req.query.search ? String(req.query.search).trim() : null;

    const where = [];
    const params = [];

    if (action) {
      params.push(`%${action}%`);
      where.push(`a.action ILIKE $${params.length}`);
    }

    if (entityType) {
      params.push(entityType);
      where.push(`a.entity_type = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      where.push(`(u.email ILIKE $${params.length} OR u.full_name ILIKE $${params.length} OR a.action ILIKE $${params.length})`);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows: countRows } = await query(
      `SELECT COUNT(*)::int AS total
       FROM activity_events a
       LEFT JOIN users u ON u.id = a.user_id
       ${whereClause}`,
      params
    );

    params.push(limit, (page - 1) * limit);
    const { rows } = await query(
      `SELECT
         a.id, a.user_id, a.action, a.entity_type, a.entity_id,
         a.metadata, a.created_at,
         u.email AS user_email, u.full_name AS user_name, u.role AS user_role
       FROM activity_events a
       LEFT JOIN users u ON u.id = a.user_id
       ${whereClause}
       ORDER BY a.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      logs: rows,
      total: countRows[0]?.total || 0,
      page,
      limit,
    });
  })
);

/** Get all platform settings */
router.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT key, value, description, updated_at
       FROM platform_settings
       ORDER BY key`
    );
    const settingsMap = {};
    for (const row of rows) {
      settingsMap[row.key] = {
        value: row.value,
        description: row.description,
        updatedAt: row.updated_at,
      };
    }
    res.json({ settings: settingsMap });
  })
);

const settingUpdateSchema = z.object({
  value: z.record(z.any()),
  description: z.string().optional(),
});

/** Update platform setting */
router.put(
  '/settings/:key',
  validateBody(settingUpdateSchema),
  asyncHandler(async (req, res) => {
    const key = req.params.key;
    const { value, description } = req.body;

    const { rows } = await query(
      `INSERT INTO platform_settings (key, value, description, updated_at, updated_by)
       VALUES ($1, $2, $3, now(), $4)
       ON CONFLICT (key) DO UPDATE SET
         value = $2,
         description = COALESCE($3, platform_settings.description),
         updated_at = now(),
         updated_by = $4
       RETURNING key, value, description, updated_at`,
      [key, JSON.stringify(value), description ?? null, req.user.id]
    );

    await withTransaction((client) =>
      recordActivity(client, {
        userId: req.user.id,
        action: 'admin.settings_updated',
        entityType: 'setting',
        entityId: null,
        metadata: { key, value },
      })
    );

    res.json({ setting: rows[0] });
  })
);

/** Shared query for moderation queue rows. */
async function queryContentReports({ status = null, page = 1, limit = 20 } = {}) {
  const where = [];
  const params = [];
  if (status && status !== 'all') {
    params.push(status);
    where.push(`cr.status = $${params.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows: countRows } = await query(
    `SELECT COUNT(*)::int AS total FROM content_reports cr ${whereSql}`,
    params
  );
  params.push(limit, (page - 1) * limit);
  const { rows } = await query(
    `SELECT cr.id, cr.reporter_id, cr.content_type, cr.content_id, cr.reason, cr.details,
            cr.status, cr.resolution_note, cr.resolved_at, cr.created_at, cr.updated_at,
            reporter.full_name AS reporter_name, reporter.email AS reporter_email,
            resolver.full_name AS resolved_by_name,
            CASE cr.content_type
              WHEN 'post' THEN (SELECT p.title FROM posts p WHERE p.id = cr.content_id)
              WHEN 'course' THEN (SELECT c.title FROM courses c WHERE c.id = cr.content_id)
              WHEN 'lab' THEN (SELECT l.title FROM labs l WHERE l.id = cr.content_id)
            END AS content_title,
            CASE cr.content_type
              WHEN 'post' THEN (SELECT p.slug FROM posts p WHERE p.id = cr.content_id)
              WHEN 'course' THEN (SELECT c.slug FROM courses c WHERE c.id = cr.content_id)
              WHEN 'lab' THEN (SELECT l.slug FROM labs l WHERE l.id = cr.content_id)
            END AS content_slug
     FROM content_reports cr
     JOIN users reporter ON reporter.id = cr.reporter_id
     LEFT JOIN users resolver ON resolver.id = cr.resolved_by
     ${whereSql}
     ORDER BY cr.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { reports: rows, total: countRows[0]?.total || 0, page, limit };
}

/** Platform-wide course oversight for admins. */
router.get(
  '/courses',
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        search: z.string().trim().max(160).optional(),
        status: z.enum(['draft', 'published', 'archived']).optional(),
        category: z.string().trim().max(80).optional(),
        instructorId: z.coerce.number().int().positive().optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .safeParse(req.query);
    if (!parsed.success) throw badRequest('Invalid query parameters.');
    const { search, status, category, instructorId, page, limit } = parsed.data;

    const where = [];
    const params = [];
    if (search) {
      params.push(`%${search}%`);
      where.push(`(c.title ILIKE $${params.length} OR c.slug ILIKE $${params.length}
        OR u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      where.push(`c.status = $${params.length}`);
    }
    if (category) {
      params.push(category);
      where.push(`c.category = $${params.length}`);
    }
    if (instructorId) {
      params.push(instructorId);
      where.push(`c.instructor_id = $${params.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const { rows: countRows } = await query(
      `SELECT COUNT(*)::int AS total
       FROM courses c LEFT JOIN users u ON u.id = c.instructor_id ${whereSql}`,
      params
    );
    params.push(limit, (page - 1) * limit);
    const { rows } = await query(
      `SELECT c.id, c.slug, c.title, c.summary, c.category, c.subcategory, c.level,
              c.status, c.instructor_id, c.created_at, c.published_at,
              u.full_name AS instructor_name, u.email AS instructor_email,
              (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id) AS enrolled_count,
              (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id AND e.status = 'active') AS active_count,
              (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id AND e.status = 'completed') AS completed_count,
              (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id AND e.status = 'dropped') AS dropped_count,
              COALESCE((SELECT ROUND(AVG(e.progress_percent), 1) FROM enrollments e WHERE e.course_id = c.id), 0) AS avg_progress,
              (SELECT COUNT(*)::int FROM modules m WHERE m.course_id = c.id) AS module_count,
              (SELECT COUNT(*)::int FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
              (SELECT COUNT(*)::int FROM lab_submissions s
                 JOIN labs l ON l.id = s.lab_id WHERE l.course_id = c.id) AS lab_submission_count,
              (SELECT COUNT(*)::int FROM student_projects p WHERE p.course_id = c.id) AS project_count,
              (SELECT COUNT(*)::int FROM labs l WHERE l.course_id = c.id) AS lab_count,
              (SELECT COUNT(*)::int FROM certificates ct WHERE ct.course_id = c.id) AS certificate_count,
              (SELECT COUNT(*)::int FROM learning_path_courses lp WHERE lp.course_id = c.id) AS path_count
       FROM courses c LEFT JOIN users u ON u.id = c.instructor_id
       ${whereSql}
       ORDER BY c.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const { rows: categories } = await query(
      `SELECT category,
              COUNT(*)::int AS course_count,
              COUNT(*) FILTER (WHERE status = 'published')::int AS published_count,
              COUNT(*) FILTER (WHERE status = 'draft')::int AS draft_count,
              COALESCE(SUM((SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id)), 0)::int AS enrollment_count
       FROM courses c
       WHERE category IS NOT NULL AND category <> ''
       GROUP BY category ORDER BY course_count DESC, category`
    );

    res.json({ courses: rows, total: countRows[0]?.total || 0, page, limit, categories });
  })
);

/** Publish, unpublish or archive any course. */
router.post(
  '/courses/:id/status',
  validateBody(z.object({ status: z.enum(['draft', 'published', 'archived']) })),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `UPDATE courses SET status = $1::varchar,
         published_at = CASE WHEN $1::varchar = 'published' THEN COALESCE(published_at, now()) ELSE published_at END,
         updated_at = now()
       WHERE id = $2::bigint
       RETURNING id, slug, title, status, published_at, updated_at`,
      [req.body.status, req.params.id]
    );
    if (!rows[0]) throw notFound('Course not found.');
    await withTransaction((client) =>
      recordActivity(client, {
        userId: req.user.id,
        action: 'admin.course_status_changed',
        entityType: 'course',
        entityId: rows[0].id,
        metadata: { status: req.body.status, title: rows[0].title },
      })
    );
    res.json({ course: rows[0] });
  })
);

/** Catalog health: categories, learning paths and certificate output. */
router.get(
  '/catalog',
  asyncHandler(async (_req, res) => {
    const { rows: stats } = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM courses) AS courses,
         (SELECT COUNT(*)::int FROM courses WHERE status = 'published') AS published_courses,
         (SELECT COUNT(*)::int FROM courses WHERE status = 'draft') AS draft_courses,
         (SELECT COUNT(*)::int FROM courses WHERE status = 'archived') AS archived_courses,
         (SELECT COUNT(*)::int FROM enrollments) AS enrollments,
         (SELECT COUNT(*)::int FROM enrollments WHERE status = 'active') AS active_enrollments,
         (SELECT COUNT(*)::int FROM enrollments WHERE status = 'completed') AS completed_enrollments,
         (SELECT COUNT(*)::int FROM certificates) AS certificates,
         (SELECT COUNT(*)::int FROM certificates WHERE issued_at > now() - INTERVAL '30 days') AS certificates_30d,
         (SELECT COUNT(*)::int FROM learning_paths) AS learning_paths,
         (SELECT COUNT(*)::int FROM learning_paths WHERE status = 'published') AS published_paths,
         (SELECT COUNT(DISTINCT category)::int FROM courses WHERE category IS NOT NULL AND category <> '') AS categories`
    );
    const { rows: categories } = await query(
      `SELECT category,
              COUNT(*)::int AS course_count,
              COUNT(*) FILTER (WHERE status = 'published')::int AS published_count,
              COALESCE(SUM((SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id)), 0)::int AS enrollment_count
       FROM courses c
       WHERE category IS NOT NULL AND category <> ''
       GROUP BY category ORDER BY course_count DESC, category`
    );
    const { rows: paths } = await query(
      `SELECT lp.id, lp.slug, lp.title, lp.description, lp.level, lp.status, lp.created_at,
              (SELECT COUNT(*)::int FROM learning_path_courses lpc WHERE lpc.path_id = lp.id) AS course_count,
              (SELECT COUNT(*)::int FROM learning_path_courses lpc
                 JOIN courses c ON c.id = lpc.course_id
                 WHERE lpc.path_id = lp.id AND c.status = 'published') AS published_course_count,
              (SELECT COUNT(DISTINCT e.user_id)::int FROM learning_path_courses lpc
                 JOIN enrollments e ON e.course_id = lpc.course_id
                 WHERE lpc.path_id = lp.id) AS learner_count
       FROM learning_paths lp
       ORDER BY lp.created_at DESC`
    );
    const { rows: certificateCourses } = await query(
      `SELECT c.id, c.title, c.slug, COUNT(ct.id)::int AS certificate_count
       FROM certificates ct JOIN courses c ON c.id = ct.course_id
       GROUP BY c.id ORDER BY certificate_count DESC, c.title LIMIT 6`
    );
    const { rows: recentCertificates } = await query(
      `SELECT ct.id, ct.serial, ct.issued_at, ct.final_progress,
              u.full_name AS student_name, u.email AS student_email,
              c.title AS course_title, c.slug AS course_slug
       FROM certificates ct
       JOIN users u ON u.id = ct.user_id
       JOIN courses c ON c.id = ct.course_id
       ORDER BY ct.issued_at DESC LIMIT 10`
    );
    const { rows: enrollmentSeries } = await query(
      `SELECT date_trunc('week', enrolled_at)::date AS week, COUNT(*)::int AS count
       FROM enrollments WHERE enrolled_at > now() - INTERVAL '12 weeks'
       GROUP BY 1 ORDER BY 1`
    );

    res.json({
      stats: stats[0],
      categories,
      paths,
      certificateCourses,
      recentCertificates,
      enrollmentSeries,
    });
  })
);

/** Courses assigned to an instructor, plus the full assignable catalog. */
router.get(
  '/instructors/:id/courses',
  asyncHandler(async (req, res) => {
    const { rows: instructorRows } = await query(
      `SELECT id, full_name, email, role FROM users WHERE id = $1`,
      [req.params.id]
    );
    const instructor = instructorRows[0];
    if (!instructor) throw notFound('Instructor not found.');
    if (instructor.role !== 'instructor') throw badRequest('Course assignment is only available for instructors.');
    const { rows: courses } = await query(
      `SELECT c.id, c.title, c.slug, c.status, c.category,
              (c.instructor_id = $1) AS assigned,
              (SELECT COUNT(*)::int FROM enrollments e WHERE e.course_id = c.id) AS enrolled_count
       FROM courses c
       ORDER BY (c.instructor_id = $1) DESC, c.title`,
      [instructor.id]
    );
    res.json({ instructor, courses });
  })
);

/** Replace an instructor's course assignments in one action. */
router.put(
  '/instructors/:id/courses',
  validateBody(
    z.object({
      courseIds: z.array(z.coerce.number().int().positive()).max(200),
    })
  ),
  asyncHandler(async (req, res) => {
    const instructorId = Number(req.params.id);
    const { rows: instructorRows } = await query(
      `SELECT id, full_name, email, role FROM users WHERE id = $1`,
      [instructorId]
    );
    const instructor = instructorRows[0];
    if (!instructor) throw notFound('Instructor not found.');
    if (instructor.role !== 'instructor') throw badRequest('Course assignment is only available for instructors.');

    const courseIds = [...new Set(req.body.courseIds)];
    if (courseIds.length > 0) {
      const { rows } = await query(
        `SELECT COUNT(*)::int AS total FROM courses WHERE id = ANY($1::bigint[])`,
        [courseIds]
      );
      if (rows[0].total !== courseIds.length) {
        throw badRequest('One or more selected courses no longer exist.');
      }
    }

    await withTransaction(async (client) => {
      if (courseIds.length > 0) {
        await client.query(
          `UPDATE courses SET instructor_id = $1, updated_at = now()
           WHERE id = ANY($2::bigint[])`,
          [instructorId, courseIds]
        );
      }
      await client.query(
        `UPDATE courses SET instructor_id = NULL, updated_at = now()
         WHERE instructor_id = $1 AND NOT (id = ANY($2::bigint[]))`,
        [instructorId, courseIds]
      );
      await recordActivity(client, {
        userId: req.user.id,
        action: 'admin.instructor_courses_assigned',
        entityType: 'user',
        entityId: instructorId,
        metadata: { instructor: instructor.email, courseIds },
      });
    });

    res.json({ ok: true, assigned: courseIds.length });
  })
);

/** Content publication oversight: queue, articles, flags and policies. */
router.get(
  '/content-overview',
  asyncHandler(async (_req, res) => {
    const { rows: stats } = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM posts WHERE status = 'published') AS posts_published,
         (SELECT COUNT(*)::int FROM posts WHERE status = 'draft') AS posts_drafts,
         (SELECT COUNT(*)::int FROM posts WHERE source_report_id IS NOT NULL) AS posts_from_reports,
         (SELECT COUNT(*)::int FROM reports WHERE status = 'submitted') AS reports_submitted,
         (SELECT COUNT(*)::int FROM reports WHERE status = 'approved') AS reports_approved,
         (SELECT COUNT(*)::int FROM reports WHERE status = 'rejected') AS reports_rejected,
         (SELECT COUNT(*)::int FROM reports WHERE status = 'published') AS reports_published,
         (SELECT COUNT(*)::int FROM content_reports WHERE status IN ('open', 'reviewing')) AS flags_open,
         (SELECT COUNT(*)::int FROM content_reports) AS flags_total,
         (SELECT COUNT(*)::int FROM certificates) AS certificates,
         (SELECT COUNT(*)::int FROM contact_messages WHERE status = 'new') AS new_messages`
    );
    const { rows: policyRows } = await query(
      `SELECT key, value FROM platform_settings WHERE key IN ('content', 'enrollment', 'security')`
    );
    const policies = {};
    for (const row of policyRows) policies[row.key] = row.value;

    const { rows: recentPosts } = await query(
      `SELECT p.id, p.slug, p.title, p.status, p.published_at, p.created_at, p.view_count,
              p.source_report_id, u.full_name AS author_name
       FROM posts p LEFT JOIN users u ON u.id = p.author_id
       ORDER BY p.created_at DESC LIMIT 8`
    );
    const { rows: pendingReports } = await query(
      `SELECT r.id, r.title, r.status, r.created_at, r.score, r.max_score,
              u.full_name AS student_name, u.email AS student_email,
              l.title AS lab_title, c.title AS course_title
       FROM reports r
       JOIN users u ON u.id = r.user_id
       JOIN labs l ON l.id = r.lab_id
       LEFT JOIN courses c ON c.id = l.course_id
       WHERE r.status = 'submitted'
       ORDER BY r.created_at ASC LIMIT 8`
    );
    const flags = await queryContentReports({ status: 'open', limit: 8 });

    res.json({
      stats: stats[0],
      policies,
      recentPosts,
      pendingReports,
      flags: flags.reports,
      flagsTotal: flags.total,
    });
  })
);

/** Moderation queue for reported content. */
router.get(
  '/content-reports',
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        status: z.enum(['open', 'reviewing', 'resolved', 'dismissed', 'all']).optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      })
      .safeParse(req.query);
    if (!parsed.success) throw badRequest('Invalid query parameters.');
    const result = await queryContentReports(parsed.data);
    res.json(result);
  })
);

/** Resolve or dismiss a reported content item. */
router.patch(
  '/content-reports/:id',
  validateBody(
    z.object({
      status: z.enum(['open', 'reviewing', 'resolved', 'dismissed']),
      note: z.string().trim().max(2000).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const closing = ['resolved', 'dismissed'].includes(req.body.status);
    const { rows } = await query(
      `UPDATE content_reports SET
         status = $1::varchar,
         resolution_note = $2,
         resolved_by = CASE WHEN $3::boolean THEN $4::bigint ELSE NULL END,
         resolved_at = CASE WHEN $3::boolean THEN now() ELSE NULL END,
         updated_at = now()
       WHERE id = $5::bigint
       RETURNING id, content_type, content_id, status, resolution_note, resolved_at, updated_at`,
      [req.body.status, req.body.note ?? null, closing, req.user.id, req.params.id]
    );
    if (!rows[0]) throw notFound('Content report not found.');
    await withTransaction((client) =>
      recordActivity(client, {
        userId: req.user.id,
        action: 'admin.content_report_updated',
        entityType: rows[0].content_type,
        entityId: rows[0].content_id,
        metadata: { reportId: rows[0].id, status: rows[0].status },
      })
    );
    res.json({ report: rows[0] });
  })
);

/** Security, backup and reliability posture for the settings workspace. */
router.get(
  '/system-status',
  asyncHandler(async (_req, res) => {
    let dbLatencyMs = 0;
    try {
      const start = Date.now();
      await query('SELECT 1');
      dbLatencyMs = Date.now() - start;
    } catch {
      dbLatencyMs = -1;
    }
    const { rows: sizeRows } = await query(
      `SELECT pg_database_size(current_database())::bigint AS bytes`
    );
    const { rows: migrations } = await query(
      `SELECT name, applied_at FROM schema_migrations ORDER BY applied_at`
    );
    const { rows: securityRows } = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM users WHERE role = 'admin') AS admins,
         (SELECT COUNT(*)::int FROM users WHERE role = 'instructor') AS instructors,
         (SELECT COUNT(*)::int FROM users WHERE role = 'student') AS students,
         (SELECT COUNT(*)::int FROM users WHERE is_active = FALSE) AS disabled_accounts,
         (SELECT COUNT(*)::int FROM refresh_tokens WHERE expires_at > now() AND revoked_at IS NULL) AS active_sessions,
         (SELECT COUNT(*)::int FROM users u WHERE u.role = 'instructor'
            AND NOT EXISTS (SELECT 1 FROM courses c WHERE c.instructor_id = u.id)) AS instructors_without_courses,
         (SELECT COUNT(*)::int FROM users u WHERE u.role = 'student'
            AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = u.id)) AS students_without_enrollments,
         (SELECT MAX(last_login_at) FROM users WHERE role = 'admin') AS last_admin_login`
    );
    const { rows: recentAuth } = await query(
      `SELECT a.id, a.action, a.created_at, u.full_name AS user_name, u.email AS user_email, u.role AS user_role
       FROM activity_events a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.action LIKE 'auth.%'
       ORDER BY a.created_at DESC LIMIT 8`
    );
    const { rows: failedSessions } = await query(
      `SELECT s.id, s.provider, s.instance_id, s.started_at, s.ended_at,
              l.title AS lab_title, u.email AS user_email, u.full_name AS user_name
       FROM lab_sessions s
       JOIN labs l ON l.id = s.lab_id
       JOIN users u ON u.id = s.user_id
       WHERE s.status = 'error'
       ORDER BY s.started_at DESC LIMIT 8`
    );
    const { rows: recentFailures } = await query(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.metadata, a.created_at,
              u.full_name AS user_name, u.email AS user_email
       FROM activity_events a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.action ILIKE '%error%' OR a.action ILIKE '%fail%'
       ORDER BY a.created_at DESC LIMIT 8`
    );
    const { rows: learningRows } = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM enrollments) AS enrollments,
         (SELECT COUNT(*)::int FROM enrollments WHERE status = 'completed') AS completed,
         (SELECT COUNT(*)::int FROM enrollments WHERE status = 'active') AS active,
         (SELECT COALESCE(ROUND(AVG(progress_percent), 1), 0) FROM enrollments) AS avg_progress,
         (SELECT COUNT(*)::int FROM certificates) AS certificates,
         (SELECT COUNT(*)::int FROM certificates WHERE issued_at > now() - INTERVAL '30 days') AS certificates_30d,
         (SELECT COUNT(DISTINCT user_id)::int FROM activity_events WHERE created_at > now() - INTERVAL '7 days') AS active_users_7d,
         (SELECT COUNT(*)::int FROM lab_submissions WHERE status = 'submitted') AS pending_lab_submissions,
         (SELECT COUNT(*)::int FROM student_projects WHERE status = 'submitted') AS pending_projects`
    );
    const { rows: topCourses } = await query(
      `SELECT c.id, c.title, c.slug,
              COUNT(e.id)::int AS enrollments,
              COUNT(e.id) FILTER (WHERE e.status = 'completed')::int AS completions,
              COALESCE(ROUND(AVG(e.progress_percent), 1), 0) AS avg_progress
       FROM courses c LEFT JOIN enrollments e ON e.course_id = c.id
       GROUP BY c.id ORDER BY enrollments DESC, c.created_at DESC LIMIT 5`
    );
    const { rows: tables } = await query(
      `SELECT relname AS name, n_live_tup::bigint AS rows
       FROM pg_stat_user_tables ORDER BY relname`
    );

    const memoryUsage = process.memoryUsage();
    const latestMigration = migrations[migrations.length - 1] || null;
    const learning = learningRows[0];
    const completionRate = Number(learning.enrollments) > 0
      ? Math.round((Number(learning.completed) / Number(learning.enrollments)) * 1000) / 10
      : 0;

    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      memory: {
        rssBytes: memoryUsage.rss,
        heapUsedBytes: memoryUsage.heapUsed,
        totalBytes: os.totalmem(),
        freeBytes: os.freemem(),
      },
      database: {
        latencyMs: dbLatencyMs,
        sizeBytes: Number(sizeRows[0]?.bytes || 0),
        migrations,
        latestMigration: latestMigration?.name || null,
        latestMigrationAt: latestMigration?.applied_at || null,
        tables: tables.map((row) => ({ name: row.name, rows: Number(row.rows) })),
      },
      security: {
        ...securityRows[0],
        recentAuth,
      },
      backups: {
        strategy: 'PostgreSQL logical dump (pg_dump)',
        automated: false,
        status: 'manual',
        databaseSizeBytes: Number(sizeRows[0]?.bytes || 0),
        latestMigration: latestMigration?.name || null,
        latestMigrationAt: latestMigration?.applied_at || null,
      },
      errors: {
        failedLabSessions: failedSessions.length,
        failedLabSessionList: failedSessions,
        recentFailures,
      },
      learning: {
        ...learning,
        completionRate,
        topCourses,
      },
    });
  })
);

/**
 * Lab servers: administrator-managed Docker hosts.
 * Each lab is assigned one server; every student still gets an isolated
 * container on that server.
 */

const labServerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  provider: z.enum(['docker']).default('docker'),
  dockerHost: z.string().trim().max(500).nullable().optional(),
  location: z.string().trim().max(160).default(''),
  description: z.string().trim().max(4000).default(''),
  maxSessions: z.coerce.number().int().min(0).max(100000).default(0),
  status: z.enum(LAB_SERVER_STATUSES).default('active'),
});

router.get(
  '/lab-servers',
  asyncHandler(async (_req, res) => {
    const servers = await listLabServers();
    res.json({
      servers,
      defaultHost: env.labs.docker.host || null,
      image: env.labs.docker.image,
    });
  })
);

router.post(
  '/lab-servers',
  validateBody(labServerSchema),
  asyncHandler(async (req, res) => {
    let server;
    try {
      server = await createLabServer(req.body, req.user);
    } catch (error) {
      if (error.code === '23505') throw badRequest('A lab server with that name already exists.');
      throw error;
    }
    await withTransaction((client) =>
      recordActivity(client, {
        userId: req.user.id,
        action: 'admin.lab_server_created',
        entityType: 'lab_server',
        entityId: server.id,
        metadata: { name: server.name, dockerHost: server.docker_host },
      })
    );
    res.status(201).json({ server });
  })
);

router.put(
  '/lab-servers/:id',
  validateBody(labServerSchema.partial()),
  asyncHandler(async (req, res) => {
    const existing = await getLabServer(req.params.id);
    let server;
    try {
      server = await updateLabServer(existing.id, req.body);
    } catch (error) {
      if (error.code === '23505') throw badRequest('A lab server with that name already exists.');
      throw error;
    }
    await withTransaction((client) =>
      recordActivity(client, {
        userId: req.user.id,
        action: 'admin.lab_server_updated',
        entityType: 'lab_server',
        entityId: server.id,
        metadata: { name: server.name, status: server.status },
      })
    );
    res.json({ server });
  })
);

router.delete(
  '/lab-servers/:id',
  asyncHandler(async (req, res) => {
    const removed = await deleteLabServer(req.params.id);
    await withTransaction((client) =>
      recordActivity(client, {
        userId: req.user.id,
        action: 'admin.lab_server_deleted',
        entityType: 'lab_server',
        entityId: removed.id,
        metadata: { name: removed.name },
      })
    );
    res.json({ ok: true, removed });
  })
);

/** Checks one lab server: daemon reachable on its host + lab image present. */
router.post(
  '/lab-servers/:id/verify',
  asyncHandler(async (req, res) => {
    const server = await getLabServer(req.params.id);
    const provider = getProvider('docker');
    const host = server.docker_host || null;
    const image = env.labs.docker.image;
    const checks = [];
    const add = (id, label, ok, detail, ms) =>
      checks.push({ id, label, ok: Boolean(ok), detail: detail ?? null, ms: ms ?? null });

    const started = Date.now();
    const availability = await provider.isAvailable({ host });
    add('engine', 'Docker engine reachable', availability.ok, availability.reason, Date.now() - started);

    if (availability.ok) {
      const imageStarted = Date.now();
      const inspected = await provider.run(['image', 'inspect', image], { host, timeoutMs: 30000 });
      add(
        'image',
        `Lab image "${image}" available`,
        inspected.exitCode === 0,
        inspected.exitCode === 0
          ? 'Image found on this Docker host.'
          : String(image).startsWith('cyberita/')
            ? 'Build it on that host with `npm run lab:image:build`.'
            : 'It will be pulled automatically on the first session.',
        Date.now() - imageStarted
      );
    }

    const ok = checks.every((check) => check.ok);
    await withTransaction((client) =>
      recordActivity(client, {
        userId: req.user.id,
        action: 'admin.lab_server_verified',
        entityType: 'lab_server',
        entityId: server.id,
        metadata: { ok, name: server.name, host },
      })
    );
    res.json({ ok, server: { id: server.id, name: server.name }, host, image, checks, at: new Date().toISOString() });
  })
);

/** Every lab with its assigned server, for the assignment table. */
router.get(
  '/labs',
  asyncHandler(async (_req, res) => {
    const { rows } = await query(
      `SELECT l.id, l.title, l.slug, l.status, l.course_id,
              c.title AS course_title,
              l.lab_server_id, s.name AS lab_server_name,
              (SELECT COUNT(*)::int FROM lab_steps st WHERE st.lab_id = l.id) AS step_count,
              (SELECT COUNT(*)::int FROM lab_sessions ls WHERE ls.lab_id = l.id) AS session_count
       FROM labs l
       LEFT JOIN courses c ON c.id = l.course_id
       LEFT JOIN lab_servers s ON s.id = l.lab_server_id
       ORDER BY lower(l.title)`
    );
    res.json({ labs: rows });
  })
);

/** Assigns the lab server used for a lab's future sessions. */
const labAssignmentSchema = z.object({
  labServerId: z.preprocess(
    (value) => {
      if (value === '' || value === 0 || value === '0' || value === undefined || value === null) return null;
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric : value;
    },
    z.number().int().positive().nullable()
  ),
});

router.put(
  '/labs/:id/server',
  validateBody(labAssignmentSchema),
  asyncHandler(async (req, res) => {
    const { rows: labRows } = await query('SELECT id, title, lab_server_id FROM labs WHERE id = $1', [req.params.id]);
    const lab = labRows[0];
    if (!lab) throw notFound('Lab not found.');

    const labServerId = req.body.labServerId;
    let server = null;
    if (labServerId) server = await getLabServer(labServerId);

    const { rows } = await query(
      `UPDATE labs SET lab_server_id = $1, updated_at = now() WHERE id = $2
       RETURNING id, title, lab_server_id`,
      [server?.id ?? null, lab.id]
    );

    await withTransaction((client) =>
      recordActivity(client, {
        userId: req.user.id,
        action: 'admin.lab_server_assigned',
        entityType: 'lab',
        entityId: lab.id,
        metadata: {
          labTitle: lab.title,
          previousServerId: lab.lab_server_id,
          labServerId: server?.id ?? null,
          labServerName: server?.name ?? null,
        },
      })
    );

    res.json({ lab: { ...rows[0], lab_server_name: server?.name ?? null } });
  })
);

/** Read-only record of every lab submission, plus acknowledgement. */
router.get(
  '/lab-submissions',
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        status: z.enum(['all', 'submitted', 'changes_requested', 'approved']).optional(),
        labId: z.coerce.number().int().positive().optional(),
        courseId: z.coerce.number().int().positive().optional(),
        search: z.string().trim().max(120).optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(60).default(20),
      })
      .safeParse(req.query);
    if (!parsed.success) throw badRequest('Invalid query parameters.');

    const { status, labId, courseId, search, page, limit } = parsed.data;
    const result = await listLabSubmissions({ user: req.user, status, labId, courseId, search, page, limit });
    res.json({ ...result, stats: await submissionStats(req.user) });
  })
);

router.post(
  '/lab-submissions/:id/acknowledge',
  asyncHandler(async (req, res) => {
    const submission = await getLabSubmission(req.params.id);
    const updated = await acknowledgeLabSubmission(submission.id, req.user.id);
    res.json({ submission: updated });
  })
);

/**
 * Live runtime verification for real labs.
 * Provisions a throwaway container, runs a real command and tears it down,
 * so an admin can prove the lab infrastructure works end to end before
 * learners rely on it. Requires the Docker engine on the API host.
 */
router.post(
  '/labs/runtime/verify',
  asyncHandler(async (req, res) => {
    const provider = getProvider();
    const checks = [];
    const add = (id, label, ok, detail, ms) => checks.push({ id, label, ok: Boolean(ok), detail: detail ?? null, ms: ms ?? null });

    if (provider.name !== 'docker') {
      add('provider', 'Active lab provider', false,
        `The active provider is "${provider.name}", which simulates commands and never runs real containers. Set LAB_PROVIDER=docker for real labs.`);
      return res.json({ ok: false, provider: provider.name, image: null, checks, at: new Date().toISOString() });
    }

    // 1. Engine reachable
    const started = Date.now();
    const availability = await provider.isAvailable();
    add('engine', 'Docker engine reachable', availability.ok, availability.reason, Date.now() - started);
    if (!availability.ok) {
      return res.json({ ok: false, provider: provider.name, image: provider.config.image, checks, at: new Date().toISOString() });
    }

    // 2. Lab image present locally
    const image = provider.config.image;
    const inspectStarted = Date.now();
    const inspected = await provider.run(['image', 'inspect', image], { timeoutMs: 30000 });
    const imageHint = inspected.exitCode === 0
      ? null
      : String(image).startsWith('cyberita/')
        ? 'Build it with `npm run lab:image:build` (see docs/LABS.md).'
        : 'It will be pulled automatically on the first session, or pull it now with `docker pull <image>`.';
    add('image', `Lab image "${image}" available`, inspected.exitCode === 0,
      inspected.exitCode === 0 ? 'Image found on the Docker host.' : imageHint, Date.now() - inspectStarted);

    // 3. Full session lifecycle: provision -> execute -> deprovision
    const smokeLab = {
      id: 0,
      title: 'Runtime verification',
      initial_cwd: '/home/student',
      terminal_welcome: '',
      initial_files: { 'notes/hello.txt': 'Runtime verification file.\n' },
      container_image: null,
      network_enabled: true,
    };
    const lifecycleStarted = Date.now();
    let smokeSession = null;
    try {
      const descriptor = await provider.provision({ lab: smokeLab, user: { id: req.user.id } });
      smokeSession = { instance_id: descriptor.instanceId, cwd: descriptor.cwd, fs_state: descriptor.fsState };
      const expectedUser = descriptor.fsState?.shellUser || 'student';
      const terminal = provider.createTerminal(smokeSession, smokeLab);
      const result = await terminal.execute(
        "printf 'uid=%s\\n' \"$(id -u)\" && printf 'user=%s\\n' \"$(id -un)\" && printf 'env=%s\\n' \"$USER\" "
        + "&& pwd && cat notes/hello.txt && printf '%s' ok > .write-test && cat .write-test && rm .write-test "
        + "&& apt-get -s install nmap >/dev/null 2>&1 && echo apt-ok"
      );
      const passed = result.exitCode === 0
        && result.output.includes('uid=0')
        && result.output.includes(`user=${expectedUser}`)
        && result.output.includes(`env=${expectedUser}`)
        && result.output.includes('/home/student')
        && result.output.includes('Runtime verification file.')
        && result.output.includes('apt-ok');
      add('lifecycle', 'Container session lifecycle', passed,
        passed
          ? `Provisioned, executed as root (uid 0) named "${expectedUser}" with home write access and working package installs, using ${descriptor.fsState.shell}.`
          : `The verification command failed (exit ${result.exitCode}): ${String(result.output || '').trim().split(/\r?\n/).slice(-2).join(' ')}`,
        Date.now() - lifecycleStarted);
    } catch (error) {
      add('lifecycle', 'Container session lifecycle', false, error.message, Date.now() - lifecycleStarted);
    } finally {
      if (smokeSession) {
        try {
          await provider.deprovision(smokeSession);
        } catch (error) {
          add('cleanup', 'Verification container removed', false, error.message);
        }
      }
    }

    // 4. Lab container inventory (helps spot orphans)
    const psStarted = Date.now();
    const ps = await provider.run(
      ['ps', '-a', '--filter', 'label=cyberita.lab=true', '--format', '{{.Names}}\t{{.Status}}'],
      { timeoutMs: 15000, maxOutputBytes: 8 * 1024 }
    );
    const containers = ps.exitCode === 0
      ? ps.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
          const [name, status] = line.split('\t');
          return { name, status };
        })
      : [];
    add('inventory', 'Lab container inventory', ps.exitCode === 0,
      `${containers.length} cyberita-lab container(s) on the Docker host.${containers.length ? ` Running: ${containers.filter((c) => /Up/.test(c.status || '')).length}.` : ''}`,
      Date.now() - psStarted);

    // 5. Expired session sweep
    const sweepStarted = Date.now();
    try {
      const sweep = await cleanupExpiredLabSessions({ limit: 50 });
      add('sweep', 'Expired session sweep', true,
        `Scanned ${sweep.scanned} expired session(s), stopped ${sweep.stopped}.`, Date.now() - sweepStarted);
    } catch (error) {
      add('sweep', 'Expired session sweep', false, error.message, Date.now() - sweepStarted);
    }

    const ok = checks.every((check) => check.ok);
    await withTransaction((client) =>
      recordActivity(client, {
        userId: req.user.id,
        action: 'admin.lab_runtime_verified',
        entityType: 'system',
        entityId: null,
        metadata: { ok, failed: checks.filter((c) => !c.ok).map((c) => c.id) },
      })
    );

    res.json({ ok, provider: provider.name, image, checks, at: new Date().toISOString() });
  })
);

export default router;
