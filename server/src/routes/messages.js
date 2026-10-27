import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import env from '../config/env.js';
import { query, withTransaction } from '../config/db.js';
import { asyncHandler, badRequest, forbidden, notFound } from '../utils/errors.js';
import { requireAuth } from '../middleware/auth.js';
import { notify, recordActivity } from '../utils/activity.js';
import { emitNotifications } from '../websocket/index.js';

const router = Router();

const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.txt', '.md', '.csv', '.zip', '.json', '.log',
  '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.xls', '.xlsx', '.ppt', '.pptx',
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
    cb(null, `msg-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext || '.bin'}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: env.upload.maxBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return cb(
        new Error(
          'Unsupported file type. Attach a PDF, Office document, text file, archive or image.'
        )
      );
    }
    return cb(null, true);
  },
});

const uploadMiddleware = (req, res, next) => {
  upload.single('file')(req, res, (error) => {
    if (error) return next(badRequest(error.message));
    return next();
  });
};

function removeUploadedFile(file) {
  if (!file?.path) return;
  fs.unlink(file.path, () => {});
}

function serializeConversation(row, currentUserId) {
  const isStudent = Number(row.student_id) === Number(currentUserId);
  const student = {
    id: row.student_id,
    full_name: row.student_name,
    email: row.student_email,
    avatar_url: row.student_avatar,
    headline: row.student_headline,
    role: 'student',
  };
  const instructor = {
    id: row.instructor_id,
    full_name: row.instructor_name,
    email: row.instructor_email,
    avatar_url: row.instructor_avatar,
    headline: row.instructor_headline,
    role: 'instructor',
  };
  return {
    id: row.id,
    subject: row.subject,
    course_id: row.course_id,
    course_title: row.course_title || null,
    course_slug: row.course_slug || null,
    created_at: row.created_at,
    last_message_at: row.last_message_at,
    peer: isStudent ? instructor : student,
    student,
    instructor,
    unread: Number(row.unread || 0),
    last_message: row.last_message_created_at
      ? {
          body: row.last_body,
          attachment_name: row.last_attachment_name,
          sender_id: row.last_sender_id,
          created_at: row.last_message_created_at,
        }
      : null,
  };
}

const CONVERSATION_SELECT = `cv.id, cv.subject, cv.course_id, cv.last_message_at, cv.created_at,
  s.id AS student_id, s.full_name AS student_name, s.email AS student_email,
  s.avatar_url AS student_avatar, s.headline AS student_headline,
  i.id AS instructor_id, i.full_name AS instructor_name, i.email AS instructor_email,
  i.avatar_url AS instructor_avatar, i.headline AS instructor_headline,
  co.title AS course_title, co.slug AS course_slug`;

const CONVERSATION_JOINS = `FROM conversations cv
  JOIN users s ON s.id = cv.student_id
  JOIN users i ON i.id = cv.instructor_id
  LEFT JOIN courses co ON co.id = cv.course_id`;

async function getConversationForUser(conversationId, user) {
  const { rows } = await query(
    `SELECT ${CONVERSATION_SELECT},
            COALESCE((SELECT COUNT(*)::int FROM messages m
              WHERE m.conversation_id = cv.id AND m.sender_id <> $2 AND m.read_at IS NULL), 0) AS unread
     ${CONVERSATION_JOINS}
     WHERE cv.id = $1`,
    [conversationId, user.id]
  );
  const conversation = rows[0];
  if (!conversation) throw notFound('Conversation not found.');
  const isParticipant =
    Number(conversation.student_id) === Number(user.id) ||
    Number(conversation.instructor_id) === Number(user.id);
  if (!isParticipant && user.role !== 'admin') {
    throw forbidden('You do not have access to this conversation.');
  }
  return conversation;
}

router.use(requireAuth);

/** People the current user can start a conversation with. */
router.get(
  '/contacts',
  asyncHandler(async (req, res) => {
    if (req.user.role === 'student') {
      const { rows } = await query(
        `SELECT u.id AS peer_id, u.full_name, u.email, u.avatar_url, u.headline, u.role,
                c.id AS course_id, c.title AS course_title,
                cv.id AS conversation_id
         FROM enrollments e
         JOIN courses c ON c.id = e.course_id
         JOIN users u ON u.id = c.instructor_id AND u.is_active = TRUE
         LEFT JOIN conversations cv ON cv.student_id = $1 AND cv.instructor_id = u.id
         WHERE e.user_id = $1 AND e.status <> 'dropped'
         ORDER BY u.full_name, c.title`,
        [req.user.id]
      );
      const contacts = new Map();
      for (const row of rows) {
        if (!contacts.has(row.peer_id)) {
          contacts.set(row.peer_id, {
            id: row.peer_id,
            full_name: row.full_name,
            email: row.email,
            avatar_url: row.avatar_url,
            headline: row.headline,
            role: row.role,
            conversation_id: row.conversation_id,
            courses: [],
          });
        }
        if (row.course_id) contacts.get(row.peer_id).courses.push({ id: row.course_id, title: row.course_title });
      }
      return res.json({ contacts: [...contacts.values()] });
    }

    if (req.user.role === 'instructor') {
      const { rows } = await query(
        `SELECT u.id AS peer_id, u.full_name, u.email, u.avatar_url, u.headline, u.role,
                c.id AS course_id, c.title AS course_title,
                cv.id AS conversation_id
         FROM courses c
         JOIN enrollments e ON e.course_id = c.id AND e.status <> 'dropped'
         JOIN users u ON u.id = e.user_id AND u.is_active = TRUE
         LEFT JOIN conversations cv ON cv.student_id = u.id AND cv.instructor_id = $1
         WHERE c.instructor_id = $1
         ORDER BY u.full_name, c.title`,
        [req.user.id]
      );
      const contacts = new Map();
      for (const row of rows) {
        if (!contacts.has(row.peer_id)) {
          contacts.set(row.peer_id, {
            id: row.peer_id,
            full_name: row.full_name,
            email: row.email,
            avatar_url: row.avatar_url,
            headline: row.headline,
            role: row.role,
            conversation_id: row.conversation_id,
            courses: [],
          });
        }
        if (row.course_id) contacts.get(row.peer_id).courses.push({ id: row.course_id, title: row.course_title });
      }
      return res.json({ contacts: [...contacts.values()] });
    }

    return res.json({ contacts: [] });
  })
);

/** Small endpoint used by the sidebar and dashboard badges. */
router.get(
  '/unread-count',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT COUNT(*)::int AS unread
       FROM messages m
       JOIN conversations cv ON cv.id = m.conversation_id
       WHERE (cv.student_id = $1 OR cv.instructor_id = $1)
         AND m.sender_id <> $1
         AND m.read_at IS NULL`,
      [req.user.id]
    );
    res.json({ unread: rows[0].unread });
  })
);

