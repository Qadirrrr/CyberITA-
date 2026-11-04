-- ============================================================
-- Hierarchical Moderator Management System
--   Admin -> Senior Moderator -> Subject/Course Moderator -> Instructors
--
-- Purely additive: widens the users.role CHECK constraint so the two new
-- moderation roles can exist, then adds three new tables. No existing table,
-- column, row or constraint is dropped or rewritten beyond that CHECK list.
-- ============================================================

-- ---------- 1. allow the two moderator roles ----------
-- The original constraint (001_initial_schema.sql) only permits
-- ('admin','instructor','student'). It is widened, never narrowed: every value
-- that was valid before is still valid, so no existing user row is affected.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('admin', 'instructor', 'student', 'senior_moderator', 'subject_moderator'));

-- ---------- 2. moderator profiles ----------
-- One row per moderator account. `tier` mirrors users.role but lives here so
-- moderation scope can be queried without touching the auth-critical users table.
CREATE TABLE IF NOT EXISTS moderators (
  id            BIGSERIAL PRIMARY KEY,
  user_id       BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  tier          VARCHAR(24) NOT NULL
                CHECK (tier IN ('senior_moderator', 'subject_moderator')),
  display_name  VARCHAR(160),
  notes         TEXT NOT NULL DEFAULT '',
  status        VARCHAR(16) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'suspended')),
  created_by    BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moderators_tier_idx ON moderators (tier, status);

-- ---------- 3. assignment links ----------
-- Flexible many-to-many support:
--   * senior -> subject_moderator (supervision)
--   * subject_moderator -> course
--   * subject_moderator -> instructor
--   * subject moderator -> subject label (category/subcategory string)
CREATE TABLE IF NOT EXISTS moderator_assignments (
  id            BIGSERIAL PRIMARY KEY,
  moderator_id  BIGINT NOT NULL REFERENCES moderators(id) ON DELETE CASCADE,
  kind          VARCHAR(24) NOT NULL
                CHECK (kind IN ('subject_moderator', 'course', 'instructor', 'subject')),
  course_id     BIGINT REFERENCES courses(id) ON DELETE CASCADE,
  instructor_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  subject       VARCHAR(120),
  assigned_by   BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Each kind needs exactly the right target column populated.
  CONSTRAINT moderator_assignments_target_check CHECK (
    (kind = 'subject_moderator' AND course_id IS NULL AND instructor_id IS NULL) OR
    (kind = 'course'           AND course_id IS NOT NULL AND instructor_id IS NULL) OR
    (kind = 'instructor'       AND course_id IS NULL AND instructor_id IS NOT NULL) OR
    (kind = 'subject'          AND course_id IS NULL AND instructor_id IS NULL AND subject IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS moderator_assignments_moderator_idx ON moderator_assignments (moderator_id, kind);
CREATE INDEX IF NOT EXISTS moderator_assignments_course_idx ON moderator_assignments (course_id) WHERE course_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS moderator_assignments_instructor_idx ON moderator_assignments (instructor_id) WHERE instructor_id IS NOT NULL;
-- A moderator cannot be linked to the same target twice.
CREATE UNIQUE INDEX IF NOT EXISTS moderator_assignments_unique_idx
  ON moderator_assignments (
    moderator_id, kind,
    COALESCE(course_id, 0),
    COALESCE(instructor_id, 0),
    COALESCE(subject, '')
  );

-- ---------- 4. complaints / reports / escalations ----------
CREATE TABLE IF NOT EXISTS moderation_reports (
  id                 BIGSERIAL PRIMARY KEY,
  reporter_id        BIGINT REFERENCES users(id) ON DELETE SET NULL,
  subject_moderator_id BIGINT REFERENCES moderators(id) ON DELETE SET NULL,
  course_id          BIGINT REFERENCES courses(id) ON DELETE SET NULL,
  instructor_id      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  student_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
  title              VARCHAR(220) NOT NULL,
  body               TEXT NOT NULL DEFAULT '',
  kind               VARCHAR(24) NOT NULL DEFAULT 'complaint'
                     CHECK (kind IN ('complaint', 'content_quality', 'moderation_task', 'escalation')),
  severity           VARCHAR(16) NOT NULL DEFAULT 'normal'
                     CHECK (severity IN ('low', 'normal', 'high', 'urgent')),
  status             VARCHAR(20) NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'in_review', 'escalated', 'resolved', 'dismissed')),
  escalated_to       BIGINT REFERENCES moderators(id) ON DELETE SET NULL,
  escalated_at       TIMESTAMPTZ,
  resolution         TEXT NOT NULL DEFAULT '',
  resolved_by        BIGINT REFERENCES users(id) ON DELETE SET NULL,
  resolved_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS moderation_reports_status_idx ON moderation_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS moderation_reports_moderator_idx ON moderation_reports (subject_moderator_id, status);
CREATE INDEX IF NOT EXISTS moderation_reports_course_idx ON moderation_reports (course_id);
CREATE INDEX IF NOT EXISTS moderation_reports_escalated_idx ON moderation_reports (escalated_to, status);

-- ---------- 5. updated_at triggers (reuse the existing helper) ----------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at' AND tgrelid = 'moderators'::regclass
  ) THEN
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON moderators
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'set_updated_at' AND tgrelid = 'moderation_reports'::regclass
  ) THEN
    CREATE TRIGGER set_updated_at BEFORE UPDATE ON moderation_reports
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END;
$$;
