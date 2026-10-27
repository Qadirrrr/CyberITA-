import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { z } from 'zod';
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { validateBody } from '../middleware/validate.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  listLabSubmissions,
  getLabSubmission,
  getSubmissionAttachment,
  reviewLabSubmission,
  acknowledgeLabSubmission,
  submissionStats,
} from '../services/labSubmissions.js';
import {
  canAccessLabSubmission,
  canReviewLabSubmission,
  isAdmin,
} from '../services/access.js';

/**
 * Lab submissions: completed lab sessions.
 *
 * Students see their own submissions, the instructor of the lab's course
 * reviews them, and administrators keep a read-only record plus an
 * acknowledgement stamp. Authorization is always resolved on the server from
 * the stored row, never from the role alone.
 */

const router = Router();

const PRIVATE_UPLOAD_DIR = path.resolve(process.cwd(), 'private-uploads', 'lab-submissions');
fs.mkdirSync(PRIVATE_UPLOAD_DIR, { recursive: true });

function submissionId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest('Invalid submission id.');
  return id;
}

function resolveAttachmentFile(attachmentPath) {
  if (!attachmentPath) return null;
  const name = path.basename(attachmentPath);
  const filePath = path.join(PRIVATE_UPLOAD_DIR, name);
  if (!filePath.startsWith(PRIVATE_UPLOAD_DIR) || !fs.existsSync(filePath)) return null;
  return { filePath, name };
}

// ---------- lists ----------

router.get(
  '/stats',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ stats: await submissionStats(req.user) });
  })
);

router.get(
  '/',
  requireAuth,
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
    res.json(result);
  })
);

// ---------- detail ----------

router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const submission = await getLabSubmission(submissionId(req.params.id));
    if (!canAccessLabSubmission(req.user, submission)) {
      throw forbidden('You do not have access to this lab submission.');
    }
    res.json({
      submission,
      can_review: canReviewLabSubmission(req.user, submission),
    });
  })
);

router.get(
  '/:id/attachment',
  requireAuth,
  asyncHandler(async (req, res) => {
    const submission = await getLabSubmission(submissionId(req.params.id));
    if (!canAccessLabSubmission(req.user, submission)) {
      throw forbidden('You do not have access to this lab submission.');
    }
    const file = await getSubmissionAttachment(submission.id);
    if (!file?.attachment_path) throw notFound('This submission has no attachment.');
    const resolved = resolveAttachmentFile(file.attachment_path);
    if (!resolved) throw notFound('The attachment file is no longer available.');
    res.download(resolved.filePath, file.attachment_name || resolved.name);
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
    const submission = await getLabSubmission(submissionId(req.params.id));
    if (!canReviewLabSubmission(req.user, submission)) {
      throw forbidden('Only the instructor of this lab can review the submission.');
    }
    if (submission.status === 'approved') {
      throw conflict('This submission is already approved.');
    }
    const updated = await reviewLabSubmission({
      submission,
      reviewer: req.user,
      status: req.body.status,
      feedback: req.body.feedback,
    });
    res.json({ submission: updated });
  })
);

// ---------- admin record ----------

router.post(
  '/:id/acknowledge',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const submission = await getLabSubmission(submissionId(req.params.id));
    const updated = await acknowledgeLabSubmission(submission.id, req.user.id);
    res.json({ submission: updated });
  })
);

// ---------- platform-wide record for admins ----------

router.get(
  '/record/overview',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    if (!isAdmin(req.user)) throw forbidden('Administrators only.');
    const stats = await submissionStats(req.user);
    res.json({ stats });
  })
);

export default router;