router.get(
  '/conversations',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT ${CONVERSATION_SELECT},
              COALESCE((SELECT COUNT(*)::int FROM messages m
                WHERE m.conversation_id = cv.id AND m.sender_id <> $1 AND m.read_at IS NULL), 0) AS unread,
              lm.body AS last_body,
              lm.attachment_name AS last_attachment_name,
              lm.sender_id AS last_sender_id,
              lm.created_at AS last_message_created_at
       ${CONVERSATION_JOINS}
       LEFT JOIN LATERAL (
         SELECT body, attachment_name, sender_id, created_at
         FROM messages
         WHERE conversation_id = cv.id
         ORDER BY id DESC
         LIMIT 1
       ) lm ON TRUE
       WHERE cv.student_id = $1 OR cv.instructor_id = $1
       ORDER BY COALESCE(cv.last_message_at, cv.created_at) DESC`,
      [req.user.id]
    );
    res.json({ conversations: rows.map((row) => serializeConversation(row, req.user.id)) });
  })
);

const createConversationSchema = z.object({
  peerId: z.coerce.number().int().positive(),
  courseId: z.coerce.number().int().positive().optional().nullable(),
  subject: z.string().trim().max(200).optional(),
});

router.post(
  '/conversations',
  asyncHandler(async (req, res) => {
    const parsed = createConversationSchema.safeParse(req.body ?? {});
    if (!parsed.success) throw badRequest('Choose a valid contact to start a conversation.');
    const { peerId, courseId, subject } = parsed.data;

    if (!['student', 'instructor'].includes(req.user.role)) {
      throw forbidden('Only students and instructors can use course chat.');
    }
    if (Number(peerId) === Number(req.user.id)) {
      throw badRequest('You cannot start a conversation with yourself.');
    }

    const { rows: peerRows } = await query(
      `SELECT id, full_name, role, is_active FROM users WHERE id = $1`,
      [peerId]
    );
    const peer = peerRows[0];
    if (!peer || !peer.is_active) throw notFound('Contact not found.');

    let studentId;
    let instructorId;
    let contextCourse = null;

    if (req.user.role === 'student') {
      if (peer.role !== 'instructor') throw badRequest('Students can message course instructors.');
      const { rows: courses } = await query(
        `SELECT e.course_id, c.title
         FROM enrollments e
         JOIN courses c ON c.id = e.course_id
         WHERE e.user_id = $1 AND e.status <> 'dropped' AND c.instructor_id = $2
           AND ($3::bigint IS NULL OR e.course_id = $3)
         ORDER BY e.enrolled_at DESC`,
        [req.user.id, peerId, courseId ?? null]
      );
      if (!courses[0]) {
        throw forbidden('You can only message instructors of courses you are enrolled in.');
      }
      contextCourse = courses[0];
      studentId = req.user.id;
      instructorId = peerId;
    } else {
      if (peer.role !== 'student') throw badRequest('Instructors can message their enrolled students.');
      const { rows: courses } = await query(
        `SELECT e.course_id, c.title
         FROM enrollments e
         JOIN courses c ON c.id = e.course_id
         WHERE e.user_id = $1 AND c.instructor_id = $2 AND e.status <> 'dropped'
           AND ($3::bigint IS NULL OR e.course_id = $3)
         ORDER BY e.enrolled_at DESC`,
        [peerId, req.user.id, courseId ?? null]
      );
      if (!courses[0] && req.user.role !== 'admin') {
        throw forbidden('You can only message students enrolled in your courses.');
      }
      contextCourse = courses[0] || null;
      studentId = peerId;
      instructorId = req.user.id;
    }

    const { rows: existing } = await query(
      `SELECT id FROM conversations WHERE student_id = $1 AND instructor_id = $2`,
      [studentId, instructorId]
    );
    if (existing[0]) {
      const conversation = await getConversationForUser(existing[0].id, req.user);
      return res.json({ conversation: serializeConversation(conversation, req.user.id), created: false });
    }

    const defaultSubject = contextCourse?.title ? `${contextCourse.title} support` : 'Learning support';
    const { rows } = await query(
      `INSERT INTO conversations (student_id, instructor_id, course_id, subject)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [studentId, instructorId, contextCourse?.course_id ?? null, subject || defaultSubject]
    );
    const conversation = await getConversationForUser(rows[0].id, req.user);
    res.status(201).json({ conversation: serializeConversation(conversation, req.user.id), created: true });
  })
);

