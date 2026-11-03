import { Router } from 'express';
import { query } from '../config/db.js';
import { asyncHandler, notFound } from '../utils/errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

const router = Router();

/** Aggregated numbers for the student dashboard. */
router.get(
  '/me/stats',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const { rows: enrollment } = await query(
      `SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
         COUNT(*) FILTER (WHERE status = 'active')::int AS active,
         COALESCE(ROUND(AVG(progress_percent), 1), 0) AS avg_progress
       FROM enrollments WHERE user_id = $1`,
      [userId]
    );
    const { rows: labs } = await query(
      `SELECT COUNT(DISTINCT lab_id)::int AS started,
         COUNT(*) FILTER (WHERE status = 'stopped')::int AS stopped
       FROM lab_sessions WHERE user_id = $1`,
      [userId]
    );
    const { rows: labSteps } = await query(
      `SELECT COUNT(*)::int AS steps FROM lab_step_progress p
       JOIN lab_sessions s ON s.id = p.session_id WHERE s.user_id = $1`,
      [userId]
    );
    const { rows: certificates } = await query(
      `SELECT COUNT(*)::int AS total FROM certificates WHERE user_id = $1`, [userId]
    );
    const { rows: reports } = await query(
      `SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'published')::int AS published,
         COUNT(*) FILTER (WHERE status = 'submitted')::int AS awaiting_review
       FROM reports WHERE user_id = $1`,
      [userId]
    );
    const { rows: labAssignments } = await query(
      `SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE sub.id IS NULL)::int AS pending,
         COUNT(*) FILTER (WHERE sub.status = 'submitted')::int AS submitted,
         COUNT(*) FILTER (WHERE sub.status = 'changes_requested')::int AS changes_requested,
         COUNT(*) FILTER (WHERE sub.status = 'approved')::int AS approved,
         COUNT(*) FILTER (WHERE sub.id IS NULL AND l.due_at IS NOT NULL AND l.due_at < now())::int AS overdue
       FROM labs l
       JOIN courses c ON c.id = l.course_id
       JOIN enrollments e ON e.course_id = c.id AND e.user_id = $1 AND e.status <> 'dropped'
       LEFT JOIN LATERAL (
         SELECT ls.id, ls.status
         FROM lab_submissions ls
         WHERE ls.lab_id = l.id AND ls.user_id = $1
         ORDER BY ls.submitted_at DESC
         LIMIT 1
       ) sub ON TRUE
       WHERE l.status = 'published' AND l.is_practice = FALSE`,
      [userId]
    );
    const { rows: projects } = await query(
      `SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'submitted')::int AS pending,
         COUNT(*) FILTER (WHERE status = 'changes_requested')::int AS changes_requested,
         COUNT(*) FILTER (WHERE status = 'approved')::int AS approved
       FROM student_projects WHERE user_id = $1`,
      [userId]
    );
    const { rows: streak } = await query(
      `SELECT COUNT(DISTINCT date_trunc('day', created_at))::int AS active_days
       FROM activity_events WHERE user_id = $1 AND created_at > now() - INTERVAL '30 days'`,
      [userId]
    );
    res.json({
      enrollments: enrollment[0],
      labs: { ...labs[0], stepsCompleted: labSteps[0].steps },
      certificates: certificates[0].total,
      reports: reports[0],
      labAssignments: labAssignments[0],
      projects: projects[0],
      activeDays30: streak[0].active_days,
    });
  })
);

