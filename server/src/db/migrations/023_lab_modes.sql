-- Lab delivery modes
-- ------------------
-- Two ways to deliver a lab:
--   * practice : guided lab with steps, hints and automatic step verification.
--   * real     : question-only assessment. Learners see a task brief, solve the
--                challenge themselves and submit screenshot evidence for review.
--
-- `is_practice` keeps its original meaning (open to all learners, ungraded) and
-- is independent from `lab_mode`: a guided lab can be open to everyone, while a
-- real lab is always reviewed by an instructor.
--
-- Existing labs are guided labs, so the column default backfills them.

ALTER TABLE labs
  ADD COLUMN IF NOT EXISTS lab_mode VARCHAR(20) NOT NULL DEFAULT 'practice',
  ADD COLUMN IF NOT EXISTS task_brief TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS min_evidence INTEGER NOT NULL DEFAULT 1;

ALTER TABLE labs DROP CONSTRAINT IF EXISTS labs_lab_mode_check;
ALTER TABLE labs
  ADD CONSTRAINT labs_lab_mode_check CHECK (lab_mode IN ('practice', 'real'));

ALTER TABLE labs DROP CONSTRAINT IF EXISTS labs_min_evidence_check;
ALTER TABLE labs
  ADD CONSTRAINT labs_min_evidence_check CHECK (min_evidence BETWEEN 0 AND 20);

CREATE INDEX IF NOT EXISTS labs_lab_mode_idx ON labs(lab_mode);

UPDATE labs SET lab_mode = 'practice' WHERE lab_mode IS NULL;