router.get(
  '/conversations/:id',
  asyncHandler(async (req, res) => {
    const conversation = await getConversationForUser(req.params.id, req.user);
    res.json({ conversation: serializeConversation(conversation, req.user.id) });
  })
);

router.get(
  '/conversations/:id/messages',
  asyncHandler(async (req, res) => {
    const conversation = await getConversationForUser(req.params.id, req.user);

    // Opening or polling the thread marks incoming messages as read.
    await query(
      `UPDATE messages SET read_at = now()
       WHERE conversation_id = $1 AND sender_id <> $2 AND read_at IS NULL`,
      [conversation.id, req.user.id]
    );

    const after = Number(req.query.after) || 0;
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 200);
    const base = `SELECT m.id, m.conversation_id, m.sender_id, m.body,
                         m.attachment_path, m.attachment_name, m.attachment_mime, m.attachment_size,
                         m.read_at, m.created_at,
                         u.full_name AS sender_name, u.avatar_url AS sender_avatar, u.role AS sender_role
                  FROM messages m JOIN users u ON u.id = m.sender_id
                  WHERE m.conversation_id = $1`;

    let rows;
    if (after > 0) {
      ({ rows } = await query(`${base} AND m.id > $2 ORDER BY m.id ASC LIMIT $3`, [conversation.id, after, limit]));
    } else {
      ({ rows } = await query(
        `SELECT * FROM (
           ${base} ORDER BY m.id DESC LIMIT $2
         ) recent ORDER BY id ASC`,
        [conversation.id, limit]
      ));
    }

    res.json({
      conversation: serializeConversation(conversation, req.user.id),
      messages: rows,
    });
  })
);