/** Learning history feed for the student. */
router.get(
  '/me/history',
  requireAuth,
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 30);
    const { rows: countRows } = await query(
      `SELECT COUNT(*)::int AS total FROM activity_events WHERE user_id = $1`, [req.user.id]
    );
    const { rows } = await query(
      `SELECT id, action, entity_type, entity_id, metadata, created_at
       FROM activity_events WHERE user_id = $1
       ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [req.user.id, limit, (page - 1) * limit]
    );
    res.json({ events: rows, total: countRows[0].total, page, limit });
  })
);

/** Platform overview for the admin panel. */
router.get(
  '/admin/overview',
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    const { rows: users } = await query(
      `SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE role = 'student')::int AS students,
         COUNT(*) FILTER (WHERE role = 'instructor')::int AS instructors,
         COUNT(*) FILTER (WHERE role = 'admin')::int AS admins,
         COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '7 days')::int AS new_this_week
       FROM users`
    );
    const { rows: courses } = await query(
      `SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'published')::int AS published,
         COUNT(*) FILTER (WHERE status = 'draft')::int AS drafts
       FROM courses`
    );
    const { rows: enrollments } = await query(
      `SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'active')::int AS active,
         COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
         COUNT(*) FILTER (WHERE status = 'dropped')::int AS dropped,
         COALESCE(ROUND(AVG(progress_percent), 1), 0) AS avg_progress
       FROM enrollments`
    );
    const { rows: labs } = await query(
      `SELECT (SELECT COUNT(*)::int FROM labs) AS labs,
         (SELECT COUNT(*)::int FROM lab_sessions) AS sessions,
         (SELECT COUNT(*)::int FROM lab_sessions WHERE status = 'stopped') AS completed_sessions,
         (SELECT COUNT(*)::int FROM screenshots) AS screenshots,
         (SELECT COUNT(*)::int FROM lab_step_progress) AS steps_completed`
    );
    const { rows: content } = await query(
      `SELECT (SELECT COUNT(*)::int FROM reports) AS reports,
         (SELECT COUNT(*)::int FROM reports WHERE status = 'submitted') AS reports_pending,
         (SELECT COUNT(*)::int FROM posts WHERE status = 'published') AS posts,
         (SELECT COUNT(*)::int FROM certificates) AS certificates,
         (SELECT COUNT(*)::int FROM contact_messages WHERE status = 'new') AS new_messages`
    );
    const { rows: operations } = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM lab_sessions WHERE status = 'running') AS active_labs,
         (SELECT COUNT(*)::int FROM lab_sessions WHERE status = 'provisioning') AS provisioning_labs,
         (SELECT COUNT(*)::int FROM lab_sessions WHERE status = 'error') AS failed_labs,
         (SELECT COUNT(*)::int FROM lab_submissions WHERE status = 'submitted') AS lab_submissions_pending,
         (SELECT COUNT(*)::int FROM student_projects WHERE status = 'submitted') AS projects_pending,
         (SELECT COUNT(*)::int FROM reports WHERE status = 'submitted') AS reports_pending,
         (SELECT COUNT(*)::int FROM content_reports WHERE status IN ('open', 'reviewing')) AS content_flags_open,
         (SELECT COUNT(*)::int FROM refresh_tokens WHERE expires_at > now()) AS active_sessions
      `
    );
    const { rows: catalog } = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM learning_paths) AS learning_paths,
         (SELECT COUNT(*)::int FROM learning_paths WHERE status = 'published') AS published_paths,
         (SELECT COUNT(DISTINCT category)::int FROM courses WHERE category IS NOT NULL AND category <> '') AS categories,
         (SELECT COUNT(*)::int FROM announcements) AS announcements,
         (SELECT COUNT(*)::int FROM labs) AS labs,
         (SELECT COUNT(*)::int FROM labs WHERE status = 'published') AS published_labs
      `
    );
    const { rows: activitySeries } = await query(
      `SELECT date_trunc('week', created_at)::date AS week, COUNT(*)::int AS count
       FROM activity_events WHERE created_at > now() - INTERVAL '12 weeks'
       GROUP BY 1 ORDER BY 1`
    );
    const { rows: recentActivity } = await query(
      `SELECT a.id, a.action, a.entity_type, a.entity_id, a.created_at,
              u.id AS user_id, u.full_name AS user_name, u.role AS user_role
       FROM activity_events a LEFT JOIN users u ON u.id = a.user_id
       ORDER BY a.created_at DESC LIMIT 8`
    );
    const { rows: reviewQuality } = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM lab_submissions) AS lab_submissions_total,
         (SELECT COUNT(*)::int FROM lab_submissions WHERE status = 'approved') AS lab_submissions_approved,
         (SELECT COUNT(*)::int FROM student_projects) AS projects_total,
         (SELECT COUNT(*)::int FROM student_projects WHERE status = 'approved') AS projects_approved
      `
    );
    const { rows: signupSeries } = await query(
      `SELECT date_trunc('week', created_at)::date AS week, COUNT(*)::int AS count
       FROM users WHERE created_at > now() - INTERVAL '12 weeks'
       GROUP BY 1 ORDER BY 1`
    );
    const { rows: enrollmentSeries } = await query(
      `SELECT date_trunc('week', enrolled_at)::date AS week, COUNT(*)::int AS count
       FROM enrollments WHERE enrolled_at > now() - INTERVAL '12 weeks'
       GROUP BY 1 ORDER BY 1`
    );
    const { rows: topCourses } = await query(
      `SELECT c.id, c.title, c.slug, c.status,
         COUNT(e.id)::int AS enrollments,
         COUNT(e.id) FILTER (WHERE e.status = 'completed')::int AS completions,
         COALESCE(ROUND(AVG(e.progress_percent), 1), 0) AS avg_progress
       FROM courses c LEFT JOIN enrollments e ON e.course_id = c.id
       GROUP BY c.id
       ORDER BY enrollments DESC, c.created_at DESC
       LIMIT 6`
    );
    const { rows: recentUsers } = await query(
      `SELECT id, email, full_name, role, created_at, last_login_at
       FROM users ORDER BY created_at DESC LIMIT 6`
    );
    const { rows: engagement } = await query(
      `SELECT COUNT(DISTINCT a.user_id)::int AS active_learners_7d
       FROM activity_events a JOIN users u ON u.id = a.user_id
       WHERE a.created_at > now() - INTERVAL '7 days' AND u.role = 'student'`
    );
    res.json({
      users: users[0],
      courses: courses[0],
      enrollments: enrollments[0],
      labs: labs[0],
      content: content[0],
      operations: operations[0],
      catalog: catalog[0],
      signupSeries,
      enrollmentSeries,
      activitySeries,
      recentActivity,
      reviewQuality: reviewQuality[0],
      topCourses,
      recentUsers,
      engagement: engagement[0],
    });
  })
);

