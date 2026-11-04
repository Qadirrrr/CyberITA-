-- ============================================================
-- Fix: moderator_assignments target rule
--
-- Migration 020 already created the table, but its target CHECK was too strict
-- for the 'subject_moderator' kind. A senior moderator's supervision link
-- stores the supervised *moderator* id in the instructor_id column, which the
-- original constraint wrongly required to be NULL.
--
-- This migration only replaces that single CHECK constraint. The table is still
-- empty at this point (the feature is not in use yet), so no rows are affected.
-- No other table, column or data is touched.
-- ============================================================

ALTER TABLE moderator_assignments
  DROP CONSTRAINT IF EXISTS moderator_assignments_target_check;

ALTER TABLE moderator_assignments
  ADD CONSTRAINT moderator_assignments_target_check CHECK (
    -- senior moderator -> subject moderator (id kept in instructor_id)
    (kind = 'subject_moderator' AND course_id IS NULL AND instructor_id IS NOT NULL) OR
    -- subject moderator -> course
    (kind = 'course'            AND course_id IS NOT NULL AND instructor_id IS NULL) OR
    -- subject moderator -> instructor
    (kind = 'instructor'        AND course_id IS NULL AND instructor_id IS NOT NULL) OR
    -- subject moderator -> subject label
    (kind = 'subject'           AND course_id IS NULL AND instructor_id IS NULL AND subject IS NOT NULL)
  );
