import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import crypto from 'node:crypto';
import { z } from 'zod';
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  listProjects,
  getProject,
  getProjectAttachment,
  createProject,
  updateProject,
  reviewProject,
  acknowledgeProject,
  deleteProject,
  projectStats,
} from '../services/projects.js';
import { canAccessProject, canReviewProject, isAdmin } from '../services/access.js';

/**
 * Student projects (capstone / portfolio uploads).
 *
 * Students own and revise their projects, the instructor of the linked course
 * reviews them, and administrators keep a read-only record plus an
 * acknowledgement stamp. Authorization is always resolved from the stored row.
 */

const router = Router();

const PRIVATE_UPLOAD_DIR = path.resolve(process.cwd(), 'private-uploads', 'projects');
fs.mkdirSync(PRIVATE_UPLOAD_DIR, { recursive: true });

const PROJECT_MAX_BYTES = 25 * 1024 * 1024;
const PROJECT_MIME = [
  'application/pdf',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-7z-compressed',
  'application/gzip',
  'application/x-tar',
  'text/plain',
  'text/markdown',
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, PRIVATE_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
      cb(null, `project-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext || '.bin'}`);
    },
  }),
  limits: { fileSize: PROJECT_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!PROJECT_MIME.includes(file.mimetype)) {
      return cb(new Error('Attach a PDF, ZIP, archive, image, text or Office document.'));
    }
    cb(null, true);
  },
});

const uploadMiddleware = (req, res, next) => {
  upload.single('file')(req, res, (error) => {
    if (error) return next(badRequest(error.message));
    next();
  });
};

function projectId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid project id.');
  return id;
}

function resolveAttachmentFile(attachmentPath) {
  if (!attachmentPath) return null;
  const name = path.basename(attachmentPath);
  const filePath = path.join(PRIVATE_UPLOAD_DIR, name);
  if (!filePath.startsWith(PRIVATE_UPLOAD_DIR) || !fs.existsSync(filePath)) return null;
  return { filePath, name };
}

function uploadFile(file) {
  if (!file) return null;
  return {
    path: `/private-uploads/projects/${file.filename}`,
    name: file.originalname,
    mime: file.mimetype,
    size: file.size,
  };
}

const projectSchema = z.object({
  title: z.string().trim().min(3, 'Give the project a title with at least 3 characters.').max(200),
  description: z.string().trim().max(20000).default(''),
  repoUrl: z
    .string()
    .trim()
    .max(500)
    .refine(
      (value) => !value || /^https?:\/\/.+/i.test(value),
      'Repository link must start with http:// or https://'
    )
    .optional()
    .default(''),
  studentNote: z.string().trim().max(5000).default(''),
  courseId: z.coerce.number().int().positive().optional().nullable(),
});

const projectUpdateSchema = projectSchema.partial();

// ---------- stats & lists ----------

router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ stats: await projectStats(req.user) });
  })
);

router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = z
      .object({
        status: z.enum(['all', 'draft', 'submitted', 'changes_requested', 'approved']).optional(),
        courseId: z.coerce.number().int().positive().optional(),
        search: z.string().trim().max(120).optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(60).default(20),
      })
      .safeParse(req.query);
    if (!parsed.success) throw badRequest('Invalid query parameters.');

    const { status, courseId, search, page, limit } = parsed.data;
    const result = await listProjects({ user: req.user, status, courseId, search, page, limit });
    res.json(result);
  })
);

// ---------- create / update ----------

router.post(
  '/',
  requireRole('student'),
  uploadMiddleware,
  asyncHandler(async (req, res) => {
    const parsed = projectSchema.safeParse(req.body);
    if (!parsed.success) {
      if (req.file) fs.unlink(req.file.path, () => {});
      throw badRequest(parsed.error.issues[0]?.message || 'Invalid project details.');
    }
    try {
      const project = await createProject({
        user: req.user,
        ...parsed.data,
        file: uploadFile(req.file),
      });
      res.status(201).json({ project });
    } catch (error) {
      if (req.file) fs.unlink(req.file.path, () => {});
      throw error;
    }
  })
);

// ---------- detail & attachment ----------

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const project = await getProject(projectId(req.params.id));
    if (!canAccessProject(req.user, project)) {
      throw forbidden('You do not have access to this project.');
    }
    res.json({
      project,
      can_review: canReviewProject(req.user, project),
      is_owner: project.user_id === req.user.id,
    });
  })
);

router.get(
  '/:id/attachment',
  requireAuth,
  asyncHandler(async (req, res) => {
    const project = await getProject(projectId(req.params.id));
    if (!canAccessProject(req.user, project)) {
      throw forbidden('You do not have access to this project.');
    }
    const file = await getProjectAttachment(project.id);
    if (!file?.attachment_path) throw notFound('This project has no attachment.');
    const resolved = resolveAttachmentFile(file.attachment_path);
    if (!resolved) throw notFound('The attachment file is no longer available.');
    res.download(resolved.filePath, file.attachment_name || resolved.name);
  })
);

router.put(
  '/:id',
  requireRole('student'),
  uploadMiddleware,
  asyncHandler(async (req, res) => {
    const project = await getProject(projectId(req.params.id));
    if (project.user_id !== req.user.id) {
      throw forbidden('This project belongs to another student.');
    }
    const parsed = projectUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      if (req.file) fs.unlink(req.file.path, () => {});
      throw badRequest(parsed.error.issues[0]?.message || 'Invalid project details.');
    }
    const body = parsed.data;
    try {
      const updated = await updateProject({
        project,
        user: req.user,
        title: body.title ?? project.title,
        description: body.description ?? project.description,
        repoUrl: body.repoUrl ?? project.repo_url ?? '',
        studentNote: body.studentNote ?? project.student_note ?? '',
        courseId: 'courseId' in body ? body.courseId ?? null : undefined,
        file: uploadFile(req.file),
      });
      res.json({ project: updated });
    } catch (error) {
      if (req.file) fs.unlink(req.file.path, () => {});
      throw error;
    }
  })
);

// ---------- review (instructor of the course, or admin) ----------

router.post(
  '/:id/review',
  requireRole('admin', 'instructor'),
  validateBody(
    z.object({
      status: z.enum(['approved', 'changes_requested']),
      feedback: z.string().trim().max(5000).default(''),
    })
  ),
  asyncHandler(async (req, res) => {
    const project = await getProject(projectId(req.params.id));
    if (!canReviewProject(req.user, project)) {
      throw forbidden('Only the instructor of this project can review it.');
    }
    if (project.status === 'approved') {
      throw conflict('This project is already approved.');
    }
    const updated = await reviewProject({
      project,
      reviewer: req.user,
      status: req.body.status,
      feedback: req.body.feedback,
    });
    res.json({ project: updated });
  })
);

// ---------- admin record ----------

router.post(
  '/:id/acknowledge',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    if (!isAdmin(req.user)) throw forbidden('Administrators only.');
    const project = await getProject(projectId(req.params.id));
    const updated = await acknowledgeProject(project.id, req.user.id);
    res.json({ project: updated });
  })
);

// ---------- delete ----------

router.delete(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const project = await getProject(projectId(req.params.id));
    await deleteProject({ project, user: req.user });
    res.json({ ok: true });
  })
);

export default router;
