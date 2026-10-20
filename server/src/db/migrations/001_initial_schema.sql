-- ============================================================
-- CyberITA+ initial schema (PostgreSQL 14+)
-- ============================================================

-- ---------- users / auth ----------
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     VARCHAR(120) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'student'
                CHECK (role IN ('admin', 'instructor', 'student')),
  headline      VARCHAR(160),
  bio           TEXT,
  avatar_url    VARCHAR(500),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_key ON users (LOWER(email));

CREATE TABLE refresh_tokens (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  user_agent  VARCHAR(300),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens(user_id);
CREATE INDEX refresh_tokens_hash_idx ON refresh_tokens(token_hash);

-- ---------- courses ----------
CREATE TABLE courses (
  id            BIGSERIAL PRIMARY KEY,
  slug          VARCHAR(160) NOT NULL UNIQUE,
  title         VARCHAR(200) NOT NULL,
  summary       VARCHAR(400) NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  category      VARCHAR(80) NOT NULL DEFAULT 'General',
  level         VARCHAR(20) NOT NULL DEFAULT 'beginner'
                CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  duration_hours NUMERIC(6,1) NOT NULL DEFAULT 0,
  price         NUMERIC(10,2) NOT NULL DEFAULT 0,
  cover_image   VARCHAR(500),
  status        VARCHAR(20) NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'published', 'archived')),
  instructor_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  tags          TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ
);
CREATE INDEX courses_status_idx ON courses(status);
CREATE INDEX courses_category_idx ON courses(category);

CREATE TABLE modules (
  id          BIGSERIAL PRIMARY KEY,
  course_id   BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  description TEXT,
  position    INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX modules_course_idx ON modules(course_id, position);

CREATE TABLE lessons (
  id              BIGSERIAL PRIMARY KEY,
  course_id       BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id       BIGINT REFERENCES modules(id) ON DELETE CASCADE,
  title           VARCHAR(200) NOT NULL,
  content         TEXT NOT NULL DEFAULT '',
  video_url       VARCHAR(500),
  duration_minutes INT NOT NULL DEFAULT 10,
  lesson_type     VARCHAR(20) NOT NULL DEFAULT 'reading'
                  CHECK (lesson_type IN ('reading', 'video', 'lab')),
  position        INT NOT NULL DEFAULT 0,
  is_free_preview BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lessons_course_idx ON lessons(course_id, position);
CREATE INDEX lessons_module_idx ON lessons(module_id, position);

-- ---------- enrollment & progress ----------
CREATE TABLE enrollments (
  id              BIGSERIAL PRIMARY KEY,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id       BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  status          VARCHAR(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'completed', 'dropped')),
  progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  UNIQUE (user_id, course_id)
);
CREATE INDEX enrollments_course_idx ON enrollments(course_id);

CREATE TABLE lesson_progress (
  id                BIGSERIAL PRIMARY KEY,
  user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id         BIGINT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  course_id         BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  status            VARCHAR(20) NOT NULL DEFAULT 'in_progress'
                    CHECK (status IN ('in_progress', 'completed')),
  time_spent_seconds INT NOT NULL DEFAULT 0,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, lesson_id)
);
CREATE INDEX lesson_progress_course_idx ON lesson_progress(course_id, user_id);

