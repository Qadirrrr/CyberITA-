-- Admin-managed lab servers and direct lab submissions.
--
-- Lab servers let an administrator register the Docker hosts that run student
-- containers and assign a specific host to each lab. Every student session is
-- still an isolated container; the assignment only decides *where* it runs.
--
-- Lab submissions are the "finished lab -> instructor -> admin record" trail:
-- a student uploads a completed session, the instructor of the lab's course
-- reviews it, and administrators keep a read-only record of every submission.

CREATE TABLE IF NOT EXISTS lab_servers (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  provider VARCHAR(32) NOT NULL DEFAULT 'docker',
  docker_host VARCHAR(500),
  location VARCHAR(160) NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  max_sessions INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS lab_servers_name_unique ON lab_servers (lower(name));
CREATE INDEX IF NOT EXISTS lab_servers_status_idx ON lab_servers (status);

ALTER TABLE labs
  ADD COLUMN IF NOT EXISTS lab_server_id BIGINT REFERENCES lab_servers(id) ON DELETE SET NULL;

ALTER TABLE lab_sessions
  ADD COLUMN IF NOT EXISTS lab_server_id BIGINT REFERENCES lab_servers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS labs_lab_server_idx ON labs (lab_server_id);
CREATE INDEX IF NOT EXISTS lab_sessions_lab_server_idx ON lab_sessions (lab_server_id);

CREATE TABLE IF NOT EXISTS lab_submissions (
  id BIGSERIAL PRIMARY KEY,
  lab_id BIGINT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  session_id BIGINT NOT NULL REFERENCES lab_sessions(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id BIGINT REFERENCES courses(id) ON DELETE SET NULL,
  instructor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'submitted',
  student_note TEXT NOT NULL DEFAULT '',
  attachment_path VARCHAR(255),
  attachment_name VARCHAR(255),
  attachment_mime VARCHAR(120),
  attachment_size INTEGER NOT NULL DEFAULT 0,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  instructor_feedback TEXT NOT NULL DEFAULT '',
  reviewed_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  admin_acknowledged_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  admin_acknowledged_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lab_submissions_status_check
    CHECK (status IN ('submitted', 'changes_requested', 'approved')),
  CONSTRAINT lab_submissions_session_unique UNIQUE (session_id)
);

CREATE INDEX IF NOT EXISTS lab_submissions_instructor_idx ON lab_submissions (instructor_id, status);
CREATE INDEX IF NOT EXISTS lab_submissions_course_idx ON lab_submissions (course_id);
CREATE INDEX IF NOT EXISTS lab_submissions_user_idx ON lab_submissions (user_id);
CREATE INDEX IF NOT EXISTS lab_submissions_lab_idx ON lab_submissions (lab_id);
