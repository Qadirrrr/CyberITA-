-- Practice-mode labs
-- -------------------
-- A practice lab is a normal, real Docker lab that is used for free practice:
--   * it is not tied to a course (no enrollment requirement),
--   * it is not graded and needs no practical report,
--   * learners can start as many sessions as they like.
-- Nothing here is simulated: sessions still run in an isolated container.

ALTER TABLE labs
  ADD COLUMN IF NOT EXISTS is_practice BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS labs_practice_idx ON labs(is_practice) WHERE is_practice;
