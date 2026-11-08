-- 025_lab_time_limits.sql
-- Per-lab time limits and the reason a lab session ended.

ALTER TABLE labs
  ADD COLUMN IF NOT EXISTS time_limit_minutes INT NOT NULL DEFAULT 0;

ALTER TABLE labs DROP CONSTRAINT IF EXISTS labs_time_limit_minutes_check;
ALTER TABLE labs
  ADD CONSTRAINT labs_time_limit_minutes_check CHECK (time_limit_minutes BETWEEN 0 AND 600);

CREATE INDEX IF NOT EXISTS labs_time_limit_idx ON labs(time_limit_minutes) WHERE time_limit_minutes > 0;

ALTER TABLE lab_sessions
  ADD COLUMN IF NOT EXISTS ended_reason VARCHAR(20);

ALTER TABLE lab_sessions DROP CONSTRAINT IF EXISTS lab_sessions_ended_reason_check;
ALTER TABLE lab_sessions
  ADD CONSTRAINT lab_sessions_ended_reason_check
  CHECK (ended_reason IS NULL OR ended_reason IN ('stopped', 'completed', 'expired', 'submitted', 'cleanup'));