/** Instructor panel overview scoped to their own courses. */
router.get(
  '/instructor/overview',
  requireRole('instructor', 'admin'),
  asyncHandler(async (req, res) => {
    const instructorId = req.user.id;
    const admin = req.user.role === 'admin';
    const { rows: courses } = await query(
      `SELECT COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'published')::int AS published
       FROM courses WHERE instructor_id = $1 OR $2::boolean`,
      [instructorId, admin]
    );
    const { rows: students } = await query(
      `SELECT COUNT(DISTINCT e.user_id)::int AS learners,
         COUNT(*)::int AS enrollments,
         COALESCE(ROUND(AVG(e.progress_percent), 1), 0) AS avg_progress
       FROM enrollments e JOIN courses c ON c.id = e.course_id
       WHERE c.instructor_id = $1 OR $2::boolean`,
      [instructorId, admin]
    );
    const { rows: pending } = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM reports r JOIN labs l ON l.id = r.lab_id
            LEFT JOIN courses c2 ON c2.id = l.course_id
            WHERE r.status = 'submitted' AND (COALESCE(c2.instructor_id, l.created_by) = $1 OR $2::boolean)) AS reports_pending,
         (SELECT COUNT(*)::int FROM lab_submissions s
            WHERE s.status = 'submitted' AND (s.instructor_id = $1 OR $2::boolean)) AS lab_submissions_pending,
         (SELECT COUNT(*)::int FROM lab_submissions s
            WHERE s.status = 'changes_requested' AND (s.instructor_id = $1 OR $2::boolean)) AS lab_changes_requested,
         (SELECT COUNT(*)::int FROM student_projects p
             WHERE p.status = 'submitted' AND (p.instructor_id = $1 OR $2::boolean)) AS projects_pending`,
      [instructorId, admin]
    );
    const { rows: labs } = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM labs l JOIN courses c ON c.id = l.course_id
            WHERE c.instructor_id = $1 OR $2::boolean) AS labs,
         (SELECT COUNT(*)::int FROM labs l JOIN courses c ON c.id = l.course_id
            WHERE (c.instructor_id = $1 OR $2::boolean) AND l.status = 'published') AS published_labs,
         (SELECT COUNT(*)::int FROM lab_sessions s JOIN labs l ON l.id = s.lab_id
            LEFT JOIN courses c ON c.id = l.course_id WHERE c.instructor_id = $1 OR $2::boolean) AS sessions,
         (SELECT COUNT(*)::int FROM screenshots sc JOIN lab_sessions s ON s.id = sc.session_id
            JOIN labs l ON l.id = s.lab_id LEFT JOIN courses c ON c.id = l.course_id
            WHERE c.instructor_id = $1 OR $2::boolean) AS screenshots,
         (SELECT COUNT(*)::int FROM lab_submissions s
            WHERE (s.instructor_id = $1 OR $2::boolean) AND s.status = 'approved') AS lab_submissions_approved,
         (SELECT COUNT(*)::int FROM student_projects p
            WHERE (p.instructor_id = $1 OR $2::boolean) AND p.status = 'approved') AS projects_approved,
         (SELECT COUNT(*)::int FROM announcements an
            WHERE an.author_id = $1 OR $2::boolean) AS announcements`,
      [instructorId, admin]
    );
    const { rows: inbox } = await query(
      `SELECT COUNT(*)::int AS unread_messages,
              COUNT(DISTINCT m.conversation_id)::int AS unread_threads
       FROM messages m JOIN conversations cv ON cv.id = m.conversation_id
       WHERE (cv.instructor_id = $1 OR $2::boolean) AND m.sender_id <> $1 AND m.read_at IS NULL`,
      [instructorId, admin]
    );
    const { rows: recentSubmissions } = await query(
      `SELECT s.id, s.status, s.submitted_at, s.reviewed_at, s.student_note,
              s.lab_id, s.session_id, l.title AS lab_title,
              u.id AS student_id, u.full_name AS student_name, u.avatar_url,
              c.title AS course_title
       FROM lab_submissions s
       JOIN labs l ON l.id = s.lab_id
       LEFT JOIN courses c ON c.id = s.course_id
       JOIN users u ON u.id = s.user_id
       WHERE s.instructor_id = $1 OR $2::boolean
       ORDER BY s.submitted_at DESC LIMIT 5`,
      [instructorId, admin]
    );
    const { rows: recentProjects } = await query(
      `SELECT p.id, p.title, p.status, p.submitted_at, p.reviewed_at,
              u.id AS student_id, u.full_name AS student_name, u.avatar_url,
              c.title AS course_title
       FROM student_projects p
       JOIN users u ON u.id = p.user_id
       LEFT JOIN courses c ON c.id = p.course_id
       WHERE p.instructor_id = $1 OR $2::boolean
       ORDER BY p.submitted_at DESC LIMIT 5`,
      [instructorId, admin]
    );
    const { rows: recentReports } = await query(
      `SELECT r.id, r.title, r.status, r.updated_at,
              u.id AS student_id, u.full_name AS student_name, u.avatar_url,
              l.title AS lab_title, c.title AS course_title
       FROM reports r
       JOIN labs l ON l.id = r.lab_id
       LEFT JOIN courses c ON c.id = l.course_id
       JOIN users u ON u.id = r.user_id
       WHERE COALESCE(c.instructor_id, l.created_by) = $1 OR $2::boolean
       ORDER BY r.updated_at DESC LIMIT 5`,
      [instructorId, admin]
    );
    res.json({
      courses: courses[0],
      students: students[0],
      pending: pending[0],
      labs: labs[0],
      inbox: inbox[0],
      recentSubmissions,
      recentProjects,
      recentReports,
    });
  })
);

export default router;
