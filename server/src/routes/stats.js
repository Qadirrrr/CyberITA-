import { Router } from 'express';
import { query } from '../config/db.js';
import logger from '../config/logger.js';
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
    let projectStats = { total: 0, pending: 0, changes_requested: 0, approved: 0 };
    try {
      const { rows: projects } = await query(
        `SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'submitted')::int AS pending,
           COUNT(*) FILTER (WHERE status = 'changes_requested')::int AS changes_requested,
           COUNT(*) FILTER (WHERE status = 'approved')::int AS approved
         FROM student_projects WHERE user_id = $1`,
        [userId]
      );
      if (projects[0]) projectStats = projects[0];
    } catch {
      // student_projects table may not exist yet
    }
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
      projects: projectStats,
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
    let usersData = { total: 0, students: 0, instructors: 0, admins: 0, new_this_week: 0 };
    try {
      const { rows: u } = await query(
        `SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE role = 'student')::int AS students,
           COUNT(*) FILTER (WHERE role = 'instructor')::int AS instructors,
           COUNT(*) FILTER (WHERE role = 'admin')::int AS admins,
           COUNT(*) FILTER (WHERE created_at > now() - INTERVAL '7 days')::int AS new_this_week
         FROM users`
      );
      if (u[0]) usersData = u[0];
    } catch (err) {
      logger.warn('Failed to query users stats for admin overview:', { error: err.message });
    }

    let coursesData = { total: 0, published: 0, drafts: 0 };
    try {
      const { rows: c } = await query(
        `SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'published')::int AS published,
           COUNT(*) FILTER (WHERE status = 'draft')::int AS drafts
         FROM courses`
      );
      if (c[0]) coursesData = c[0];
    } catch (err) {
      logger.warn('Failed to query courses stats for admin overview:', { error: err.message });
    }

    let enrollmentsData = { total: 0, active: 0, completed: 0, dropped: 0, avg_progress: 0 };
    try {
      const { rows: e } = await query(
        `SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'active')::int AS active,
           COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
           COUNT(*) FILTER (WHERE status = 'dropped')::int AS dropped,
           COALESCE(ROUND(AVG(progress_percent), 1), 0) AS avg_progress
         FROM enrollments`
      );
      if (e[0]) enrollmentsData = e[0];
    } catch (err) {
      logger.warn('Failed to query enrollments stats for admin overview:', { error: err.message });
    }

    let labsData = { labs: 0, sessions: 0, completed_sessions: 0, screenshots: 0, steps_completed: 0 };
    try {
      const { rows: l } = await query(
        `SELECT (SELECT COUNT(*)::int FROM labs) AS labs,
           (SELECT COUNT(*)::int FROM lab_sessions) AS sessions,
           (SELECT COUNT(*)::int FROM lab_sessions WHERE status = 'stopped') AS completed_sessions,
           (SELECT COUNT(*)::int FROM screenshots) AS screenshots,
           (SELECT COUNT(*)::int FROM lab_step_progress) AS steps_completed`
      );
      if (l[0]) labsData = l[0];
    } catch (err) {
      logger.warn('Failed to query labs stats for admin overview:', { error: err.message });
    }

    let contentData = { reports: 0, reports_pending: 0, posts: 0, certificates: 0, new_messages: 0 };
    try {
      const { rows: cnt } = await query(
        `SELECT (SELECT COUNT(*)::int FROM reports) AS reports,
           (SELECT COUNT(*)::int FROM reports WHERE status = 'submitted') AS reports_pending,
           (SELECT COUNT(*)::int FROM posts WHERE status = 'published') AS posts,
           (SELECT COUNT(*)::int FROM certificates) AS certificates,
           (SELECT COUNT(*)::int FROM contact_messages WHERE status = 'new') AS new_messages`
      );
      if (cnt[0]) contentData = cnt[0];
    } catch (err) {
      logger.warn('Failed to query content stats for admin overview:', { error: err.message });
    }

    let adminProjectsPending = 0;
    try {
      const { rows: pp } = await query(`SELECT COUNT(*)::int AS count FROM student_projects WHERE status = 'submitted'`);
      adminProjectsPending = pp[0]?.count ?? 0;
    } catch {}

    let operationsData = {
      active_labs: 0,
      provisioning_labs: 0,
      failed_labs: 0,
      lab_submissions_pending: 0,
      projects_pending: adminProjectsPending,
      reports_pending: 0,
      content_flags_open: 0,
      active_sessions: 0,
    };

    try {
      const { rows: op } = await query(
        `SELECT
           (SELECT COUNT(*)::int FROM lab_sessions WHERE status = 'running') AS active_labs,
           (SELECT COUNT(*)::int FROM lab_sessions WHERE status = 'provisioning') AS provisioning_labs,
           (SELECT COUNT(*)::int FROM lab_sessions WHERE status = 'error') AS failed_labs,
           (SELECT COUNT(*)::int FROM reports WHERE status = 'submitted') AS reports_pending,
           (SELECT COUNT(*)::int FROM refresh_tokens WHERE expires_at > now()) AS active_sessions`
      );
      if (op[0]) operationsData = { ...operationsData, ...op[0] };
    } catch (err) {
      logger.warn('Failed to query core operations stats:', { error: err.message });
    }

    try {
      const { rows: sub } = await query(
        `SELECT COUNT(*)::int AS count FROM lab_submissions WHERE status = 'submitted'`
      );
      operationsData.lab_submissions_pending = sub[0]?.count ?? 0;
    } catch {}

    try {
      const { rows: cr } = await query(
        `SELECT COUNT(*)::int AS count FROM content_reports WHERE status IN ('open', 'reviewing')`
      );
      operationsData.content_flags_open = cr[0]?.count ?? 0;
    } catch {}

    let catalogData = {
      learning_paths: 0,
      published_paths: 0,
      categories: 0,
      announcements: 0,
      labs: 0,
      published_labs: 0,
    };
    try {
      const { rows: cat } = await query(
        `SELECT
           (SELECT COUNT(DISTINCT category)::int FROM courses WHERE category IS NOT NULL AND category <> '') AS categories,
           (SELECT COUNT(*)::int FROM labs) AS labs,
           (SELECT COUNT(*)::int FROM labs WHERE status = 'published') AS published_labs`
      );
      if (cat[0]) catalogData = { ...catalogData, ...cat[0] };
    } catch (err) {
      logger.warn('Failed to query core catalog stats:', { error: err.message });
    }

    try {
      const { rows: lp } = await query(
        `SELECT (SELECT COUNT(*)::int FROM learning_paths) AS learning_paths,
                (SELECT COUNT(*)::int FROM learning_paths WHERE status = 'published') AS published_paths`
      );
      if (lp[0]) catalogData = { ...catalogData, ...lp[0] };
    } catch {}

    try {
      const { rows: an } = await query(
        `SELECT COUNT(*)::int AS count FROM announcements`
      );
      catalogData.announcements = an[0]?.count ?? 0;
    } catch {}

    let activitySeries = [];
    try {
      const { rows } = await query(
        `SELECT date_trunc('week', created_at)::date AS week, COUNT(*)::int AS count
         FROM activity_events WHERE created_at > now() - INTERVAL '12 weeks'
         GROUP BY 1 ORDER BY 1`
      );
      activitySeries = rows;
    } catch (err) {
      logger.warn('Failed to query activity series:', { error: err.message });
    }

    let recentActivity = [];
    try {
      const { rows } = await query(
        `SELECT a.id, a.action, a.entity_type, a.entity_id, a.created_at,
                u.id AS user_id, u.full_name AS user_name, u.role AS user_role
         FROM activity_events a LEFT JOIN users u ON u.id = a.user_id
         ORDER BY a.created_at DESC LIMIT 8`
      );
      recentActivity = rows;
    } catch (err) {
      logger.warn('Failed to query recent activity:', { error: err.message });
    }

    let projectsTotal = 0;
    let projectsApproved = 0;
    try {
      const { rows: prj } = await query(
        `SELECT (SELECT COUNT(*)::int FROM student_projects) AS total,
                (SELECT COUNT(*)::int FROM student_projects WHERE status = 'approved') AS approved`
      );
      projectsTotal = prj[0]?.total ?? 0;
      projectsApproved = prj[0]?.approved ?? 0;
    } catch {}

    let reviewQualityData = {
      lab_submissions_total: 0,
      lab_submissions_approved: 0,
      projects_total: projectsTotal,
      projects_approved: projectsApproved,
    };
    try {
      const { rows: rq } = await query(
        `SELECT
           (SELECT COUNT(*)::int FROM lab_submissions) AS lab_submissions_total,
           (SELECT COUNT(*)::int FROM lab_submissions WHERE status = 'approved') AS lab_submissions_approved`
      );
      if (rq[0]) reviewQualityData = { ...reviewQualityData, ...rq[0] };
    } catch {}

    let signupSeries = [];
    try {
      const { rows } = await query(
        `SELECT date_trunc('week', created_at)::date AS week, COUNT(*)::int AS count
         FROM users WHERE created_at > now() - INTERVAL '12 weeks'
         GROUP BY 1 ORDER BY 1`
      );
      signupSeries = rows;
    } catch (err) {
      logger.warn('Failed to query signup series:', { error: err.message });
    }

    let enrollmentSeries = [];
    try {
      const { rows } = await query(
        `SELECT date_trunc('week', enrolled_at)::date AS week, COUNT(*)::int AS count
         FROM enrollments WHERE enrolled_at > now() - INTERVAL '12 weeks'
         GROUP BY 1 ORDER BY 1`
      );
      enrollmentSeries = rows;
    } catch (err) {
      logger.warn('Failed to query enrollment series:', { error: err.message });
    }

    let topCourses = [];
    try {
      const { rows } = await query(
        `SELECT c.id, c.title, c.slug, c.status,
           COUNT(e.id)::int AS enrollments,
           COUNT(e.id) FILTER (WHERE e.status = 'completed')::int AS completions,
           COALESCE(ROUND(AVG(e.progress_percent), 1), 0) AS avg_progress
         FROM courses c LEFT JOIN enrollments e ON e.course_id = c.id
         GROUP BY c.id
         ORDER BY enrollments DESC, c.created_at DESC
         LIMIT 6`
      );
      topCourses = rows;
    } catch (err) {
      logger.warn('Failed to query top courses:', { error: err.message });
    }

    let recentUsers = [];
    try {
      const { rows } = await query(
        `SELECT id, email, full_name, role, created_at, last_login_at
         FROM users ORDER BY created_at DESC LIMIT 6`
      );
      recentUsers = rows;
    } catch (err) {
      logger.warn('Failed to query recent users:', { error: err.message });
    }

    let engagementData = { active_learners_7d: 0 };
    try {
      const { rows } = await query(
        `SELECT COUNT(DISTINCT a.user_id)::int AS active_learners_7d
         FROM activity_events a JOIN users u ON u.id = a.user_id
         WHERE a.created_at > now() - INTERVAL '7 days' AND u.role = 'student'`
      );
      if (rows[0]) engagementData = rows[0];
    } catch (err) {
      logger.warn('Failed to query engagement:', { error: err.message });
    }

    res.json({
      users: usersData,
      courses: coursesData,
      enrollments: enrollmentsData,
      labs: labsData,
      content: contentData,
      operations: operationsData,
      catalog: catalogData,
      signupSeries,
      enrollmentSeries,
      activitySeries,
      recentActivity,
      reviewQuality: reviewQualityData,
      topCourses,
      recentUsers,
      engagement: engagementData,
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
    let pendingData = {
      reports_pending: 0,
      lab_submissions_pending: 0,
      lab_changes_requested: 0,
      projects_pending: 0,
    };
    try {
      const { rows: rep } = await query(
        `SELECT COUNT(*)::int AS reports_pending FROM reports r JOIN labs l ON l.id = r.lab_id
         LEFT JOIN courses c2 ON c2.id = l.course_id
         WHERE r.status = 'submitted' AND (COALESCE(c2.instructor_id, l.created_by) = $1 OR $2::boolean)`,
        [instructorId, admin]
      );
      if (rep[0]) pendingData.reports_pending = rep[0].reports_pending;
    } catch {}

    try {
      const { rows: sub } = await query(
        `SELECT
           COUNT(*) FILTER (WHERE s.status = 'submitted')::int AS lab_submissions_pending,
           COUNT(*) FILTER (WHERE s.status = 'changes_requested')::int AS lab_changes_requested
         FROM lab_submissions s WHERE (s.instructor_id = $1 OR $2::boolean)`,
        [instructorId, admin]
      );
      if (sub[0]) {
        pendingData.lab_submissions_pending = sub[0].lab_submissions_pending || 0;
        pendingData.lab_changes_requested = sub[0].lab_changes_requested || 0;
      }
    } catch {}

    let instructorProjectsPending = 0;
    let instructorProjectsApproved = 0;
    let recentProjects = [];
    try {
      const { rows: pp } = await query(
        `SELECT COUNT(*)::int AS count FROM student_projects p
         WHERE p.status = 'submitted' AND (p.instructor_id = $1 OR $2::boolean)`,
        [instructorId, admin]
      );
      instructorProjectsPending = pp[0]?.count ?? 0;

      const { rows: pa } = await query(
        `SELECT COUNT(*)::int AS count FROM student_projects p
         WHERE (p.instructor_id = $1 OR $2::boolean) AND p.status = 'approved'`,
        [instructorId, admin]
      );
      instructorProjectsApproved = pa[0]?.count ?? 0;

      const { rows: rp } = await query(
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
      recentProjects = rp;
    } catch {
      // student_projects table might not exist yet if migration 019 has not run
    }

    pendingData.projects_pending = instructorProjectsPending;

    let labsData = {
      labs: 0,
      published_labs: 0,
      sessions: 0,
      screenshots: 0,
      lab_submissions_approved: 0,
      projects_approved: instructorProjectsApproved,
      announcements: 0,
    };

    try {
      const { rows: coreLabs } = await query(
        `SELECT
           (SELECT COUNT(*)::int FROM labs l JOIN courses c ON c.id = l.course_id
              WHERE c.instructor_id = $1 OR $2::boolean) AS labs,
           (SELECT COUNT(*)::int FROM labs l JOIN courses c ON c.id = l.course_id
              WHERE (c.instructor_id = $1 OR $2::boolean) AND l.status = 'published') AS published_labs,
           (SELECT COUNT(*)::int FROM lab_sessions s JOIN labs l ON l.id = s.lab_id
              LEFT JOIN courses c ON c.id = l.course_id WHERE c.instructor_id = $1 OR $2::boolean) AS sessions,
           (SELECT COUNT(*)::int FROM screenshots sc JOIN lab_sessions s ON s.id = sc.session_id
              JOIN labs l ON l.id = s.lab_id LEFT JOIN courses c ON c.id = l.course_id
              WHERE c.instructor_id = $1 OR $2::boolean) AS screenshots`,
        [instructorId, admin]
      );
      if (coreLabs[0]) labsData = { ...labsData, ...coreLabs[0] };
    } catch {}

    try {
      const { rows: subAppr } = await query(
        `SELECT COUNT(*)::int AS count FROM lab_submissions s
         WHERE (s.instructor_id = $1 OR $2::boolean) AND s.status = 'approved'`,
        [instructorId, admin]
      );
      if (subAppr[0]) labsData.lab_submissions_approved = subAppr[0].count;
    } catch {}

    try {
      const { rows: an } = await query(
        `SELECT COUNT(*)::int AS count FROM announcements an
         WHERE an.author_id = $1 OR $2::boolean`,
        [instructorId, admin]
      );
      if (an[0]) labsData.announcements = an[0].count;
    } catch {}

    let inboxData = { unread_messages: 0, unread_threads: 0 };
    try {
      const { rows: inbox } = await query(
        `SELECT COUNT(*)::int AS unread_messages,
                COUNT(DISTINCT m.conversation_id)::int AS unread_threads
         FROM messages m JOIN conversations cv ON cv.id = m.conversation_id
         WHERE (cv.instructor_id = $1 OR $2::boolean) AND m.sender_id <> $1 AND m.read_at IS NULL`,
        [instructorId, admin]
      );
      if (inbox[0]) inboxData = inbox[0];
    } catch {}

    let recentSubmissions = [];
    try {
      const { rows: subs } = await query(
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
      recentSubmissions = subs;
    } catch {}

    let recentReports = [];
    try {
      const { rows: reps } = await query(
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
      recentReports = reps;
    } catch {}

    res.json({
      courses: courses[0] || { total: 0, published: 0 },
      students: students[0] || { learners: 0, enrollments: 0, avg_progress: 0 },
      pending: pendingData,
      labs: labsData,
      inbox: inboxData,
      recentSubmissions,
      recentProjects,
      recentReports,
    });
  })
);

export default router;
