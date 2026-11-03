import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../config/db.js';
import { asyncHandler, badRequest, conflict, notFound } from '../utils/errors.js';
import { validateBody } from '../middleware/validate.js';
import { requireRole, isStaff } from '../middleware/auth.js';
import { assertPostManager, canManagePost } from '../services/access.js';
import { notify, recordActivity } from '../utils/activity.js';
import { slugify } from '../utils/helpers.js';

const router = Router();

const postSchema = z.object({
    title: z.string().trim().min(3).max(240),
    excerpt: z.string().trim().max(400).default(''),
    content: z.string().trim().min(1).max(200000),
    coverImage: z.string().trim().max(500).optional().nullable(),
    tags: z.array(z.string().trim().max(40)).max(10).default([]),
    status: z.enum(['draft', 'published']).default('draft'),
});

function uniquePostSlug(base) {
    return `${slugify(base, 'article')}-${Math.random().toString(36).slice(2, 6)}`;
}

// ---------- public ----------

router.get(
    '/',
    asyncHandler(async(req, res) => {
        const parsed = z
            .object({
                search: z.string().trim().max(160).optional(),
                tag: z.string().trim().max(40).optional(),
                status: z.enum(['draft', 'published']).optional(),
                page: z.coerce.number().int().min(1).default(1),
                limit: z.coerce.number().int().min(1).max(48).default(9),
            })
            .safeParse(req.query);
        if (!parsed.success) throw badRequest('Invalid query parameters.');
        const { search, tag, status, page, limit } = parsed.data;

        const where = [];
        const params = [];
        const staffView = isStaff(req.user) && status;
        if (!staffView) where.push(`p.status = 'published'`);
        else {
            params.push(status);
            where.push(`p.status = $${params.length}`);
        }
        // Instructors only manage their own articles and articles derived from
        // reports in their courses. Public listings stay unrestricted above.
        if (staffView && req.user.role === 'instructor') {
            params.push(req.user.id);
            where.push(`(p.author_id = $${params.length} OR (
        p.source_report_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM reports r
          JOIN labs l ON l.id = r.lab_id
          LEFT JOIN courses c ON c.id = l.course_id
          WHERE r.id = p.source_report_id
            AND COALESCE(c.instructor_id, l.created_by) = $${params.length}
        )
      ))`);
        }
        if (search) {
            params.push(`%${search}%`);
            where.push(`(p.title ILIKE $${params.length} OR p.excerpt ILIKE $${params.length} OR p.content ILIKE $${params.length})`);
        }
        if (tag) {
            params.push(tag);
            where.push(`$${params.length} = ANY(p.tags)`);
        }
        const whereSql = `WHERE ${where.join(' AND ')}`;

        const { rows: countRows } = await query(`SELECT COUNT(*)::int AS total FROM posts p ${whereSql}`, params);
        const offset = (page - 1) * limit;
        const paginatedParams = [...params, limit, offset];
        const { rows } = await query(
            `SELECT p.id, p.slug, p.title, p.excerpt, p.cover_image, p.tags, p.status, p.view_count,
         p.published_at, p.created_at,
         u.full_name AS author_name, u.avatar_url AS author_avatar,
         r.id AS report_id, r.status AS report_status
       FROM posts p
       LEFT JOIN users u ON u.id = p.author_id
       LEFT JOIN reports r ON r.id = p.source_report_id
       ${whereSql}
       ORDER BY p.published_at DESC NULLS LAST, p.created_at DESC
       LIMIT $${paginatedParams.length - 1} OFFSET $${paginatedParams.length}`,
            paginatedParams
        );
        const { rows: tagRows } = await query(
            `SELECT unnest(tags) AS tag, COUNT(*)::int AS count FROM posts WHERE status = 'published' GROUP BY tag ORDER BY count DESC`
        );
        res.json({ posts: rows, total: countRows[0].total, page, limit, tags: tagRows });
    })
);

router.get(
    '/:slug',
    asyncHandler(async(req, res) => {
        const { rows } = await query(
            `SELECT p.*, u.full_name AS author_name, u.avatar_url AS author_avatar, u.headline AS author_headline,
         r.id AS report_id, r.status AS report_status, r.lab_id,
         l.title AS lab_title
       FROM posts p
       LEFT JOIN users u ON u.id = p.author_id
       LEFT JOIN reports r ON r.id = p.source_report_id
       LEFT JOIN labs l ON l.id = r.lab_id
       WHERE p.slug = $1`, [req.params.slug]
        );
        const post = rows[0];
        if (!post) throw notFound('Article not found.');
        if (post.status !== 'published' && !(await canManagePost(req.user, post))) {
            throw notFound('Article not found.');
        }

        if (post.status === 'published') {
            await query('UPDATE posts SET view_count = view_count + 1 WHERE id = $1', [post.id]);
        }

        const { rows: related } = await query(
            `SELECT slug, title, excerpt, cover_image, published_at FROM posts
       WHERE status = 'published' AND id <> $1
       ORDER BY published_at DESC LIMIT 3`, [post.id]
        );
        res.json({ post: {...post, view_count: post.view_count + (post.status === 'published' ? 1 : 0) }, related });
    })
);

