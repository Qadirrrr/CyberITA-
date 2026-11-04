-- ============================================================
-- Fix: moderator_assignments target columns
--
-- Migration 020 created moderator_assignments with a single instructor_id
-- column used for both "subject moderator -> instructor" and (incorrectly)
-- "senior moderator -> subject moderator". Those two targets live in different
-- tables (users vs moderators), so overloading one column broke the foreign
-- key: instructor_id references users(id) but a subject-moderator supervision
-- link must reference moderators(id).
--
-- This migration:
--   * adds a dedicated moderator_target_id referencing moderators(id)
--   * replaces the target CHECK to use the correct column per kind
--   * replaces the uniqueness index to cover the new column
--
-- The table is empty (the feature is not yet in use), so no rows are migrated.
-- No other table, column or data is touched.
-- ============================================================

ALTER TABLE moderator_assignments
  ADD COLUMN IF NOT EXISTS moderator_target_id BIGINT REFERENCES moderators(id) ON DELETE CASCADE;

ALTER TABLE moderator_assignments
  DROP CONSTRAINT IF EXISTS moderator_assignments_target_check;

ALTER TABLE moderator_assignments
  ADD CONSTRAINT moderator_assignments_target_check CHECK (
    -- senior moderator -> subject moderator (supervision target)
    (kind = 'subject_moderator' AND course_id IS NULL AND instructor_id IS NULL AND moderator_target_id IS NOT NULL) OR
    -- subject moderator -> course
    (kind = 'course'            AND course_id IS NOT NULL AND instructor_id IS NULL AND moderator_target_id IS NULL) OR
    -- subject moderator -> instructor
    (kind = 'instructor'        AND course_id IS NULL AND instructor_id IS NOT NULL AND moderator_target_id IS NULL) OR
    -- subject moderator -> subject label
    (kind = 'subject'           AND course_id IS NULL AND instructor_id IS NULL AND moderator_target_id IS NULL AND subject IS NOT NULL)
  );

DROP INDEX IF EXISTS moderator_assignments_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS moderator_assignments_unique_idx
  ON moderator_assignments (
    moderator_id, kind,
    COALESCE(course_id, 0),
    COALESCE(instructor_id, 0),
    COALESCE(moderator_target_id, 0),
    COALESCE(subject, '')
  );

CREATE INDEX IF NOT EXISTS moderator_assignments_target_idx
  ON moderator_assignments (moderator_target_id) WHERE moderator_target_id IS NOT NULL;
