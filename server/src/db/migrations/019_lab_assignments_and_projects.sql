-- Lab-only learning model:
--   * labs become the single graded activity and can carry an optional deadline
--     ("lab assignment"),
--   * students can upload a project (capstone / portfolio work) for instructor
--     review, with the same review trail used by lab submissions.

ALTER TABLE labs
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS labs_due_at_idx ON labs (due_at) WHERE due_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS student_projects (
  id                    BIGSERIAL PRIMARY KEY,
  user_id               BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id             BIGINT REFERENCES courses(id) ON DELETE SET NULL,
  instructor_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
  title                 VARCHAR(200) NOT NULL,
  description           TEXT NOT NULL DEFAULT '',
  repo_url              VARCHAR(500),
  attachment_path       VARCHAR(255),
  attachment_name       VARCHAR(255),
  attachment_mime       VARCHAR(120),
  attachment_size       INTEGER NOT NULL DEFAULT 0,
  student_note          TEXT NOT NULL DEFAULT '',
  status                VARCHAR(24) NOT NULL DEFAULT 'submitted',
  instructor_feedback   TEXT NOT NULL DEFAULT '',
  reviewed_by           BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at           TIMESTAMPTZ,
  admin_acknowledged_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  admin_acknowledged_at TIMESTAMPTZ,
  submitted_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT student_projects_status_check
    CHECK (status IN ('draft', 'submitted', 'changes_requested', 'approved'))
);

CREATE INDEX IF NOT EXISTS student_projects_user_idx ON student_projects (user_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS student_projects_instructor_idx ON student_projects (instructor_id, status);
CREATE INDEX IF NOT EXISTS student_projects_course_idx ON student_projects (course_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at' AND tgrelid = 'student_projects'::regclass
  ) THEN
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON student_projects
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;