// ---------- staff ----------

router.post(
    '/',
    requireRole('admin', 'instructor'),
    validateBody(postSchema),
    asyncHandler(async(req, res) => {
        const b = req.body;
        const { rows: dup } = await query('SELECT id FROM posts WHERE slug = $1', [uniquePostSlug(b.title)]);
        if (dup[0]) throw conflict('Slug collision, please retry.');
        const slug = uniquePostSlug(b.title);
        const { rows } = await query(
            `INSERT INTO posts (slug, title, excerpt, content, cover_image, author_id, status, tags, published_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, slug, title, status, tags, published_at, created_at`, [slug, b.title, b.excerpt || b.content.replace(/[#*`>\[\]!]/g, '').slice(0, 350), b.content,
                b.coverImage ?? null, req.user.id, b.status, b.tags, b.status === 'published' ? new Date() : null
            ]
        );
        res.status(201).json({ post: rows[0] });
    })
);

router.put(
    '/:id',
    requireRole('admin', 'instructor'),
    validateBody(postSchema.partial()),
    asyncHandler(async(req, res) => {
        const { rows } = await query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
        const post = rows[0];
        if (!post) throw notFound('Article not found.');
        await assertPostManager(req.user, post);
        const b = req.body;
        const { rows: updated } = await query(
            `UPDATE posts SET
         title = COALESCE($1, title),
         excerpt = COALESCE($2, excerpt),
         content = COALESCE($3, content),
         cover_image = COALESCE($4, cover_image),
         tags = COALESCE($5, tags),
         status = COALESCE($6, status),
         published_at = COALESCE(published_at, $8)
       WHERE id = $7
    RETURNING id, slug, title, excerpt, content, tags, status, published_at, created_at`, [b.title ?? null, b.excerpt ?? null, b.content ?? null, b.coverImage ?? null,
                b.tags ?? null, b.status ?? null, post.id,
                b.status === 'published' && post.published_at == null ? new Date() : null
            ]
        );
        res.json({ post: updated[0] });
    })
);

router.post(
    '/:id/status',
    requireRole('admin', 'instructor'),
    validateBody(z.object({ status: z.enum(['draft', 'published']) })),
    asyncHandler(async(req, res) => {
        const { rows } = await query('SELECT * FROM posts WHERE id = $1', [req.params.id]);
        const post = rows[0];
        if (!post) throw notFound('Article not found.');
        await assertPostManager(req.user, post);
        const publishing = req.body.status === 'published';
        const { rows: updated } = await query(
            `UPDATE posts SET status = $1, published_at = COALESCE(published_at, $3)
       WHERE id = $2 RETURNING id, slug, title, status, published_at`, [req.body.status, post.id, publishing ? new Date() : null]
        );

        if (publishing && post.source_report_id) {
            const { rows: reportRows } = await query(
                'SELECT id, user_id, title, status FROM reports WHERE id = $1', [post.source_report_id]
            );
            const report = reportRows[0];
            if (report) {
                await query(`UPDATE reports SET status = 'published', updated_at = now() WHERE id = $1`, [report.id]);
                await withTransaction(async(client) => {
                    await notify(client, {
                        userIds: [report.user_id],
                        type: 'blog',
                        title: 'Your report is live on the CyberITA+ blog!',
                        body: `"${updated[0].title}" was published as a technical article.`,
                        link: `/blog/${updated[0].slug}`,
                    });
                    await recordActivity(client, {
                        userId: req.user.id,
                        action: 'report.published',
                        entityType: 'report',
                        entityId: report.id,
                        metadata: { slug: updated[0].slug, studentId: report.user_id },
                    });
                });
            }
        }

        res.json({ post: updated[0] });
    })
);

router.delete(
    '/:id',
    requireRole('admin'),
    asyncHandler(async(req, res) => {
        const { rowCount } = await query('DELETE FROM posts WHERE id = $1', [req.params.id]);
        if (rowCount === 0) throw notFound('Article not found.');
        res.json({ ok: true });
    })
);

export default router;