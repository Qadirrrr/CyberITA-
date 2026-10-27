-- ============================================================
-- Student <-> instructor messaging with optional attachments
-- ============================================================

CREATE TABLE conversations (
  id              BIGSERIAL PRIMARY KEY,
  student_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  instructor_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id       BIGINT REFERENCES courses(id) ON DELETE SET NULL,
  subject         VARCHAR(200) NOT NULL DEFAULT 'Course support',
  last_message_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT conversations_participants_distinct CHECK (student_id <> instructor_id)
);

-- One thread per student/instructor pair keeps the inbox easy to follow.
CREATE UNIQUE INDEX conversations_pair_key ON conversations (student_id, instructor_id);
CREATE INDEX conversations_student_idx ON conversations(student_id, last_message_at DESC);
CREATE INDEX conversations_instructor_idx ON conversations(instructor_id, last_message_at DESC);

CREATE TABLE messages (
  id              BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT NOT NULL DEFAULT '',
  attachment_path VARCHAR(500),
  attachment_name VARCHAR(255),
  attachment_mime VARCHAR(150),
  attachment_size INT,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT messages_body_or_attachment CHECK (length(trim(body)) > 0 OR attachment_path IS NOT NULL)
);

CREATE INDEX messages_conversation_idx ON messages(conversation_id, created_at);
CREATE INDEX messages_unread_idx ON messages(conversation_id, read_at) WHERE read_at IS NULL;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
