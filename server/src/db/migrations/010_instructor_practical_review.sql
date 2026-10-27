-- Practical review, grading rubric and instructor-authored report articles.

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS score NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS max_score NUMERIC(6, 2),
  ADD COLUMN IF NOT EXISTS rubric JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS solution_article TEXT NOT NULL DEFAULT '';

ALTER TABLE labs
  ADD COLUMN IF NOT EXISTS objectives TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS submission_requirements TEXT NOT NULL DEFAULT '';
