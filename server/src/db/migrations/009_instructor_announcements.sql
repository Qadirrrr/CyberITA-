-- ============================================================
-- Instructor announcements to enrolled learners
-- ============================================================

CREATE TABLE announcements (
  id              BIGSERIAL PRIMARY KEY,
  author_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id       BIGINT REFERENCES courses(id) ON DELETE SET NULL,
  title           VARCHAR(200) NOT NULL,
  body            TEXT NOT NULL DEFAULT '',
  link            VARCHAR(300),
  recipient_count INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX announcements_author_idx ON announcements(author_id, created_at DESC);
CREATE INDEX announcements_course_idx ON announcements(course_id);