-- ---------- quizzes ----------
CREATE TABLE quizzes (
  id            BIGSERIAL PRIMARY KEY,
  course_id     BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id     BIGINT REFERENCES lessons(id) ON DELETE CASCADE,
  title         VARCHAR(200) NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  pass_score    NUMERIC(5,2) NOT NULL DEFAULT 60,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX quizzes_course_idx ON quizzes(course_id);
CREATE INDEX quizzes_lesson_idx ON quizzes(lesson_id);

CREATE TABLE quiz_questions (
  id              BIGSERIAL PRIMARY KEY,
  quiz_id         BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  position        INT NOT NULL DEFAULT 0,
  question        TEXT NOT NULL,
  type            VARCHAR(20) NOT NULL DEFAULT 'mcq'
                  CHECK (type IN ('mcq', 'true_false')),
  options         JSONB NOT NULL DEFAULT '[]',
  correct_option  INT NOT NULL,
  explanation     TEXT,
  points          INT NOT NULL DEFAULT 1
);
CREATE INDEX quiz_questions_quiz_idx ON quiz_questions(quiz_id, position);

CREATE TABLE quiz_attempts (
  id             BIGSERIAL PRIMARY KEY,
  quiz_id        BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  user_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score          NUMERIC(6,2) NOT NULL DEFAULT 0,
  max_points     NUMERIC(6,2) NOT NULL DEFAULT 0,
  passed         BOOLEAN NOT NULL DEFAULT FALSE,
  answers        JSONB NOT NULL DEFAULT '[]',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX quiz_attempts_user_quiz_idx ON quiz_attempts(user_id, quiz_id);

-- ---------- assignments ----------
CREATE TABLE assignments (
  id          BIGSERIAL PRIMARY KEY,
  course_id   BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id   BIGINT REFERENCES lessons(id) ON DELETE CASCADE,
  title       VARCHAR(200) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  due_at      TIMESTAMPTZ,
  points      INT NOT NULL DEFAULT 100,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX assignments_course_idx ON assignments(course_id);

CREATE TABLE assignment_submissions (
  id            BIGSERIAL PRIMARY KEY,
  assignment_id BIGINT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content       TEXT NOT NULL DEFAULT '',
  file_path     VARCHAR(500),
  status        VARCHAR(20) NOT NULL DEFAULT 'submitted'
                CHECK (status IN ('submitted', 'graded', 'returned')),
  grade         NUMERIC(6,2),
  feedback      TEXT,
  grader_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  graded_at     TIMESTAMPTZ,
  UNIQUE (assignment_id, user_id)
);

-- ---------- labs ----------
CREATE TABLE labs (
  id                 BIGSERIAL PRIMARY KEY,
  slug               VARCHAR(160) NOT NULL UNIQUE,
  course_id          BIGINT REFERENCES courses(id) ON DELETE CASCADE,
  lesson_id          BIGINT REFERENCES lessons(id) ON DELETE CASCADE,
  title              VARCHAR(200) NOT NULL,
  summary            VARCHAR(400) NOT NULL DEFAULT '',
  description        TEXT NOT NULL DEFAULT '',
  difficulty         VARCHAR(20) NOT NULL DEFAULT 'beginner'
                     CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  estimated_minutes  INT NOT NULL DEFAULT 30,
  provider_hint      VARCHAR(30) NOT NULL DEFAULT 'mock',
  terminal_welcome   TEXT NOT NULL DEFAULT 'Welcome to your CyberITA+ lab environment.',
  initial_files      JSONB NOT NULL DEFAULT '{}',
  initial_cwd        VARCHAR(300) NOT NULL DEFAULT '/home/student',
  status             VARCHAR(20) NOT NULL DEFAULT 'published'
                     CHECK (status IN ('draft', 'published')),
  created_by         BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX labs_course_idx ON labs(course_id);
CREATE INDEX labs_lesson_idx ON labs(lesson_id);

CREATE TABLE lab_steps (
  id                   BIGSERIAL PRIMARY KEY,
  lab_id               BIGINT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  position             INT NOT NULL DEFAULT 0,
  title                VARCHAR(200) NOT NULL,
  instruction          TEXT NOT NULL,
  hint                 TEXT,
  verification         VARCHAR(20) NOT NULL DEFAULT 'command'
                       CHECK (verification IN ('command', 'output', 'manual')),
  expected_command     TEXT,
  expected_output_pattern TEXT,
  points               INT NOT NULL DEFAULT 10,
  is_optional          BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX lab_steps_lab_idx ON lab_steps(lab_id, position);

CREATE TABLE lab_sessions (
  id               BIGSERIAL PRIMARY KEY,
  lab_id           BIGINT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  user_id          BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider         VARCHAR(30) NOT NULL DEFAULT 'mock',
  instance_id      VARCHAR(80),
  status           VARCHAR(20) NOT NULL DEFAULT 'running'
                   CHECK (status IN ('provisioning', 'running', 'stopped', 'error')),
  history          JSONB NOT NULL DEFAULT '[]',
  fs_state         JSONB NOT NULL DEFAULT '{}',
  cwd              VARCHAR(300) NOT NULL DEFAULT '/home/student',
  started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at         TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lab_sessions_user_idx ON lab_sessions(user_id, lab_id);
CREATE INDEX lab_sessions_status_idx ON lab_sessions(status);

CREATE TABLE lab_step_progress (
  id             BIGSERIAL PRIMARY KEY,
  session_id     BIGINT NOT NULL REFERENCES lab_sessions(id) ON DELETE CASCADE,
  step_id        BIGINT NOT NULL REFERENCES lab_steps(id) ON DELETE CASCADE,
  status         VARCHAR(20) NOT NULL DEFAULT 'completed'
                 CHECK (status IN ('completed')),
  command_used   VARCHAR(500),
  output_excerpt TEXT,
  completed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, step_id)
);

CREATE TABLE screenshots (
  id            BIGSERIAL PRIMARY KEY,
  session_id    BIGINT NOT NULL REFERENCES lab_sessions(id) ON DELETE CASCADE,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  step_id       BIGINT REFERENCES lab_steps(id) ON DELETE SET NULL,
  file_path     VARCHAR(500) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type     VARCHAR(100) NOT NULL,
  size_bytes    INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX screenshots_session_idx ON screenshots(session_id);

-- ---------- practical reports ----------
CREATE TABLE reports (
  id                 BIGSERIAL PRIMARY KEY,
  session_id         BIGINT NOT NULL UNIQUE REFERENCES lab_sessions(id) ON DELETE CASCADE,
  lab_id             BIGINT NOT NULL REFERENCES labs(id) ON DELETE CASCADE,
  user_id            BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title              VARCHAR(220) NOT NULL,
  summary            TEXT NOT NULL DEFAULT '',
  content            TEXT NOT NULL DEFAULT '',
  sections           JSONB NOT NULL DEFAULT '[]',
  status             VARCHAR(20) NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'published')),
  instructor_feedback TEXT,
  reviewed_by        BIGINT REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at        TIMESTAMPTZ,
  published_post_id  BIGINT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reports_user_idx ON reports(user_id);
CREATE INDEX reports_status_idx ON reports(status);

-- ---------- blog ----------
CREATE TABLE posts (
  id              BIGSERIAL PRIMARY KEY,
  slug            VARCHAR(220) NOT NULL UNIQUE,
  title           VARCHAR(240) NOT NULL,
  excerpt         VARCHAR(400) NOT NULL DEFAULT '',
  content         TEXT NOT NULL DEFAULT '',
  cover_image     VARCHAR(500),
  author_id       BIGINT REFERENCES users(id) ON DELETE SET NULL,
  source_report_id BIGINT REFERENCES reports(id) ON DELETE SET NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'published')),
  tags            TEXT[] NOT NULL DEFAULT '{}',
  view_count      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at    TIMESTAMPTZ
);
CREATE INDEX posts_status_idx ON posts(status, published_at DESC);
CREATE INDEX posts_author_idx ON posts(author_id);

ALTER TABLE reports
  ADD CONSTRAINT reports_published_post_fk
  FOREIGN KEY (published_post_id) REFERENCES posts(id) ON DELETE SET NULL;

-- ---------- learning paths ----------
CREATE TABLE learning_paths (
  id          BIGSERIAL PRIMARY KEY,
  slug        VARCHAR(160) NOT NULL UNIQUE,
  title       VARCHAR(200) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  level       VARCHAR(20) NOT NULL DEFAULT 'beginner'
              CHECK (level IN ('beginner', 'intermediate', 'advanced')),
  cover_image VARCHAR(500),
  status      VARCHAR(20) NOT NULL DEFAULT 'published'
              CHECK (status IN ('draft', 'published')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE learning_path_courses (
  path_id   BIGINT NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  position  INT NOT NULL DEFAULT 0,
  PRIMARY KEY (path_id, course_id)
);

-- ---------- certificates ----------
CREATE TABLE certificates (
  id              BIGSERIAL PRIMARY KEY,
  serial          VARCHAR(40) NOT NULL UNIQUE,
  user_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id       BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  final_progress  NUMERIC(5,2) NOT NULL DEFAULT 100,
  issued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id)
);

-- ---------- notifications / activity ----------
CREATE TABLE notifications (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       VARCHAR(40) NOT NULL DEFAULT 'info',
  title      VARCHAR(200) NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  link       VARCHAR(300),
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications(user_id, created_at DESC);

CREATE TABLE activity_events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action      VARCHAR(60) NOT NULL,
  entity_type VARCHAR(40),
  entity_id   BIGINT,
  metadata    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX activity_user_idx ON activity_events(user_id, created_at DESC);

-- ---------- contact ----------
CREATE TABLE contact_messages (
  id         BIGSERIAL PRIMARY KEY,
  name       VARCHAR(120) NOT NULL,
  email      VARCHAR(255) NOT NULL,
  subject    VARCHAR(200) NOT NULL,
  message    TEXT NOT NULL,
  status     VARCHAR(20) NOT NULL DEFAULT 'new'
             CHECK (status IN ('new', 'read', 'replied')),
  handled_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  handled_at TIMESTAMPTZ
);

-- ---------- helpers ----------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users', 'courses', 'lessons', 'quizzes', 'assignments',
    'labs', 'lab_sessions', 'reports', 'posts', 'learning_paths'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t);
  END LOOP;
END;
$$;