const messageSchema = z.object({
  body: z.string().trim().max(5000, 'Messages must be at most 5000 characters.').default(''),
});

router.post(
  '/conversations/:id/messages',
  uploadMiddleware,
  asyncHandler(async (req, res) => {
    let conversation;
    try {
      conversation = await getConversationForUser(req.params.id, req.user);
    } catch (error) {
      removeUploadedFile(req.file);
      throw error;
    }
    const parsed = messageSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      removeUploadedFile(req.file);
      throw badRequest(parsed.error.issues[0]?.message || 'Invalid message.');
    }
    if (!parsed.data.body && !req.file) {
      removeUploadedFile(req.file);
      throw badRequest('Write a message or attach a document before sending.');
    }

    const recipientId =
      Number(conversation.student_id) === Number(req.user.id)
        ? conversation.instructor_id
        : conversation.student_id;

    let message;
    try {
      message = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO messages (conversation_id, sender_id, body, attachment_path, attachment_name,
             attachment_mime, attachment_size)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, conversation_id, sender_id, body, attachment_path, attachment_name,
                     attachment_mime, attachment_size, read_at, created_at`,
          [
            conversation.id,
            req.user.id,
            parsed.data.body,
            req.file ? `/uploads/${req.file.filename}` : null,
            req.file ? req.file.originalname.slice(0, 255) : null,
            req.file ? req.file.mimetype.slice(0, 150) : null,
            req.file ? req.file.size : null,
          ]
        );
        await client.query(
          `UPDATE conversations SET last_message_at = now(), updated_at = now() WHERE id = $1`,
          [conversation.id]
        );
        const preview = parsed.data.body
          ? parsed.data.body.slice(0, 120)
          : `Attachment: ${req.file.originalname}`.slice(0, 120);
        await notify(client, {
          userIds: [recipientId],
          type: 'message',
          title: `New message from ${req.user.full_name}`,
          body: preview,
          link:
            Number(conversation.student_id) === Number(recipientId)
              ? `/student/chat?conversation=${conversation.id}`
              : `/instructor/messages?conversation=${conversation.id}`,
        });
        await recordActivity(client, {
          userId: req.user.id,
          action: 'message.sent',
          entityType: 'conversation',
          entityId: conversation.id,
          metadata: { attachment: Boolean(req.file) },
        });
        return rows[0];
      });
    } catch (error) {
      removeUploadedFile(req.file);
      throw error;
    }

    emitNotifications([recipientId], {
      type: 'message',
      title: `New message from ${req.user.full_name}`,
      body: parsed.data.body ? parsed.data.body.slice(0, 120) : 'Sent an attachment',
      link:
        Number(conversation.student_id) === Number(recipientId)
          ? `/student/chat?conversation=${conversation.id}`
          : `/instructor/messages?conversation=${conversation.id}`,
      created_at: new Date().toISOString(),
    });

    res.status(201).json({ message });
  })
);

router.post(
  '/conversations/:id/read',
  asyncHandler(async (req, res) => {
    const conversation = await getConversationForUser(req.params.id, req.user);
    await query(
      `UPDATE messages SET read_at = now()
       WHERE conversation_id = $1 AND sender_id <> $2 AND read_at IS NULL`,
      [conversation.id, req.user.id]
    );
    res.json({ ok: true });
  })
);

export default router;
